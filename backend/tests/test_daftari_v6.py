"""Daftari iteration_6 backend tests - subscription overhaul.

Covers:
  * Effective UserPublic shape (subscription_expires_at, customer_count, is_locked, free_tier_limit)
  * Per-store customer_count computation (max across stores; suppliers excluded)
  * Free-tier lock at >= 10 customers per single store
  * Registration no longer globally gated
  * Admin activate (30d), extend (+30d), deactivate (clear)
  * Expired subscription re-locks
  * Non-super-admin forbidden on extend
  * Admin list includes new fields
  * Cleanup at the end (all v6_* users + related data)
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
def admin_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": ADMIN, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register(s, uname, pw="pw1234"):
    r = s.post(f"{API}/auth/register", json={"username": uname, "password": pw, "shop_name": "V6"})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["access_token"], body["user"]


def _login(s, uname, pw):
    r = s.post(f"{API}/auth/login", json={"username": uname, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]


def _default_store_id(s, tok):
    stores = s.get(f"{API}/stores", headers=H(tok)).json()
    return stores[0]["id"]


def _add_customer(s, tok, store_id, name, party="customer"):
    r = s.post(
        f"{API}/customers",
        headers=H(tok),
        json={"name": name, "phone": "0900000", "party_type": party, "store_id": store_id},
    )
    return r


# ============ 1. Response Shape ============
class TestResponseShape:
    def test_login_me_shape_testuser(self, s):
        r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        for k in ("subscription_expires_at", "customer_count", "is_locked", "free_tier_limit"):
            assert k in u, f"login user missing {k}"
        assert u["free_tier_limit"] == 10
        assert isinstance(u["customer_count"], int)
        assert isinstance(u["is_locked"], bool)

        tok = r.json()["access_token"]
        me = s.get(f"{API}/auth/me", headers=H(tok)).json()
        for k in ("subscription_expires_at", "customer_count", "is_locked", "free_tier_limit"):
            assert k in me
        assert me["free_tier_limit"] == 10
        # testuser is expected to be not locked and customer_count small (<10)
        assert me["is_locked"] is False
        assert me["customer_count"] < 10


# ============ 2. Registration not globally gated ============
class TestRegistrationOpen:
    def test_new_owner_active_and_zero_count(self, s):
        uname = f"v6_owner_{uuid.uuid4().hex[:6]}"
        tok, user = _register(s, uname)
        assert user["is_active"] is True
        assert user["subscription_expires_at"] in (None, "")
        assert user["customer_count"] == 0
        assert user["is_locked"] is False
        assert user["free_tier_limit"] == 10


# ============ 3. Per-store free-tier lock ============
class TestFreeTierLock:
    @pytest.fixture(scope="class")
    def owner(self, s):
        uname = f"v6_lock_test_{uuid.uuid4().hex[:6]}"
        tok, user = _register(s, uname)
        return {"tok": tok, "user": user, "username": uname}

    def test_initial_state(self, s, owner):
        me = s.get(f"{API}/auth/me", headers=H(owner["tok"])).json()
        assert me["customer_count"] == 0
        assert me["is_active"] is True
        assert me["is_locked"] is False

    def test_9_customers_still_unlocked(self, s, owner):
        sid = _default_store_id(s, owner["tok"])
        owner["store_id"] = sid
        for i in range(9):
            r = _add_customer(s, owner["tok"], sid, f"c_{i}")
            assert r.status_code == 200, f"customer {i}: {r.text}"
        me = s.get(f"{API}/auth/me", headers=H(owner["tok"])).json()
        assert me["customer_count"] == 9
        assert me["is_active"] is True
        assert me["is_locked"] is False

    def test_10th_customer_locks(self, s, owner):
        r = _add_customer(s, owner["tok"], owner["store_id"], "c_9")
        assert r.status_code == 200, r.text
        me = s.get(f"{API}/auth/me", headers=H(owner["tok"])).json()
        assert me["customer_count"] == 10
        assert me["is_locked"] is True
        assert me["is_active"] is False  # effective

    def test_11th_customer_forbidden(self, s, owner):
        r = _add_customer(s, owner["tok"], owner["store_id"], "c_10")
        assert r.status_code == 403, r.text
        assert "الاشتراك غير مفعّل" in r.json().get("detail", "")

    def test_me_still_200_when_locked(self, s, owner):
        r = s.get(f"{API}/auth/me", headers=H(owner["tok"]))
        assert r.status_code == 200
        assert r.json()["is_locked"] is True


# ============ 4. Suppliers do NOT count ============
class TestSuppliersExcluded:
    def test_10_suppliers_no_lock(self, s):
        uname = f"v6_supplier_test_{uuid.uuid4().hex[:6]}"
        tok, _ = _register(s, uname)
        sid = _default_store_id(s, tok)
        for i in range(10):
            r = _add_customer(s, tok, sid, f"sup_{i}", party="supplier")
            assert r.status_code == 200, r.text
        me = s.get(f"{API}/auth/me", headers=H(tok)).json()
        assert me["customer_count"] == 0
        assert me["is_locked"] is False
        assert me["is_active"] is True


# ============ 5. Multi-store max ============
class TestMultiStoreMax:
    def test_max_across_stores(self, s):
        uname = f"v6_multi_test_{uuid.uuid4().hex[:6]}"
        tok, _ = _register(s, uname)
        sid_a = _default_store_id(s, tok)
        # Create store B
        rb = s.post(f"{API}/stores", headers=H(tok), json={"name": "محل B"})
        assert rb.status_code == 200
        sid_b = rb.json()["id"]
        # 5 in B
        for i in range(5):
            assert _add_customer(s, tok, sid_b, f"b_{i}").status_code == 200
        me = s.get(f"{API}/auth/me", headers=H(tok)).json()
        assert me["customer_count"] == 5
        assert me["is_locked"] is False
        # 10 in A
        for i in range(10):
            r = _add_customer(s, tok, sid_a, f"a_{i}")
            # last one might 403 if lock kicks in on 10th? No: 10 triggers lock AFTER insert.
            # first 9 succeed then 10th succeed then next attempt 403. So 10 must succeed.
            assert r.status_code == 200, f"a_{i}: {r.status_code} {r.text}"
        me = s.get(f"{API}/auth/me", headers=H(tok)).json()
        assert me["customer_count"] == 10
        assert me["is_locked"] is True


# ============ 6. Admin activate / extend / deactivate ============
class TestAdminSubscriptionOps:
    @pytest.fixture(scope="class")
    def locked_owner(self, s):
        uname = f"v6_adminops_{uuid.uuid4().hex[:6]}"
        tok, user = _register(s, uname)
        # Add 10 to lock
        sid = _default_store_id(s, tok)
        for i in range(10):
            assert _add_customer(s, tok, sid, f"c_{i}").status_code == 200
        return {"tok": tok, "user": user, "username": uname}

    def test_activate_grants_30_days(self, s, admin_tok, locked_owner):
        uid = locked_owner["user"]["id"]
        r = s.put(f"{API}/admin/users/{uid}/activate", headers=H(admin_tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_active"] is True
        assert body["is_locked"] is False
        exp = body["subscription_expires_at"]
        assert exp
        dt = datetime.fromisoformat(exp)
        target = datetime.now(timezone.utc) + timedelta(days=30)
        diff = abs((dt - target).total_seconds())
        assert diff < 60, f"expiry off by {diff}s"
        locked_owner["exp_after_activate"] = dt

    def test_extend_adds_30_days_on_top(self, s, admin_tok, locked_owner):
        uid = locked_owner["user"]["id"]
        prior_exp = locked_owner["exp_after_activate"]
        r = s.put(f"{API}/admin/users/{uid}/extend", headers=H(admin_tok), json={"days": 30})
        assert r.status_code == 200, r.text
        new_exp = datetime.fromisoformat(r.json()["subscription_expires_at"])
        target = prior_exp + timedelta(days=30)
        diff = abs((new_exp - target).total_seconds())
        assert diff < 60, f"extend off by {diff}s (prior={prior_exp}, new={new_exp})"

    def test_extend_forbidden_for_non_admin(self, s, locked_owner):
        # A fresh non-admin user
        uname = f"v6_nonadmin_{uuid.uuid4().hex[:6]}"
        tok, user = _register(s, uname)
        r = s.put(f"{API}/admin/users/{locked_owner['user']['id']}/extend",
                  headers=H(tok), json={"days": 30})
        assert r.status_code == 403, r.text

    def test_deactivate_clears_expiry(self, s, admin_tok, locked_owner):
        uid = locked_owner["user"]["id"]
        r = s.put(f"{API}/admin/users/{uid}/deactivate", headers=H(admin_tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["subscription_expires_at"] in (None, "")
        # is_active reflects EFFECTIVE state - owner has 10 customers so should be locked+inactive
        assert body["is_locked"] is True
        assert body["is_active"] is False

        # Verify /auth/me for the owner reflects lock
        me = s.get(f"{API}/auth/me", headers=H(locked_owner["tok"])).json()
        assert me["is_locked"] is True
        assert me["is_active"] is False

    def test_expired_subscription_relocks(self, s, admin_tok, mongo):
        uname = f"v6_expired_{uuid.uuid4().hex[:6]}"
        tok, user = _register(s, uname)
        sid = _default_store_id(s, tok)
        for i in range(10):
            assert _add_customer(s, tok, sid, f"e_{i}").status_code == 200
        # Manually set expired subscription in Mongo
        past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        mongo.users.update_one({"id": user["id"]}, {"$set": {"subscription_expires_at": past, "is_active": True}})
        me = s.get(f"{API}/auth/me", headers=H(tok)).json()
        assert me["is_locked"] is True
        assert me["customer_count"] == 10
        assert me["is_active"] is False


# ============ 7. Admin list new fields ============
class TestAdminListShape:
    def test_admin_list_has_new_fields(self, s, admin_tok):
        r = s.get(f"{API}/admin/users", headers=H(admin_tok))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        owners = [x for x in rows if x.get("role") == "owner"]
        assert len(owners) > 0
        for row in owners[:5]:
            for k in ("subscription_expires_at", "customer_count", "is_locked", "free_tier_limit"):
                assert k in row, f"admin row missing {k}: {row}"
            assert row["free_tier_limit"] == 10


# ============ 8. Cleanup + testuser sanity ============
class TestCleanup:
    def test_testuser_still_works_and_unlocked(self, s):
        r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["is_locked"] is False
        # Should be able to hit a protected endpoint
        tok = r.json()["access_token"]
        assert s.get(f"{API}/stores", headers=H(tok)).status_code == 200

    def test_zzz_cleanup_v6_users(self, s, mongo):
        """Delete all v6_* users and all their stores/customers/transactions.

        Named zzz to run last within this class (module-scoped ordering usually
        respects declaration order, but this is defensive).
        """
        v6 = list(mongo.users.find({"username": {"$regex": "^v6_"}}, {"id": 1, "_id": 0}))
        ids = [u["id"] for u in v6]
        assert len(ids) >= 1
        mongo.customers.delete_many({"owner_id": {"$in": ids}})
        mongo.transactions.delete_many({"owner_id": {"$in": ids}})
        mongo.stores.delete_many({"owner_id": {"$in": ids}})
        mongo.settings.delete_many({"owner_id": {"$in": ids}})
        mongo.users.delete_many({"id": {"$in": ids}})
        # Verify
        assert mongo.users.count_documents({"username": {"$regex": "^v6_"}}) == 0
