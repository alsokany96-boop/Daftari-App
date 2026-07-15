"""Daftari v2 backend tests - Config, super_admin, RBAC, staff, settings, subscription lock."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(s, username, password="test1234", shop="Shop"):
    return s.post(f"{API}/auth/register", json={"username": username, "password": password, "shop_name": shop})


def _login(s, username, password):
    return s.post(f"{API}/auth/login", json={"username": username, "password": password})


@pytest.fixture(scope="module")
def admin_login(s):
    r = _login(s, "admin", "admin1234")
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def owner_login(s):
    r = _login(s, "testuser", "test1234")
    assert r.status_code == 200, f"Owner login failed: {r.text}"
    return r.json()


# ---- Public Config ----
class TestPublicConfig:
    def test_config_no_auth(self, s):
        r = s.get(f"{API}/config")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["admin_phone"] == "0926609606"
        assert data["admin_whatsapp"] == "218926609606"
        assert data["subscription_price"] == 20
        assert data["free_tier_limit"] == 10


# ---- Auth: super_admin role ----
class TestAuthRoles:
    def test_super_admin_role_and_active(self, admin_login):
        u = admin_login["user"]
        assert u["role"] == "super_admin"
        assert u["is_active"] is True

    def test_owner_role_and_active(self, owner_login):
        u = owner_login["user"]
        assert u["role"] == "owner"
        assert u["is_active"] is True

    def test_new_owner_registration_role(self, s):
        uname = f"owner_role_{uuid.uuid4().hex[:6]}"
        r = _register(s, uname)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["role"] == "owner"
        # is_active depends on owner count vs free tier — accept either but must be bool
        assert isinstance(u["is_active"], bool)


# ---- Admin endpoints ----
class TestAdminEndpoints:
    def test_admin_list_users(self, s, admin_login):
        r = s.get(f"{API}/admin/users", headers=auth_headers(admin_login["access_token"]))
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        # Must include testuser (owner) but NOT admin himself
        roles = {u["role"] for u in users}
        assert "super_admin" not in roles
        usernames = {u["username"] for u in users}
        assert "testuser" in usernames

    def test_owner_cannot_list_admin_users(self, s, owner_login):
        r = s.get(f"{API}/admin/users", headers=auth_headers(owner_login["access_token"]))
        assert r.status_code == 403

    def test_admin_activate_deactivate_flow(self, s, admin_login):
        # Create a fresh throwaway owner
        uname = f"toggle_{uuid.uuid4().hex[:6]}"
        r = _register(s, uname)
        assert r.status_code == 200
        uid = r.json()["user"]["id"]
        h = auth_headers(admin_login["access_token"])

        # Deactivate
        r = s.put(f"{API}/admin/users/{uid}/deactivate", headers=h)
        assert r.status_code == 200
        assert r.json()["is_active"] is False

        # Login still succeeds but /auth/me shows is_active=false and protected endpoints 403
        r = _login(s, uname, "test1234")
        assert r.status_code == 200
        deact_token = r.json()["access_token"]
        r = s.get(f"{API}/auth/me", headers=auth_headers(deact_token))
        assert r.status_code == 200
        assert r.json()["is_active"] is False
        r = s.get(f"{API}/customers", headers=auth_headers(deact_token))
        assert r.status_code == 403

        # Activate
        r = s.put(f"{API}/admin/users/{uid}/activate", headers=h)
        assert r.status_code == 200
        assert r.json()["is_active"] is True

        r = s.get(f"{API}/customers", headers=auth_headers(deact_token))
        assert r.status_code == 200

    def test_admin_reset_password(self, s, admin_login):
        uname = f"resetpw_{uuid.uuid4().hex[:6]}"
        r = _register(s, uname)
        uid = r.json()["user"]["id"]
        h = auth_headers(admin_login["access_token"])

        # too short
        r = s.put(f"{API}/admin/users/{uid}/reset-password", json={"new_password": "abc"}, headers=h)
        assert r.status_code == 400

        # ok
        r = s.put(f"{API}/admin/users/{uid}/reset-password", json={"new_password": "brandnew99"}, headers=h)
        assert r.status_code == 200

        # old fails
        r = _login(s, uname, "test1234")
        assert r.status_code == 401
        r = _login(s, uname, "brandnew99")
        assert r.status_code == 200

    def test_owner_cannot_reset_password(self, s, owner_login, admin_login):
        # pick any user id (owner himself)
        uid = owner_login["user"]["id"]
        r = s.put(f"{API}/admin/users/{uid}/reset-password",
                  json={"new_password": "hackme"}, headers=auth_headers(owner_login["access_token"]))
        assert r.status_code == 403


# ---- Settings ----
class TestSettings:
    def test_get_settings_auto_creates(self, s, owner_login):
        r = s.get(f"{API}/settings", headers=auth_headers(owner_login["access_token"]))
        assert r.status_code == 200
        data = r.json()
        for k in ("reminder_enabled", "reminder_frequency", "reminder_custom_days", "reminder_template"):
            assert k in data

    def test_update_settings(self, s, owner_login):
        h = auth_headers(owner_login["access_token"])
        r = s.put(f"{API}/settings",
                  json={"reminder_enabled": True, "reminder_frequency": "weekly",
                        "reminder_template": "TEST {name} {shop} {amount} {currency}"}, headers=h)
        assert r.status_code == 200
        # verify persisted
        r = s.get(f"{API}/settings", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["reminder_frequency"] == "weekly"
        assert "TEST" in d["reminder_template"]


# ---- Staff & Employee RBAC ----
@pytest.fixture(scope="module")
def owner_and_employee(s, owner_login):
    """Create a fresh employee under testuser owner and return tokens."""
    h = auth_headers(owner_login["access_token"])
    uname = f"emp_{uuid.uuid4().hex[:6]}"
    r = s.post(f"{API}/staff", json={"username": uname, "password": "emp1234", "display_name": "Emp One"}, headers=h)
    assert r.status_code == 200, r.text
    emp = r.json()
    r = _login(s, uname, "emp1234")
    assert r.status_code == 200
    emp_token = r.json()["access_token"]
    return {"owner_token": owner_login["access_token"], "owner_id": owner_login["user"]["id"],
            "emp_token": emp_token, "emp_id": emp["id"], "emp_username": uname}


class TestStaff:
    def test_staff_created_role_and_parent(self, s, owner_and_employee):
        r = s.get(f"{API}/auth/me", headers=auth_headers(owner_and_employee["emp_token"]))
        assert r.status_code == 200
        u = r.json()
        assert u["role"] == "employee"
        assert u["parent_owner_id"] == owner_and_employee["owner_id"]
        assert u["is_active"] is True

    def test_list_staff_owner_sees_own(self, s, owner_and_employee):
        r = s.get(f"{API}/staff", headers=auth_headers(owner_and_employee["owner_token"]))
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()]
        assert owner_and_employee["emp_id"] in ids

    def test_employee_cannot_list_staff(self, s, owner_and_employee):
        r = s.get(f"{API}/staff", headers=auth_headers(owner_and_employee["emp_token"]))
        assert r.status_code == 403

    def test_employee_cannot_access_settings_put(self, s, owner_and_employee):
        r = s.put(f"{API}/settings", json={"reminder_frequency": "daily"},
                  headers=auth_headers(owner_and_employee["emp_token"]))
        assert r.status_code == 403

    def test_employee_cannot_access_customers_summary(self, s, owner_and_employee):
        r = s.get(f"{API}/customers/summary", headers=auth_headers(owner_and_employee["emp_token"]))
        assert r.status_code == 403


class TestEmployeeScopedData:
    def test_employee_sees_owner_customers_and_scoped_writes(self, s, owner_and_employee):
        owner_h = auth_headers(owner_and_employee["owner_token"])
        emp_h = auth_headers(owner_and_employee["emp_token"])

        # Owner creates customer
        r = s.post(f"{API}/customers", json={"name": "TEST_ScopeCust", "phone": "0900", "max_debt": 500}, headers=owner_h)
        assert r.status_code == 200
        cid = r.json()["id"]

        # Employee sees it in list
        r = s.get(f"{API}/customers", headers=emp_h)
        assert r.status_code == 200
        assert any(c["id"] == cid for c in r.json())

        # Employee can add transaction
        r = s.post(f"{API}/transactions", json={"customer_id": cid, "type": "debt", "amount": 50}, headers=emp_h)
        assert r.status_code == 200

        # Employee cannot delete transaction
        tx_id = r.json()["id"]
        r = s.delete(f"{API}/transactions/{tx_id}", headers=emp_h)
        assert r.status_code == 403

        # Employee update: name/phone OK, max_debt silently ignored
        r = s.put(f"{API}/customers/{cid}",
                  json={"name": "TEST_ScopeCust2", "phone": "0901", "max_debt": 9999}, headers=emp_h)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_ScopeCust2"
        assert r.json()["max_debt"] == 500  # unchanged

        # Owner can update max_debt
        r = s.put(f"{API}/customers/{cid}", json={"max_debt": 700}, headers=owner_h)
        assert r.status_code == 200
        assert r.json()["max_debt"] == 700

        # Employee cannot delete customer
        r = s.delete(f"{API}/customers/{cid}", headers=emp_h)
        assert r.status_code == 403

        # Cleanup: owner deletes
        r = s.delete(f"{API}/customers/{cid}", headers=owner_h)
        assert r.status_code == 200


# ---- Owner cannot access super_admin, and staff endpoints require owner ----
class TestPermissionsMatrix:
    def test_owner_can_update_own_customer_max_debt(self, s, owner_login):
        h = auth_headers(owner_login["access_token"])
        r = s.post(f"{API}/customers", json={"name": "TEST_OwnerMax", "phone": "0", "max_debt": 100}, headers=h)
        cid = r.json()["id"]
        r = s.put(f"{API}/customers/{cid}", json={"max_debt": 250}, headers=h)
        assert r.status_code == 200
        assert r.json()["max_debt"] == 250
        s.delete(f"{API}/customers/{cid}", headers=h)
