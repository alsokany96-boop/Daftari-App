"""Daftari backend API tests - auth, customers, transactions, isolation."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bill-keeper-7.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---- Fixtures ----
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(s, username, password="test1234", shop="Shop"):
    r = s.post(f"{API}/auth/register", json={"username": username, "password": password, "shop_name": shop})
    return r


@pytest.fixture(scope="module")
def user_a(s):
    uname = f"test_a_{uuid.uuid4().hex[:8]}"
    r = _register(s, uname)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def user_b(s):
    uname = f"test_b_{uuid.uuid4().hex[:8]}"
    r = _register(s, uname)
    assert r.status_code == 200, r.text
    return r.json()


def auth(user):
    return {"Authorization": f"Bearer {user['access_token']}", "Content-Type": "application/json"}


# ---- Health/root ----
class TestHealth:
    def test_api_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()


# ---- Auth ----
class TestAuth:
    def test_register_returns_token_and_user(self, user_a):
        assert user_a["token_type"] == "bearer"
        assert user_a["access_token"]
        assert user_a["user"]["username"].startswith("test_a_")
        assert "id" in user_a["user"]

    def test_register_duplicate_username_fails(self, s, user_a):
        r = _register(s, user_a["user"]["username"])
        assert r.status_code == 400

    def test_login_success(self, s, user_a):
        r = s.post(f"{API}/auth/login", json={"username": user_a["user"]["username"], "password": "test1234"})
        assert r.status_code == 200
        assert r.json()["access_token"]

    def test_login_wrong_password(self, s, user_a):
        r = s.post(f"{API}/auth/login", json={"username": user_a["user"]["username"], "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_user(self, s):
        r = s.post(f"{API}/auth/login", json={"username": "no_such_user_xyz", "password": "abc123"})
        assert r.status_code == 401

    def test_me_with_valid_token(self, s, user_a):
        r = s.get(f"{API}/auth/me", headers=auth(user_a))
        assert r.status_code == 200
        assert r.json()["id"] == user_a["user"]["id"]

    def test_me_without_token(self, s):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---- Customer CRUD + Transactions + Summary ----
class TestCustomersTransactions:
    def test_full_flow(self, s, user_a):
        # create customer
        h = auth(user_a)
        r = s.post(f"{API}/customers", json={"name": "TEST_Ali", "phone": "0999", "max_debt": 500}, headers=h)
        assert r.status_code == 200, r.text
        cust = r.json()
        cid = cust["id"]
        assert cust["name"] == "TEST_Ali"
        assert cust["total_debt"] == 0.0
        assert cust["owner_id"] == user_a["user"]["id"]

        # list contains it
        r = s.get(f"{API}/customers", headers=h)
        assert r.status_code == 200
        assert any(c["id"] == cid for c in r.json())

        # get by id
        r = s.get(f"{API}/customers/{cid}", headers=h)
        assert r.status_code == 200
        assert r.json()["id"] == cid

        # search by name
        r = s.get(f"{API}/customers?search=TEST_Al", headers=h)
        assert r.status_code == 200
        assert any(c["id"] == cid for c in r.json())

        # search non-matching
        r = s.get(f"{API}/customers?search=zzzzzzz_no", headers=h)
        assert r.status_code == 200
        assert all(c["id"] != cid for c in r.json())

        # add debt 100
        r = s.post(f"{API}/transactions", json={"customer_id": cid, "type": "debt", "amount": 100, "notes": "n1"}, headers=h)
        assert r.status_code == 200, r.text
        tx1 = r.json()

        # add payment 30
        r = s.post(f"{API}/transactions", json={"customer_id": cid, "type": "payment", "amount": 30}, headers=h)
        assert r.status_code == 200
        tx2 = r.json()

        # customer total_debt = 70
        r = s.get(f"{API}/customers/{cid}", headers=h)
        assert r.status_code == 200
        assert r.json()["total_debt"] == 70.0

        # transactions sorted newest first
        r = s.get(f"{API}/transactions/{cid}", headers=h)
        assert r.status_code == 200
        txs = r.json()
        assert len(txs) == 2
        # newest first: tx2 came second, so tx2 first
        assert txs[0]["id"] == tx2["id"]
        assert txs[1]["id"] == tx1["id"]

        # summary aggregate
        r = s.get(f"{API}/customers/summary", headers=h)
        assert r.status_code == 200
        assert r.json()["total_debt"] >= 70.0

        # invalid amount
        r = s.post(f"{API}/transactions", json={"customer_id": cid, "type": "debt", "amount": 0}, headers=h)
        assert r.status_code == 400
        r = s.post(f"{API}/transactions", json={"customer_id": cid, "type": "debt", "amount": -5}, headers=h)
        assert r.status_code == 400

        # invalid type
        r = s.post(f"{API}/transactions", json={"customer_id": cid, "type": "invalid", "amount": 10}, headers=h)
        assert r.status_code == 400

        # delete transaction
        r = s.delete(f"{API}/transactions/{tx1['id']}", headers=h)
        assert r.status_code == 200
        # total_debt = -30 (only payment left)
        r = s.get(f"{API}/customers/{cid}", headers=h)
        assert r.json()["total_debt"] == -30.0

        # delete customer -> transactions cleaned
        r = s.delete(f"{API}/customers/{cid}", headers=h)
        assert r.status_code == 200
        r = s.get(f"{API}/customers/{cid}", headers=h)
        assert r.status_code == 404


# ---- Auth Isolation ----
class TestIsolation:
    def test_user_b_cannot_see_user_a_customer(self, s, user_a, user_b):
        # A creates a customer
        r = s.post(f"{API}/customers", json={"name": "TEST_Isolated", "phone": "111"}, headers=auth(user_a))
        assert r.status_code == 200
        cid = r.json()["id"]

        # B listing does not include A's customer
        r = s.get(f"{API}/customers", headers=auth(user_b))
        assert r.status_code == 200
        assert all(c["id"] != cid for c in r.json())

        # B cannot fetch A's customer
        r = s.get(f"{API}/customers/{cid}", headers=auth(user_b))
        assert r.status_code == 404

        # B cannot delete A's customer
        r = s.delete(f"{API}/customers/{cid}", headers=auth(user_b))
        assert r.status_code == 404

        # B cannot add transaction to A's customer
        r = s.post(f"{API}/transactions", json={"customer_id": cid, "type": "debt", "amount": 10}, headers=auth(user_b))
        assert r.status_code == 404

        # cleanup
        s.delete(f"{API}/customers/{cid}", headers=auth(user_a))
