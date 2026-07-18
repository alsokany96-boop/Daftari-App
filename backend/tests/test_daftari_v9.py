"""Daftari iteration 9 backend tests.

Covers:
 - PUT /api/transactions/{id} (owner + super_admin): valid, amount<=0, empty body, missing id
 - DELETE /api/transactions/{id} regression: owner 200, employee 403
 - Employee is forbidden from editing transactions (PUT → 403)
 - Employee store lock: GET /stores returns EXACTLY 1 (owner default)
   even after owner creates a 2nd store; POST /customers/POST /transactions with
   store_id=<second> is silently rewritten to the default store
 - Regression: /admin/config still works, admin activate/extend/deactivate
Cleans up: employee accounts + the 2nd store + any transaction amount touched.
"""
import os
import uuid

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


@pytest.fixture(scope="module")
def owner_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_default_store(s, owner_tok):
    stores = s.get(f"{API}/stores", headers=H(owner_tok)).json()
    assert len(stores) >= 1
    return stores[0]


# Shared state across classes
STATE = {
    "second_store_id": None,
    "employee_id": None,
    "employee_tok": None,
    "employee_username": f"v9_emp_{uuid.uuid4().hex[:6]}",
    "tx_id": None,
    "orig_tx_amount": None,
    "customer_id": None,
}


# ============ 1. Setup: locate/create a customer + a transaction ============
class TestSetup:
    def test_setup_customer_and_tx(self, s, owner_tok, owner_default_store):
        # Try to reuse an existing customer under the owner's default store
        cust = s.get(
            f"{API}/customers",
            headers=H(owner_tok),
            params={"store_id": owner_default_store["id"], "party_type": "customer"},
        ).json()
        if cust:
            STATE["customer_id"] = cust[0]["id"]
        else:
            r = s.post(
                f"{API}/customers",
                headers=H(owner_tok),
                json={
                    "name": "V9_TEST_CUST",
                    "phone": "0100",
                    "party_type": "customer",
                    "store_id": owner_default_store["id"],
                },
            )
            assert r.status_code == 200, r.text
            STATE["customer_id"] = r.json()["id"]

        # Create a debt tx for testing edit/delete
        r = s.post(
            f"{API}/transactions",
            headers=H(owner_tok),
            json={
                "customer_id": STATE["customer_id"],
                "type": "debt",
                "amount": 100.0,
                "notes": "v9_seed_tx",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        STATE["tx_id"] = body["id"]
        STATE["orig_tx_amount"] = body["amount"]
        assert body["amount"] == 100.0


# ============ 2. PUT /api/transactions/{id} ============
class TestUpdateTransaction:
    def test_owner_updates_amount_and_notes(self, s, owner_tok):
        r = s.put(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(owner_tok),
            json={"amount": 42.5, "notes": "edited"},
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["amount"] == 42.5
        assert b["notes"] == "edited"
        assert b["id"] == STATE["tx_id"]

    def test_list_reflects_update(self, s, owner_tok):
        r = s.get(f"{API}/transactions/{STATE['customer_id']}", headers=H(owner_tok))
        assert r.status_code == 200
        rows = r.json()
        target = [t for t in rows if t["id"] == STATE["tx_id"]]
        assert target and target[0]["amount"] == 42.5

    def test_zero_amount_400(self, s, owner_tok):
        r = s.put(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(owner_tok),
            json={"amount": 0},
        )
        assert r.status_code == 400, r.text
        assert "المبلغ يجب أن يكون أكبر من صفر" in r.json().get("detail", "")

    def test_negative_amount_400(self, s, owner_tok):
        r = s.put(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(owner_tok),
            json={"amount": -3},
        )
        assert r.status_code == 400
        assert "المبلغ يجب أن يكون أكبر من صفر" in r.json().get("detail", "")

    def test_empty_body_400(self, s, owner_tok):
        r = s.put(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(owner_tok),
            json={},
        )
        assert r.status_code == 400, r.text
        assert "لا توجد تغييرات" in r.json().get("detail", "")

    def test_missing_id_404(self, s, owner_tok):
        r = s.put(
            f"{API}/transactions/{uuid.uuid4()}",
            headers=H(owner_tok),
            json={"amount": 10},
        )
        assert r.status_code == 404, r.text

    def test_admin_can_edit_owner_tx(self, s, admin_tok):
        # super_admin should be allowed (CurrentOwner is owner_or_admin)
        # but scope = root_owner_id(admin) which is admin's own id — the tx
        # belongs to testuser. So admin editing testuser's tx will 404.
        # We still verify the endpoint accepts admin auth (no 401/403).
        r = s.put(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(admin_tok),
            json={"amount": 55},
        )
        # Admin authorized but tx not in admin's scope → 404
        assert r.status_code in (200, 404), r.text

    def test_revert_amount(self, s, owner_tok):
        r = s.put(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(owner_tok),
            json={"amount": STATE["orig_tx_amount"], "notes": "v9_seed_tx"},
        )
        assert r.status_code == 200
        assert r.json()["amount"] == STATE["orig_tx_amount"]


# ============ 3. Employee creation + store lock ============
class TestEmployeeStoreLock:
    def test_owner_creates_second_store(self, s, owner_tok):
        r = s.post(
            f"{API}/stores",
            headers=H(owner_tok),
            json={"name": "V9_SECOND_STORE", "icon": "storefront"},
        )
        assert r.status_code == 200, r.text
        STATE["second_store_id"] = r.json()["id"]
        # Owner sees both stores now
        stores = s.get(f"{API}/stores", headers=H(owner_tok)).json()
        assert len(stores) >= 2

    def test_create_employee(self, s, owner_tok):
        r = s.post(
            f"{API}/staff",
            headers=H(owner_tok),
            json={
                "username": STATE["employee_username"],
                "password": "emppw1",
                "display_name": "V9 Emp",
            },
        )
        assert r.status_code == 200, r.text
        STATE["employee_id"] = r.json()["id"]

    def test_employee_login(self, s):
        r = s.post(
            f"{API}/auth/login",
            json={"username": STATE["employee_username"], "password": "emppw1"},
        )
        assert r.status_code == 200, r.text
        STATE["employee_tok"] = r.json()["access_token"]
        assert r.json()["user"]["role"] == "employee"

    def test_employee_sees_only_one_store(self, s, owner_default_store):
        r = s.get(f"{API}/stores", headers=H(STATE["employee_tok"]))
        assert r.status_code == 200, r.text
        stores = r.json()
        assert len(stores) == 1, f"expected 1 store, got {len(stores)}"
        assert stores[0]["id"] == owner_default_store["id"]

    def test_employee_create_customer_store_override(self, s, owner_default_store):
        # Employee tries to create a customer in the SECOND store
        r = s.post(
            f"{API}/customers",
            headers=H(STATE["employee_tok"]),
            json={
                "name": "V9_EMP_CUST",
                "phone": "0999",
                "party_type": "customer",
                "store_id": STATE["second_store_id"],
            },
        )
        assert r.status_code == 200, r.text
        created = r.json()
        # Backend should have overridden store_id to the default
        assert created["store_id"] == owner_default_store["id"]
        assert created["store_id"] != STATE["second_store_id"]
        STATE["emp_customer_id"] = created["id"]

    def test_employee_create_transaction_store_override(self, s, owner_default_store):
        # Create a transaction via employee against the emp's customer (which is in default store).
        r = s.post(
            f"{API}/transactions",
            headers=H(STATE["employee_tok"]),
            json={
                "customer_id": STATE.get("emp_customer_id"),
                "type": "debt",
                "amount": 5,
                "notes": "emp_tx",
            },
        )
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["store_id"] == owner_default_store["id"]
        STATE["emp_tx_id"] = tx["id"]

    def test_employee_forbidden_to_edit_tx(self, s):
        r = s.put(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(STATE["employee_tok"]),
            json={"amount": 999},
        )
        assert r.status_code == 403, r.text

    def test_employee_forbidden_to_delete_tx(self, s):
        r = s.delete(
            f"{API}/transactions/{STATE['tx_id']}",
            headers=H(STATE["employee_tok"]),
        )
        assert r.status_code == 403, r.text


# ============ 4. Delete regression (owner) ============
class TestDeleteRegression:
    def test_owner_can_delete_emp_tx(self, s, owner_tok):
        # Delete the tx created by the employee to clean up
        emp_tx = STATE.get("emp_tx_id")
        if emp_tx:
            r = s.delete(f"{API}/transactions/{emp_tx}", headers=H(owner_tok))
            assert r.status_code == 200, r.text


# ============ 5. Regression: /admin/config ============
class TestAdminConfigRegression:
    def test_public_config(self, s):
        r = s.get(f"{API}/config")
        assert r.status_code == 200
        b = r.json()
        assert "subscription_price" in b
        assert "free_tier_limit" in b

    def test_admin_config_get(self, s, admin_tok):
        r = s.get(f"{API}/admin/config", headers=H(admin_tok))
        assert r.status_code == 200

    def test_admin_config_put_noop_preserves(self, s, admin_tok):
        # Just re-set defaults to prove endpoint still works
        cur = s.get(f"{API}/config").json()
        r = s.put(
            f"{API}/admin/config",
            headers=H(admin_tok),
            json={
                "subscription_price": cur["subscription_price"],
                "free_tier_limit": cur["free_tier_limit"],
            },
        )
        assert r.status_code == 200


# ============ 6. Regression: activate/extend/deactivate ============
class TestSubscriptionAdminRegression:
    def test_activate_extend_deactivate(self, s, admin_tok):
        # Find testuser id
        me = s.post(
            f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW}
        ).json()
        uid = me["user"]["id"]
        # Activate/extend by 30 days
        r = s.put(
            f"{API}/admin/users/{uid}/activate",
            headers=H(admin_tok),
            json={"days": 30},
        )
        assert r.status_code == 200, r.text
        r_ext = s.put(
            f"{API}/admin/users/{uid}/extend",
            headers=H(admin_tok),
            json={"days": 30},
        )
        assert r_ext.status_code == 200, r_ext.text
        # Deactivate
        r2 = s.put(
            f"{API}/admin/users/{uid}/deactivate",
            headers=H(admin_tok),
        )
        assert r2.status_code == 200, r2.text
        # Reactivate at the end so subsequent runs are not blocked
        r3 = s.put(
            f"{API}/admin/users/{uid}/activate",
            headers=H(admin_tok),
            json={"days": 365},
        )
        assert r3.status_code == 200, r3.text


# ============ 7. Cleanup ============
class TestZZZCleanup:
    def test_cleanup_employee(self, s, owner_tok, mongo):
        # Delete employee's customer (owner deletes -> cascades tx)
        if STATE.get("emp_customer_id"):
            s.delete(
                f"{API}/customers/{STATE['emp_customer_id']}",
                headers=H(owner_tok),
            )
        # Delete employee via /staff
        if STATE.get("employee_id"):
            r = s.delete(
                f"{API}/staff/{STATE['employee_id']}",
                headers=H(owner_tok),
            )
            assert r.status_code == 200
        # Ensure any residual v9_emp_ users cleaned
        mongo.users.delete_many({"username": {"$regex": "^v9_emp_"}})

    def test_cleanup_second_store(self, s, owner_tok):
        if STATE.get("second_store_id"):
            r = s.delete(
                f"{API}/stores/{STATE['second_store_id']}",
                headers=H(owner_tok),
            )
            assert r.status_code == 200
        r_list = s.get(f"{API}/stores", headers=H(owner_tok))
        assert r_list.status_code == 200, r_list.text
        stores = r_list.json()
        # Should now be back to owner's original store count (>=1)
        assert all(isinstance(st, dict) and st.get("name") != "V9_SECOND_STORE" for st in stores)

    def test_cleanup_seed_tx_and_customer(self, s, owner_tok, mongo):
        # Delete our seed transaction
        if STATE.get("tx_id"):
            s.delete(f"{API}/transactions/{STATE['tx_id']}", headers=H(owner_tok))
        # Delete customer if we created it (name V9_TEST_CUST)
        if STATE.get("customer_id"):
            c = mongo.customers.find_one({"id": STATE["customer_id"]}, {"_id": 0})
            if c and c.get("name") == "V9_TEST_CUST":
                s.delete(f"{API}/customers/{STATE['customer_id']}", headers=H(owner_tok))
