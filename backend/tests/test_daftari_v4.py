"""Daftari v4 backend tests - Multi-store, party_type, employee verification codes, forgot-pin OTP."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _register(s, u, pw="test1234"):
    return s.post(f"{API}/auth/register", json={"username": u, "password": pw, "shop_name": "S"})


def _login(s, u, pw):
    return s.post(f"{API}/auth/login", json={"username": u, "password": pw})


@pytest.fixture(scope="module")
def admin_tok(s):
    r = _login(s, "admin", "admin1234")
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner(s):
    """Fresh owner per module to avoid polluting testuser data."""
    uname = f"v4own_{uuid.uuid4().hex[:6]}"
    r = _register(s, uname)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["access_token"], "id": d["user"]["id"], "username": uname}


# ---------- Multi-store ----------
class TestMultiStore:
    def test_default_store_on_register(self, s, owner):
        r = s.get(f"{API}/stores", headers=H(owner["token"]))
        assert r.status_code == 200
        stores = r.json()
        assert len(stores) >= 1
        assert stores[0]["owner_id"] == owner["id"]
        assert stores[0]["name"] == "المحل الرئيسي"

    def test_create_update_store(self, s, owner):
        r = s.post(f"{API}/stores", json={"name": "TEST_StoreB"}, headers=H(owner["token"]))
        assert r.status_code == 200
        sid = r.json()["id"]
        r = s.put(f"{API}/stores/{sid}", json={"name": "TEST_StoreB_edit"}, headers=H(owner["token"]))
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_StoreB_edit"

    def test_delete_last_store_forbidden(self, s):
        # fresh owner has exactly 1 store
        uname = f"v4solo_{uuid.uuid4().hex[:6]}"
        r = _register(s, uname)
        tok = r.json()["access_token"]
        stores = s.get(f"{API}/stores", headers=H(tok)).json()
        assert len(stores) == 1
        r = s.delete(f"{API}/stores/{stores[0]['id']}", headers=H(tok))
        assert r.status_code == 400
        assert "الوحيد" in r.json().get("detail", "")

    def test_delete_cascades(self, s, owner):
        # Create a scratch store, add a customer + tx, then delete
        r = s.post(f"{API}/stores", json={"name": "TEST_ScratchStore"}, headers=H(owner["token"]))
        sid = r.json()["id"]
        c = s.post(f"{API}/customers", json={"name": "TEST_Cascade", "phone": "0", "store_id": sid}, headers=H(owner["token"])).json()
        s.post(f"{API}/transactions", json={"customer_id": c["id"], "type": "debt", "amount": 5}, headers=H(owner["token"]))
        r = s.delete(f"{API}/stores/{sid}", headers=H(owner["token"]))
        assert r.status_code == 200
        # Customer should be gone
        r = s.get(f"{API}/customers/{c['id']}", headers=H(owner["token"]))
        assert r.status_code == 404

    def test_data_scoped_by_store(self, s, owner):
        h = H(owner["token"])
        # Ensure at least 2 stores
        stores = s.get(f"{API}/stores", headers=h).json()
        if len(stores) < 2:
            s.post(f"{API}/stores", json={"name": "TEST_StoreExtra"}, headers=h)
            stores = s.get(f"{API}/stores", headers=h).json()
        A, B = stores[0]["id"], stores[1]["id"]
        # Create in A
        c = s.post(f"{API}/customers", json={"name": "TEST_ScopedA", "phone": "1", "store_id": A}, headers=h).json()
        # Query B — should NOT include
        r = s.get(f"{API}/customers", params={"store_id": B}, headers=h)
        assert r.status_code == 200
        assert not any(x["id"] == c["id"] for x in r.json())
        r = s.get(f"{API}/customers", params={"store_id": A}, headers=h)
        assert any(x["id"] == c["id"] for x in r.json())


# ---------- Party type ----------
class TestPartyType:
    def test_supplier_filter_and_defaults(self, s, owner):
        h = H(owner["token"])
        stores = s.get(f"{API}/stores", headers=h).json()
        sid = stores[0]["id"]
        cust = s.post(f"{API}/customers", json={"name": "TEST_CustPT", "phone": "1", "store_id": sid}, headers=h).json()
        sup = s.post(f"{API}/customers", json={"name": "TEST_SupPT", "phone": "2", "store_id": sid, "party_type": "supplier"}, headers=h).json()
        assert sup["party_type"] == "supplier"

        # supplier filter
        r = s.get(f"{API}/customers", params={"store_id": sid, "party_type": "supplier"}, headers=h)
        ids = [c["id"] for c in r.json()]
        assert sup["id"] in ids and cust["id"] not in ids

        # customer filter
        r = s.get(f"{API}/customers", params={"store_id": sid, "party_type": "customer"}, headers=h)
        ids = [c["id"] for c in r.json()]
        assert cust["id"] in ids and sup["id"] not in ids

        # default → customers only
        r = s.get(f"{API}/customers", params={"store_id": sid}, headers=h)
        ids = [c["id"] for c in r.json()]
        assert sup["id"] not in ids

    def test_summary_by_party_type(self, s, owner):
        h = H(owner["token"])
        stores = s.get(f"{API}/stores", headers=h).json()
        sid = stores[0]["id"]
        sup = s.post(f"{API}/customers", json={"name": "TEST_SupSum", "phone": "9", "store_id": sid, "party_type": "supplier"}, headers=h).json()
        s.post(f"{API}/transactions", json={"customer_id": sup["id"], "type": "debt", "amount": 42.5}, headers=h)
        r = s.get(f"{API}/customers/summary", params={"store_id": sid, "party_type": "supplier"}, headers=h)
        assert r.status_code == 200
        assert r.json()["total_debt"] >= 42.5


# ---------- Owner verification codes / Employee PIN change ----------
@pytest.fixture(scope="module")
def emp(s, owner):
    uname = f"v4emp_{uuid.uuid4().hex[:6]}"
    r = s.post(f"{API}/staff", json={"username": uname, "password": "emp1234"}, headers=H(owner["token"]))
    assert r.status_code == 200
    lr = _login(s, uname, "emp1234")
    return {"token": lr.json()["access_token"], "username": uname, "password": "emp1234"}


class TestVerificationCode:
    def test_owner_generates_code(self, s, owner):
        r = s.post(f"{API}/owner/verification-codes", headers=H(owner["token"]))
        assert r.status_code == 200
        d = r.json()
        assert len(d["code"]) == 6 and d["code"].isdigit()
        assert d["ttl_minutes"] == 15
        assert "expires_at" in d

    def test_employee_cannot_generate(self, s, emp):
        r = s.post(f"{API}/owner/verification-codes", headers=H(emp["token"]))
        assert r.status_code == 403

    def test_employee_change_pw_flow(self, s, owner, emp):
        # no code -> 400
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": emp["password"], "new_password": "newp1234"}, headers=H(emp["token"]))
        assert r.status_code == 400
        assert "موافقة المالك" in r.json()["detail"]

        # wrong code -> 400
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": emp["password"], "new_password": "newp1234", "verification_code": "000000"},
                   headers=H(emp["token"]))
        assert r.status_code == 400

        # owner generates code
        code = s.post(f"{API}/owner/verification-codes", headers=H(owner["token"])).json()["code"]

        # valid -> 200
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": emp["password"], "new_password": "newp1234", "verification_code": code},
                   headers=H(emp["token"]))
        assert r.status_code == 200, r.text

        # login with new password
        lr = _login(s, emp["username"], "newp1234")
        assert lr.status_code == 200
        new_tok = lr.json()["access_token"]

        # code used → cannot reuse
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": "newp1234", "new_password": "another99", "verification_code": code},
                   headers=H(new_tok))
        assert r.status_code == 400

    def test_owner_change_pw_no_code_needed(self, s):
        uname = f"v4ownpw_{uuid.uuid4().hex[:6]}"
        r = _register(s, uname, "orig1234")
        tok = r.json()["access_token"]
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": "orig1234", "new_password": "brand9999"}, headers=H(tok))
        assert r.status_code == 200


# ---------- Forgot-pin / reset ----------
class TestForgotPin:
    def test_forgot_pin_no_enumeration(self, s):
        r = s.post(f"{API}/auth/forgot-pin", json={"username": "totally-nonexistent-xyz"})
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_forgot_and_reset_owner(self, s, admin_tok):
        uname = f"v4fp_{uuid.uuid4().hex[:6]}"
        r = _register(s, uname, "orig1234")
        assert r.status_code == 200
        r = s.post(f"{API}/auth/forgot-pin", json={"username": uname})
        assert r.status_code == 200
        # fetch code via admin
        r = s.get(f"{API}/admin/reset-codes", headers=H(admin_tok))
        assert r.status_code == 200
        codes = [c for c in r.json() if c["username"] == uname]
        assert len(codes) == 1
        code = codes[0]["code"]

        # invalid code
        r = s.post(f"{API}/auth/reset-pin", json={"username": uname, "code": "000000", "new_password": "resetnew1"})
        assert r.status_code == 400

        # short pw
        r = s.post(f"{API}/auth/reset-pin", json={"username": uname, "code": code, "new_password": "ab"})
        assert r.status_code == 400

        # valid
        r = s.post(f"{API}/auth/reset-pin", json={"username": uname, "code": code, "new_password": "resetnew1"})
        assert r.status_code == 200

        # login with new
        lr = _login(s, uname, "resetnew1")
        assert lr.status_code == 200

        # code used → 400 on reuse
        r = s.post(f"{API}/auth/reset-pin", json={"username": uname, "code": code, "new_password": "again1234"})
        assert r.status_code == 400

    def test_admin_reset_codes_super_admin_only(self, s, owner):
        r = s.get(f"{API}/admin/reset-codes", headers=H(owner["token"]))
        assert r.status_code == 403

    def test_forgot_pin_ignores_employee(self, s, emp, admin_tok):
        r = s.post(f"{API}/auth/forgot-pin", json={"username": emp["username"]})
        assert r.status_code == 200
        codes = s.get(f"{API}/admin/reset-codes", headers=H(admin_tok)).json()
        assert not any(c["username"] == emp["username"] for c in codes)
