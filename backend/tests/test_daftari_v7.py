"""Daftari iteration_7 backend tests.

Covers:
  * PUT /api/auth/profile — self-service shop_name/phone update
  * Locked owner can still update profile (uses get_current_user)
  * Empty / whitespace → null
  * Missing Authorization → 401
  * Regression: admin activate/extend/deactivate still work
  * Regression: login/auth/me/customers still return the new fields
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

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


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_login(s):
    r = s.post(f"{API}/auth/login", json={"username": ADMIN, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_tok(admin_login):
    return admin_login["access_token"]


@pytest.fixture(scope="module")
def admin_original(mongo):
    """Snapshot admin's shop_name/phone before mutation so we can restore."""
    u = mongo.users.find_one({"username": ADMIN}, {"_id": 0, "shop_name": 1, "phone": 1})
    return {"shop_name": u.get("shop_name") if u else None, "phone": u.get("phone") if u else None}


@pytest.fixture(scope="module")
def testuser_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def testuser_original(mongo):
    u = mongo.users.find_one({"username": TESTUSER}, {"_id": 0, "shop_name": 1, "phone": 1})
    return {"shop_name": u.get("shop_name") if u else None, "phone": u.get("phone") if u else None}


# ============ 1. PUT /api/auth/profile ============
class TestProfileUpdate:
    def test_admin_updates_own_profile(self, s, admin_tok, mongo):
        payload = {"shop_name": "مشرف دفتري", "phone": "0926609606"}
        r = s.put(f"{API}/auth/profile", headers=H(admin_tok), json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["shop_name"] == "مشرف دفتري"
        assert body["phone"] == "0926609606"
        assert body["username"] == ADMIN
        assert body["role"] == "super_admin"
        # required fields still present
        for k in ("id", "is_active", "customer_count", "is_locked", "free_tier_limit"):
            assert k in body

        # Persisted in Mongo
        doc = mongo.users.find_one({"username": ADMIN}, {"_id": 0})
        assert doc["shop_name"] == "مشرف دفتري"
        assert doc["phone"] == "0926609606"

    def test_me_reflects_updated_admin_profile(self, s, admin_tok):
        r = s.get(f"{API}/auth/me", headers=H(admin_tok))
        assert r.status_code == 200
        me = r.json()
        assert me["shop_name"] == "مشرف دفتري"
        assert me["phone"] == "0926609606"

    def test_testuser_updates_own_profile(self, s, testuser_tok, mongo):
        payload = {"shop_name": "دكان الاختبار v7", "phone": "0911111111"}
        r = s.put(f"{API}/auth/profile", headers=H(testuser_tok), json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["shop_name"] == "دكان الاختبار v7"
        assert body["phone"] == "0911111111"
        assert body["username"] == TESTUSER

        doc = mongo.users.find_one({"username": TESTUSER}, {"_id": 0})
        assert doc["shop_name"] == "دكان الاختبار v7"
        assert doc["phone"] == "0911111111"

    def test_whitespace_clears_to_null(self, s, testuser_tok, mongo):
        # shop_name only cleared
        r = s.put(
            f"{API}/auth/profile",
            headers=H(testuser_tok),
            json={"shop_name": "   ", "phone": "0911111111"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["shop_name"] is None
        assert body["phone"] == "0911111111"

        # empty string clears phone
        r = s.put(
            f"{API}/auth/profile",
            headers=H(testuser_tok),
            json={"shop_name": "دكان الاختبار v7", "phone": ""},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["shop_name"] == "دكان الاختبار v7"
        assert body["phone"] is None

    def test_missing_authorization_returns_401(self, s):
        r = s.put(f"{API}/auth/profile", json={"shop_name": "x"})
        assert r.status_code == 401, r.text

    def test_locked_owner_can_still_update_profile(self, s, mongo):
        # Create locked owner via direct Mongo manipulation (fast path)
        uname = f"v7_locked_{uuid.uuid4().hex[:6]}"
        reg = s.post(
            f"{API}/auth/register",
            json={"username": uname, "password": "pw1234", "shop_name": "old"},
        )
        assert reg.status_code == 200, reg.text
        tok = reg.json()["access_token"]
        uid = reg.json()["user"]["id"]

        # Fetch the auto-created default store
        stores = s.get(f"{API}/stores", headers=H(tok)).json()
        sid = stores[0]["id"]

        # Inject 10 customers directly in Mongo (no subscription) to trigger lock
        now = datetime.now(timezone.utc).isoformat()
        docs = [
            {
                "id": str(uuid.uuid4()),
                "owner_id": uid,
                "store_id": sid,
                "party_type": "customer",
                "name": f"lockcust_{i}",
                "phone": "000",
                "max_debt": None,
                "created_at": now,
            }
            for i in range(10)
        ]
        mongo.customers.insert_many(docs)

        # Confirm the user is locked via /auth/me
        me = s.get(f"{API}/auth/me", headers=H(tok)).json()
        assert me["is_locked"] is True
        assert me["is_active"] is False

        # A protected endpoint (require_active_user) should now 403
        blocked = s.post(
            f"{API}/customers",
            headers=H(tok),
            json={"name": "extra", "phone": "0", "party_type": "customer", "store_id": sid},
        )
        assert blocked.status_code == 403

        # But PUT /auth/profile MUST still succeed
        r = s.put(
            f"{API}/auth/profile",
            headers=H(tok),
            json={"shop_name": "locked-but-editable", "phone": "0999999999"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["shop_name"] == "locked-but-editable"
        assert body["phone"] == "0999999999"
        assert body["is_locked"] is True  # still locked; only profile edited

        # Cleanup
        mongo.customers.delete_many({"owner_id": uid})
        mongo.stores.delete_many({"owner_id": uid})
        mongo.users.delete_one({"id": uid})


# ============ 2. Regression: admin ops ============
class TestAdminOpsRegression:
    def test_activate_extend_deactivate(self, s, admin_tok, mongo):
        uname = f"v7_regr_{uuid.uuid4().hex[:6]}"
        reg = s.post(f"{API}/auth/register", json={"username": uname, "password": "pw1234"})
        assert reg.status_code == 200
        uid = reg.json()["user"]["id"]

        r = s.put(f"{API}/admin/users/{uid}/activate", headers=H(admin_tok))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["is_active"] is True
        assert b["subscription_expires_at"]
        first_exp = datetime.fromisoformat(b["subscription_expires_at"])

        r = s.put(f"{API}/admin/users/{uid}/extend", headers=H(admin_tok), json={"days": 30})
        assert r.status_code == 200, r.text
        new_exp = datetime.fromisoformat(r.json()["subscription_expires_at"])
        assert (new_exp - first_exp) >= timedelta(days=29)

        r = s.put(f"{API}/admin/users/{uid}/deactivate", headers=H(admin_tok))
        assert r.status_code == 200, r.text
        assert r.json()["subscription_expires_at"] in (None, "")

        mongo.users.delete_one({"id": uid})
        mongo.stores.delete_many({"owner_id": uid})


# ============ 3. Regression: existing endpoints ============
class TestExistingRegression:
    def test_login_returns_new_fields(self, s):
        r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        assert r.status_code == 200
        u = r.json()["user"]
        for k in ("subscription_expires_at", "customer_count", "is_locked", "free_tier_limit", "shop_name", "phone"):
            assert k in u

    def test_me_returns_new_fields(self, s, testuser_tok):
        r = s.get(f"{API}/auth/me", headers=H(testuser_tok))
        assert r.status_code == 200
        u = r.json()
        for k in ("subscription_expires_at", "customer_count", "is_locked", "free_tier_limit", "shop_name", "phone"):
            assert k in u

    def test_customers_listing_works(self, s, testuser_tok):
        r = s.get(f"{API}/customers", headers=H(testuser_tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============ 4. Restore admin's/testuser's original profile ============
class TestZZZRestore:
    def test_restore_admin(self, s, admin_tok, admin_original, mongo):
        r = s.put(
            f"{API}/auth/profile",
            headers=H(admin_tok),
            json={
                "shop_name": admin_original["shop_name"] or "",
                "phone": admin_original["phone"] or "",
            },
        )
        assert r.status_code == 200, r.text
        doc = mongo.users.find_one({"username": ADMIN}, {"_id": 0, "shop_name": 1, "phone": 1})
        assert (doc.get("shop_name") or None) == admin_original["shop_name"]
        assert (doc.get("phone") or None) == admin_original["phone"]

    def test_restore_testuser(self, s, testuser_tok, testuser_original, mongo):
        r = s.put(
            f"{API}/auth/profile",
            headers=H(testuser_tok),
            json={
                "shop_name": testuser_original["shop_name"] or "",
                "phone": testuser_original["phone"] or "",
            },
        )
        assert r.status_code == 200, r.text
        doc = mongo.users.find_one({"username": TESTUSER}, {"_id": 0, "shop_name": 1, "phone": 1})
        assert (doc.get("shop_name") or None) == testuser_original["shop_name"]
        assert (doc.get("phone") or None) == testuser_original["phone"]

    def test_cleanup_v7_users(self, mongo):
        v7 = list(mongo.users.find({"username": {"$regex": "^v7_"}}, {"id": 1, "_id": 0}))
        ids = [u["id"] for u in v7]
        if ids:
            mongo.customers.delete_many({"owner_id": {"$in": ids}})
            mongo.transactions.delete_many({"owner_id": {"$in": ids}})
            mongo.stores.delete_many({"owner_id": {"$in": ids}})
            mongo.settings.delete_many({"owner_id": {"$in": ids}})
            mongo.users.delete_many({"id": {"$in": ids}})
        assert mongo.users.count_documents({"username": {"$regex": "^v7_"}}) == 0
