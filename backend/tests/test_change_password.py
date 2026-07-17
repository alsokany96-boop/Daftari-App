"""Daftari v3 backend tests — change-password endpoint + regression on existing endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def fresh_owner(s):
    """Create a throwaway owner with known password. Isolated so we can safely mutate its password."""
    uname = f"cpw_{uuid.uuid4().hex[:8]}"
    pw = "orig1234"
    r = s.post(f"{API}/auth/register", json={"username": uname, "password": pw, "shop_name": "CPW"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    uid = r.json()["user"]["id"]
    return {"username": uname, "password": pw, "token": tok, "id": uid}


class TestChangePassword:
    def test_requires_auth(self, s):
        r = s.post(f"{API}/auth/change-password", json={"current_password": "x", "new_password": "yyyy"})
        assert r.status_code == 401

    def test_wrong_current_returns_400_arabic(self, s, fresh_owner):
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": "WRONGxx", "new_password": "brand1234"},
                   headers=h(fresh_owner["token"]))
        assert r.status_code == 400
        # Arabic error message
        assert "كلمة المرور الحالية" in r.json()["detail"]

    def test_short_new_password_returns_400(self, s, fresh_owner):
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": fresh_owner["password"], "new_password": "abc"},
                   headers=h(fresh_owner["token"]))
        assert r.status_code == 400
        assert "4 أحرف" in r.json()["detail"] or "4" in r.json()["detail"]

    def test_change_success_and_login_with_new(self, s, fresh_owner):
        # 1. Change password
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": fresh_owner["password"], "new_password": "newpw9999"},
                   headers=h(fresh_owner["token"]))
        assert r.status_code == 200
        assert r.json() == {"ok": True}

        # 2. Old password fails
        r = s.post(f"{API}/auth/login",
                   json={"username": fresh_owner["username"], "password": fresh_owner["password"]})
        assert r.status_code == 401

        # 3. New password works
        r = s.post(f"{API}/auth/login",
                   json={"username": fresh_owner["username"], "password": "newpw9999"})
        assert r.status_code == 200
        new_tok = r.json()["access_token"]

        # 4. Change back to original so fixture stays consistent for any later reuse
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": "newpw9999", "new_password": fresh_owner["password"]},
                   headers=h(new_tok))
        assert r.status_code == 200


# ---- Regression on existing endpoints (quick smoke) ----
@pytest.fixture(scope="module")
def owner_login(s):
    r = s.post(f"{API}/auth/login", json={"username": "testuser", "password": "test1234"})
    assert r.status_code == 200
    return r.json()


class TestRegression:
    def test_customer_crud(self, s, owner_login):
        tok = owner_login["access_token"]
        r = s.post(f"{API}/customers",
                   json={"name": "TEST_v3_reg", "phone": "07000", "max_debt": 300},
                   headers=h(tok))
        assert r.status_code == 200
        cid = r.json()["id"]

        r = s.get(f"{API}/customers/{cid}", headers=h(tok))
        assert r.status_code == 200 and r.json()["name"] == "TEST_v3_reg"

        r = s.put(f"{API}/customers/{cid}", json={"max_debt": 500}, headers=h(tok))
        assert r.status_code == 200 and r.json()["max_debt"] == 500

        # Transaction
        r = s.post(f"{API}/transactions",
                   json={"customer_id": cid, "type": "debt", "amount": 21.5},
                   headers=h(tok))
        assert r.status_code == 200
        tx = r.json()
        assert tx["amount"] == 21.5

        r = s.get(f"{API}/transactions/{cid}", headers=h(tok))
        assert r.status_code == 200
        assert any(t["amount"] == 21.5 for t in r.json())

        r = s.delete(f"{API}/transactions/{tx['id']}", headers=h(tok))
        assert r.status_code == 200

        r = s.delete(f"{API}/customers/{cid}", headers=h(tok))
        assert r.status_code == 200
        r = s.get(f"{API}/customers/{cid}", headers=h(tok))
        assert r.status_code == 404

    def test_config_still_public(self, s):
        r = s.get(f"{API}/config")
        assert r.status_code == 200
        assert "admin_whatsapp" in r.json()

    def test_admin_endpoints_intact(self, s):
        r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin1234"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        r = s.get(f"{API}/admin/users", headers=h(tok))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
