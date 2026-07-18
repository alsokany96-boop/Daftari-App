"""Daftari iteration_8 backend tests.

Covers admin-editable subscription price + free tier limit:
  * GET /api/config (public) returns current values
  * GET /api/admin/config: super_admin 200, owner 403
  * PUT /api/admin/config: valid update, single-field update, empty body,
    invalid values (negative price, zero limit), non-super-admin caller
  * Dynamic lock behavior when free_tier_limit changes
Restores price=20 and limit=10 at the end and cleans up v8_* users.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN = "admin"
ADMIN_PW = "admin1234"
TESTUSER = "testuser"
TESTUSER_PW = "test1234"

DEFAULT_PRICE = 20.0
DEFAULT_LIMIT = 10


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": ADMIN, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def testuser_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _put_cfg(s, admin_tok, body):
    return s.put(f"{API}/admin/config", headers=H(admin_tok), json=body)


def _reset_defaults(s, admin_tok):
    r = _put_cfg(
        s, admin_tok, {"subscription_price": DEFAULT_PRICE, "free_tier_limit": DEFAULT_LIMIT}
    )
    assert r.status_code == 200, r.text


# ============ 1. Public GET /api/config ============
class TestPublicConfig:
    def test_get_public_config_before_any_update(self, s, admin_tok, mongo):
        # Wipe any pre-existing config to test the auto-default path.
        mongo.app_config.delete_many({})
        r = s.get(f"{API}/config")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["subscription_price"] == DEFAULT_PRICE
        assert body["free_tier_limit"] == DEFAULT_LIMIT
        assert "admin_phone" in body
        assert "admin_whatsapp" in body

    def test_reads_from_app_config_collection_after_update(self, s, admin_tok):
        r = _put_cfg(s, admin_tok, {"subscription_price": 33, "free_tier_limit": 7})
        assert r.status_code == 200
        r2 = s.get(f"{API}/config")
        assert r2.status_code == 200
        b = r2.json()
        assert b["subscription_price"] == 33
        assert b["free_tier_limit"] == 7
        # restore defaults for the rest of the module
        _reset_defaults(s, admin_tok)


# ============ 2. GET /api/admin/config RBAC ============
class TestAdminGetConfig:
    def test_admin_gets_config(self, s, admin_tok):
        r = s.get(f"{API}/admin/config", headers=H(admin_tok))
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("subscription_price", "free_tier_limit", "admin_phone", "admin_whatsapp"):
            assert k in b

    def test_owner_forbidden(self, s, testuser_tok):
        r = s.get(f"{API}/admin/config", headers=H(testuser_tok))
        assert r.status_code == 403, r.text

    def test_unauth_401(self, s):
        r = s.get(f"{API}/admin/config")
        assert r.status_code == 401


# ============ 3. PUT /api/admin/config ============
class TestAdminUpdateConfig:
    def test_valid_full_update(self, s, admin_tok):
        r = _put_cfg(s, admin_tok, {"subscription_price": 25, "free_tier_limit": 15})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subscription_price"] == 25
        assert b["free_tier_limit"] == 15
        # Public GET reflects
        p = s.get(f"{API}/config").json()
        assert p["subscription_price"] == 25
        assert p["free_tier_limit"] == 15

    def test_partial_price_preserves_limit(self, s, admin_tok):
        # Set a baseline
        _put_cfg(s, admin_tok, {"subscription_price": 25, "free_tier_limit": 15})
        r = _put_cfg(s, admin_tok, {"subscription_price": 40})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subscription_price"] == 40
        assert b["free_tier_limit"] == 15  # untouched

    def test_partial_limit_preserves_price(self, s, admin_tok):
        _put_cfg(s, admin_tok, {"subscription_price": 40, "free_tier_limit": 15})
        r = _put_cfg(s, admin_tok, {"free_tier_limit": 8})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subscription_price"] == 40
        assert b["free_tier_limit"] == 8

    def test_empty_body_400(self, s, admin_tok):
        r = _put_cfg(s, admin_tok, {})
        assert r.status_code == 400, r.text
        assert "لا توجد تغييرات" in r.json().get("detail", "")

    def test_negative_price_400(self, s, admin_tok):
        r = _put_cfg(s, admin_tok, {"subscription_price": -1})
        assert r.status_code == 400, r.text
        assert "سالبة" in r.json().get("detail", "")

    def test_zero_limit_400(self, s, admin_tok):
        r = _put_cfg(s, admin_tok, {"free_tier_limit": 0})
        assert r.status_code == 400, r.text

    def test_owner_put_forbidden(self, s, testuser_tok):
        r = s.put(
            f"{API}/admin/config", headers=H(testuser_tok),
            json={"subscription_price": 22}
        )
        assert r.status_code == 403, r.text


# ============ 4. Dynamic lock behavior (the critical bit) ============
class TestDynamicLock:
    """Register v8_lock_test, insert 5 customers, then flip free_tier_limit and
    verify /auth/me reflects the lock state live."""

    OWNER_ID = None
    STORE_ID = None
    TOKEN = None
    USERNAME = f"v8_lock_test_{uuid.uuid4().hex[:6]}"

    def test_register_fresh_owner(self, s, mongo):
        reg = s.post(
            f"{API}/auth/register",
            json={"username": self.__class__.USERNAME, "password": "pw1234", "shop_name": "lockshop"},
        )
        assert reg.status_code == 200, reg.text
        body = reg.json()
        self.__class__.TOKEN = body["access_token"]
        self.__class__.OWNER_ID = body["user"]["id"]
        # Fetch default store
        stores = s.get(f"{API}/stores", headers=H(self.__class__.TOKEN)).json()
        assert len(stores) >= 1
        self.__class__.STORE_ID = stores[0]["id"]

    def test_seed_5_customers_and_lock_at_limit_5(self, s, admin_tok, mongo):
        # Set free_tier_limit = 5
        r = _put_cfg(s, admin_tok, {"free_tier_limit": 5})
        assert r.status_code == 200, r.text
        assert r.json()["free_tier_limit"] == 5

        # Insert 5 customers directly into Mongo
        now = datetime.now(timezone.utc).isoformat()
        docs = [
            {
                "id": str(uuid.uuid4()),
                "owner_id": self.__class__.OWNER_ID,
                "store_id": self.__class__.STORE_ID,
                "party_type": "customer",
                "name": f"v8lockcust_{i}",
                "phone": "000",
                "max_debt": None,
                "created_at": now,
            }
            for i in range(5)
        ]
        mongo.customers.insert_many(docs)

        # /auth/me shows locked
        me = s.get(f"{API}/auth/me", headers=H(self.__class__.TOKEN)).json()
        assert me["customer_count"] == 5
        assert me["free_tier_limit"] == 5
        assert me["is_locked"] is True
        assert me["is_active"] is False

        # POST /customers should be 403 (locked)
        blocked = s.post(
            f"{API}/customers",
            headers=H(self.__class__.TOKEN),
            json={"name": "extra", "phone": "0", "party_type": "customer", "store_id": self.__class__.STORE_ID},
        )
        assert blocked.status_code == 403, blocked.text

    def test_raise_limit_to_10_unlocks(self, s, admin_tok):
        r = _put_cfg(s, admin_tok, {"free_tier_limit": 10})
        assert r.status_code == 200, r.text
        me = s.get(f"{API}/auth/me", headers=H(self.__class__.TOKEN)).json()
        assert me["free_tier_limit"] == 10
        assert me["customer_count"] == 5
        assert me["is_locked"] is False
        assert me["is_active"] is True

    def test_drop_limit_to_3_relocks(self, s, admin_tok):
        r = _put_cfg(s, admin_tok, {"free_tier_limit": 3})
        assert r.status_code == 200, r.text
        me = s.get(f"{API}/auth/me", headers=H(self.__class__.TOKEN)).json()
        assert me["free_tier_limit"] == 3
        assert me["customer_count"] == 5
        assert me["is_locked"] is True
        assert me["is_active"] is False


# ============ 5. Restore defaults + cleanup ============
class TestZZZRestore:
    def test_restore_defaults(self, s, admin_tok):
        r = _put_cfg(
            s, admin_tok, {"subscription_price": DEFAULT_PRICE, "free_tier_limit": DEFAULT_LIMIT}
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["subscription_price"] == DEFAULT_PRICE
        assert b["free_tier_limit"] == DEFAULT_LIMIT

    def test_cleanup_v8_users(self, mongo):
        v8 = list(mongo.users.find({"username": {"$regex": "^v8_"}}, {"id": 1, "_id": 0}))
        ids = [u["id"] for u in v8]
        if ids:
            mongo.customers.delete_many({"owner_id": {"$in": ids}})
            mongo.transactions.delete_many({"owner_id": {"$in": ids}})
            mongo.stores.delete_many({"owner_id": {"$in": ids}})
            mongo.settings.delete_many({"owner_id": {"$in": ids}})
            mongo.users.delete_many({"id": {"$in": ids}})
        assert mongo.users.count_documents({"username": {"$regex": "^v8_"}}) == 0
