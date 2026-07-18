"""Daftari iteration_5 regression tests.

Focus:
  * Manual OTP flow using the real `testuser` account (with pw restoration).
  * Legacy customer tolerance (missing store_id / party_type inserted directly).
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

TESTUSER = "testuser"
TESTUSER_PW = "test1234"
ADMIN = "admin"
ADMIN_PW = "admin1234"


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope="module")
def admin_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": ADMIN, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def testuser_id(s, mongo):
    """Login testuser (creating a fresh one if missing) and return its id.

    We restore its password to `test1234` at module teardown.
    """
    r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
    if r.status_code != 200:
        # Attempt to register (in case env was wiped)
        rr = s.post(f"{API}/auth/register", json={
            "username": TESTUSER, "password": TESTUSER_PW, "shop_name": "Test Shop"
        })
        assert rr.status_code == 200, rr.text
        uid = rr.json()["user"]["id"]
    else:
        uid = r.json()["user"]["id"]
    yield uid


# ============ MANUAL OTP FLOW (testuser) ============
class TestManualOTPTestuser:
    def test_forgot_pin_shape(self, s, testuser_id, mongo):
        # snapshot: count pending codes for testuser before
        prev = mongo.reset_codes.count_documents({"user_id": testuser_id, "used_at": None})

        r = s.post(f"{API}/auth/forgot-pin", json={"username": TESTUSER})
        assert r.status_code == 200, r.text
        body = r.json()
        # Required response fields
        assert body.get("ok") is True
        assert body.get("delivery") == "admin_relay"
        assert isinstance(body.get("ttl_minutes"), int)
        # MUST NOT leak the code
        assert "code" not in body

        # Should have inserted exactly one new unused doc AND invalidated the previous one
        docs = list(mongo.reset_codes.find({"user_id": testuser_id, "used_at": None}))
        assert len(docs) == 1, f"expected 1 active reset code, got {len(docs)} (prev was {prev})"
        d = docs[0]
        for k in ("id", "code", "username", "expires_at", "created_at"):
            assert k in d
        assert d["username"] == TESTUSER
        assert len(d["code"]) == 6 and d["code"].isdigit()

    def test_admin_reset_codes_lists_testuser(self, s, admin_tok, testuser_id):
        r = s.get(f"{API}/admin/reset-codes", headers=H(admin_tok))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        mine = [x for x in rows if x["username"] == TESTUSER]
        assert len(mine) == 1
        row = mine[0]
        for k in ("id", "code", "user_id", "username", "expires_at", "created_at"):
            assert k in row
        # phone/email may be null but keys must be present
        assert "phone" in row and "email" in row
        assert row["user_id"] == testuser_id
        assert len(row["code"]) == 6

    def test_admin_reset_codes_forbidden_for_owner(self, s, testuser_id):
        lr = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        assert lr.status_code == 200
        tok = lr.json()["access_token"]
        r = s.get(f"{API}/admin/reset-codes", headers=H(tok))
        assert r.status_code == 403

    def test_reset_pin_wrong_code_400(self, s):
        r = s.post(f"{API}/auth/reset-pin",
                   json={"username": TESTUSER, "code": "000000", "new_password": "newpin99"})
        assert r.status_code == 400

    def test_reset_pin_success_and_restore(self, s, admin_tok, mongo, testuser_id):
        # Get current active code
        rows = s.get(f"{API}/admin/reset-codes", headers=H(admin_tok)).json()
        mine = [x for x in rows if x["username"] == TESTUSER]
        assert len(mine) == 1
        code = mine[0]["code"]

        # Reset to a fresh password
        new_pw = "otp_new_" + uuid.uuid4().hex[:4]
        r = s.post(f"{API}/auth/reset-pin",
                   json={"username": TESTUSER, "code": code, "new_password": new_pw})
        assert r.status_code == 200, r.text

        # Login with new pw
        lr = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": new_pw})
        assert lr.status_code == 200

        # Code is now used → cannot reuse
        r = s.post(f"{API}/auth/reset-pin",
                   json={"username": TESTUSER, "code": code, "new_password": "reuse1234"})
        assert r.status_code == 400

        # Restore original password using a new OTP round-trip so subsequent runs pass
        rf = s.post(f"{API}/auth/forgot-pin", json={"username": TESTUSER})
        assert rf.status_code == 200
        rows = s.get(f"{API}/admin/reset-codes", headers=H(admin_tok)).json()
        mine = [x for x in rows if x["username"] == TESTUSER]
        assert len(mine) == 1
        code2 = mine[0]["code"]
        rr = s.post(f"{API}/auth/reset-pin",
                    json={"username": TESTUSER, "code": code2, "new_password": TESTUSER_PW})
        assert rr.status_code == 200, rr.text

        # Verify final restore
        lr = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        assert lr.status_code == 200

    def test_forgot_pin_employee_silent(self, s, mongo, admin_tok):
        # Create a fresh owner + employee via API, forgot-pin against emp, ensure no reset doc
        oname = f"v5o_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/auth/register",
                   json={"username": oname, "password": "own1234", "shop_name": "O"})
        assert r.status_code == 200
        otok = r.json()["access_token"]
        ename = f"v5e_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/staff", json={"username": ename, "password": "emp1234"}, headers=H(otok))
        assert r.status_code == 200
        emp_id = r.json()["id"]

        r = s.post(f"{API}/auth/forgot-pin", json={"username": ename})
        assert r.status_code == 200
        # Response body should be silent success (ok=True, delivery=admin_relay)
        body = r.json()
        assert body.get("ok") is True
        # No reset_codes doc must exist for the employee
        cnt = mongo.reset_codes.count_documents({"user_id": emp_id})
        assert cnt == 0

        # admin listing must not include employee
        rows = s.get(f"{API}/admin/reset-codes", headers=H(admin_tok)).json()
        assert not any(x["username"] == ename for x in rows)


# ============ LEGACY CUSTOMER TOLERANCE ============
class TestLegacyCustomer:
    @pytest.fixture(scope="class")
    def legacy_customer(self, mongo, testuser_id):
        """Insert a customer directly with NO store_id and NO party_type."""
        cid = str(uuid.uuid4())
        mongo.customers.insert_one({
            "id": cid,
            "owner_id": testuser_id,
            "name": "TEST_v5_legacy_cust",
            "phone": "099999",
            "max_debt": None,
            "created_at": "2024-01-01T00:00:00+00:00",
            # NOTE: no store_id, no party_type
        })
        yield cid
        # Cleanup
        mongo.customers.delete_one({"id": cid})
        mongo.transactions.delete_many({"customer_id": cid})

    def test_list_customers_does_not_500(self, s, legacy_customer):
        lr = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        assert lr.status_code == 200
        tok = lr.json()["access_token"]

        r = s.get(f"{API}/customers", headers=H(tok))
        # Must not 500, must default party_type to 'customer'
        assert r.status_code == 200, r.text
        # After list_customers is called with resolved_store, the legacy record may not appear
        # (since it has no store_id). GET-by-id endpoint below is the guaranteed migration path.

    def test_get_customer_by_id_migrates_legacy(self, s, legacy_customer, mongo, testuser_id):
        lr = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        tok = lr.json()["access_token"]

        r = s.get(f"{API}/customers/{legacy_customer}", headers=H(tok))
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["party_type"] == "customer"
        assert c["store_id"]  # non-empty after migration
        # Confirm persisted
        after = mongo.customers.find_one({"id": legacy_customer})
        assert after["party_type"] == "customer"
        assert after["store_id"]

    def test_list_customers_after_migration_shows_it(self, s, legacy_customer, mongo, testuser_id):
        # After the GET migration above, the customer should show up when we query with default store
        lr = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        tok = lr.json()["access_token"]

        # Ensure migration ran by hitting GET /customers/{id}
        s.get(f"{API}/customers/{legacy_customer}", headers=H(tok))
        migrated = mongo.customers.find_one({"id": legacy_customer})
        sid = migrated["store_id"]

        r = s.get(f"{API}/customers", params={"store_id": sid}, headers=H(tok))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert legacy_customer in ids
        # party_type must default to 'customer'
        rec = next(x for x in r.json() if x["id"] == legacy_customer)
        assert rec["party_type"] == "customer"

    def test_transactions_endpoint_empty_ok(self, s, legacy_customer):
        lr = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
        tok = lr.json()["access_token"]
        r = s.get(f"{API}/transactions/{legacy_customer}", headers=H(tok))
        assert r.status_code == 200
        assert r.json() == []
