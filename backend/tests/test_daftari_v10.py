"""Daftari iteration 10 backend tests.

Covers editable WhatsApp transaction templates on /api/settings:
 - GET returns defaults for the 4 template fields
 - PUT (owner) can update each of the 4 templates individually
 - PUT preserves other 3 templates + reminder_template
 - PUT as employee -> 403 (CurrentOwner)
 - Cleanup: restores all 4 templates to defaults
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "admin"
ADMIN_PW = "admin1234"
TESTUSER = "testuser"
TESTUSER_PW = "test1234"

# Exact defaults from /app/backend/server.py Settings model
DEFAULTS = {
    "reminder_template": (
        "مرحباً {name}، نود تذكيرك بأن حسابك الحالي في {shop} هو {amount} {currency}. نسعد بزيارتك."
    ),
    "customer_debt_template": (
        "مرحباً {name}، تم إضافة مبلغ {amount} {currency} إلى حسابك في {shop}. رصيدك الحالي: {balance} {currency}."
    ),
    "customer_payment_template": (
        "مرحباً {name}، شكراً لك على السداد. تم استلام {amount} {currency} في {shop}. رصيدك الحالي: {balance} {currency}."
    ),
    "supplier_debt_template": (
        "مرحباً {name}، تم تسجيل بضاعة بالآجل بقيمة {amount} {currency}. إجمالي حسابكم لدينا: {balance} {currency}. شكراً لكم."
    ),
    "supplier_payment_template": (
        "مرحباً {name}، تم تسليمكم دفعة بقيمة {amount} {currency}. إجمالي حسابكم لدينا: {balance} {currency}. شكراً لكم."
    ),
}

TEMPLATE_KEYS = [
    "customer_debt_template",
    "customer_payment_template",
    "supplier_debt_template",
    "supplier_payment_template",
]


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def owner_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": TESTUSER, "password": TESTUSER_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


STATE = {
    "employee_id": None,
    "employee_tok": None,
    "employee_username": f"v10_emp_{uuid.uuid4().hex[:6]}",
    "initial_settings": None,
}


class TestAResetToDefaults:
    """Reset owner settings to defaults BEFORE tests so GET returns defaults."""

    def test_reset_before(self, s, owner_tok):
        # Snapshot current settings first
        r0 = s.get(f"{API}/settings", headers=H(owner_tok))
        assert r0.status_code == 200
        STATE["initial_settings"] = r0.json()

        # Force all 4 templates + reminder to defaults
        r = s.put(f"{API}/settings", headers=H(owner_tok), json=DEFAULTS)
        assert r.status_code == 200, r.text


class TestBGetDefaults:
    def test_get_returns_defaults(self, s, owner_tok):
        r = s.get(f"{API}/settings", headers=H(owner_tok))
        assert r.status_code == 200, r.text
        body = r.json()
        for k in TEMPLATE_KEYS:
            assert k in body, f"missing field {k}"
            assert body[k] == DEFAULTS[k], f"default mismatch for {k}: got {body[k]!r}"


class TestCPutEachTemplate:
    @pytest.mark.parametrize("field", TEMPLATE_KEYS)
    def test_put_individual_template(self, s, owner_tok, field):
        marker = f"V10-{field.upper()}-{uuid.uuid4().hex[:6]}"
        new_val = f"مرحباً {{name}} — {marker} — {{amount}} {{currency}}"

        r = s.put(f"{API}/settings", headers=H(owner_tok), json={field: new_val})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body[field] == new_val

        # Other 3 template fields must remain at defaults, plus reminder_template
        for other in TEMPLATE_KEYS:
            if other == field:
                continue
            assert body[other] == DEFAULTS[other], (
                f"PUT {field} corrupted {other}: got {body[other]!r}"
            )
        assert body["reminder_template"] == DEFAULTS["reminder_template"]

        # Verify persistence via GET
        rg = s.get(f"{API}/settings", headers=H(owner_tok))
        assert rg.status_code == 200
        gbody = rg.json()
        assert gbody[field] == new_val
        for other in TEMPLATE_KEYS:
            if other == field:
                continue
            assert gbody[other] == DEFAULTS[other]
        assert gbody["reminder_template"] == DEFAULTS["reminder_template"]

        # Restore this field to default for next parametrized case
        r_restore = s.put(
            f"{API}/settings", headers=H(owner_tok), json={field: DEFAULTS[field]}
        )
        assert r_restore.status_code == 200
        assert r_restore.json()[field] == DEFAULTS[field]


class TestDPutSupplierDebtIsolated:
    """Explicit check for review-request item #2:
    Update ONLY supplier_debt_template and confirm the other 3 templates
    + reminder_template are untouched (verified via GET afterwards).
    """

    def test_put_supplier_debt_only(self, s, owner_tok):
        distinctive = "SUPPLIER-DEBT-ISOLATED-{}".format(uuid.uuid4().hex[:8])
        new_val = "مرحباً {name}، " + distinctive + " {amount} {currency} — {balance}"

        r = s.put(
            f"{API}/settings",
            headers=H(owner_tok),
            json={"supplier_debt_template": new_val},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["supplier_debt_template"] == new_val
        assert body["customer_debt_template"] == DEFAULTS["customer_debt_template"]
        assert body["customer_payment_template"] == DEFAULTS["customer_payment_template"]
        assert body["supplier_payment_template"] == DEFAULTS["supplier_payment_template"]
        assert body["reminder_template"] == DEFAULTS["reminder_template"]

        # Independent GET verification
        rg = s.get(f"{API}/settings", headers=H(owner_tok)).json()
        assert rg["supplier_debt_template"] == new_val
        assert rg["customer_debt_template"] == DEFAULTS["customer_debt_template"]
        assert rg["customer_payment_template"] == DEFAULTS["customer_payment_template"]
        assert rg["supplier_payment_template"] == DEFAULTS["supplier_payment_template"]
        assert rg["reminder_template"] == DEFAULTS["reminder_template"]


class TestEEmployeeForbidden:
    def test_create_employee(self, s, owner_tok):
        r = s.post(
            f"{API}/staff",
            headers=H(owner_tok),
            json={
                "username": STATE["employee_username"],
                "password": "emppw1",
                "display_name": "V10 Emp",
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

    def test_employee_can_get_settings(self, s):
        # GET uses CurrentUser so employee CAN read settings
        r = s.get(f"{API}/settings", headers=H(STATE["employee_tok"]))
        assert r.status_code == 200, r.text
        body = r.json()
        # Employee reads owner's settings (scope = root_owner_id)
        for k in TEMPLATE_KEYS:
            assert k in body

    def test_employee_put_forbidden(self, s):
        r = s.put(
            f"{API}/settings",
            headers=H(STATE["employee_tok"]),
            json={"supplier_debt_template": "should_fail"},
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


class TestZZZRestoreAndCleanup:
    def test_restore_defaults(self, s, owner_tok):
        r = s.put(f"{API}/settings", headers=H(owner_tok), json=DEFAULTS)
        assert r.status_code == 200
        body = r.json()
        for k, v in DEFAULTS.items():
            assert body[k] == v

        # Final GET check
        rg = s.get(f"{API}/settings", headers=H(owner_tok)).json()
        for k, v in DEFAULTS.items():
            assert rg[k] == v, f"restore failed for {k}"

    def test_cleanup_employee(self, s, owner_tok):
        if STATE.get("employee_id"):
            r = s.delete(
                f"{API}/staff/{STATE['employee_id']}", headers=H(owner_tok)
            )
            assert r.status_code == 200, r.text
