"""The identity fields follow one rulebook, whichever form they appear on.

A phone number, GSTIN, PAN or IFSC means the same thing on a customer, a
vendor, an employee, a bank account and the organisation profile, so the same
value is accepted or rejected in all of them. These tests exist because the
rules used to differ per form - the organisation profile validated a phone
number strictly while a customer's phone accepted any text at all.
"""

import pytest

from tests.conftest import auth, register_org


@pytest.fixture
def h(client):
    return auth(register_org(client, "Formats")["token"])


def _contact(client, h, **fields):
    return client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Format Test", **fields})


def _employee(client, h, **fields):
    return client.post(
        "/api/payroll/employees", headers=h, json={"name": "Format Test", "dateOfJoining": "2020-01-01", "basicSalary": 1000, **fields}
    )


def _bank(client, h, **fields):
    return client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Format Test", "type": "bank", "openingBalance": 0, "openingBalanceDate": "2026-04-01", **fields},
    )


# --------------------------------------------------------------- phone number


@pytest.mark.parametrize(
    "typed,stored",
    [
        ("9876543210", "9876543210"),
        ("+91 98765 43210", "9876543210"),
        ("098765 43210", "9876543210"),
        ("98765-43210", "9876543210"),
        ("(98765) 43210", "9876543210"),
    ],
)
def test_phone_accepts_the_usual_spellings_and_stores_ten_digits(client, h, typed, stored):
    res = _contact(client, h, phone=typed)
    assert res.status_code == 201, res.text
    assert res.json()["phone"] == stored


@pytest.mark.parametrize("bad", ["98765abcde", "987654321", "98765432101", "not a phone"])
def test_phone_rejects_what_is_not_a_number(client, h, bad):
    assert _contact(client, h, phone=bad).status_code == 422


def test_phone_rule_is_the_same_on_the_organisation(client, h):
    res = client.put("/api/organization", headers=h, json={"phone": "+91 98765 43210"})
    assert res.status_code == 200, res.text
    assert res.json()["phone"] == "9876543210"
    assert client.put("/api/organization", headers=h, json={"phone": "12345"}).status_code == 422


# ---------------------------------------------------------------- GSTIN / PAN


def test_gstin_is_validated_on_contacts_not_just_the_organisation(client, h):
    assert _contact(client, h, gstin="NOT-A-GSTIN").status_code == 422
    ok = _contact(client, h, gstin="29abcde1234f1z5")
    assert ok.status_code == 201, ok.text
    assert ok.json()["gstin"] == "29ABCDE1234F1Z5", "should be stored upper-cased"


def test_pan_is_validated_on_contacts_and_employees(client, h):
    assert _contact(client, h, pan="12345ABCDE").status_code == 422
    assert _employee(client, h, pan="12345ABCDE").status_code == 422

    contact = _contact(client, h, pan="abcde1234f")
    assert contact.status_code == 201 and contact.json()["pan"] == "ABCDE1234F"
    employee = _employee(client, h, pan="abcde1234f")
    assert employee.status_code == 201 and employee.json()["pan"] == "ABCDE1234F"


# ----------------------------------------------------------- bank identifiers


@pytest.mark.parametrize("bad", ["HDFC1234567", "HD0001234", "hdfc0001234567"])
def test_ifsc_must_look_like_an_ifsc(client, h, bad):
    assert _bank(client, h, ifsc=bad).status_code == 422
    assert _employee(client, h, bankIfsc=bad).status_code == 422


def test_ifsc_is_accepted_and_upper_cased(client, h):
    res = _bank(client, h, ifsc="hdfc0001234")
    assert res.status_code == 201, res.text
    assert res.json()["ifsc"] == "HDFC0001234"


@pytest.mark.parametrize("bad", ["12345", "not-digits", "1234567890123456789"])
def test_bank_account_number_must_be_digits_of_a_plausible_length(client, h, bad):
    assert _bank(client, h, accountNumber=bad).status_code == 422


def test_bank_account_number_accepts_a_real_one(client, h):
    assert _bank(client, h, accountNumber="50100123456789").status_code == 201


# ------------------------------------------------------------------- pin code


def test_postal_code_must_be_six_digits(client, h):
    assert client.put("/api/organization", headers=h, json={"postalCode": "56002A"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"postalCode": "5600"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"postalCode": "560001"}).status_code == 200


# ----------------------------------------------------------------------- names


def test_person_names_reject_digits_everywhere_they_are_entered(client, h):
    assert _contact(client, h, displayName="Shivani 123").status_code == 422
    assert _contact(client, h, contactPerson="Ravi 99").status_code == 422
    assert _employee(client, h, name="Asha 42").status_code == 422


def test_company_name_allows_digits_but_not_a_bare_number(client, h):
    """Unlike a person's name, a company name can carry digits - 3M India and
    7-Eleven are real - so only a value with no letters at all is refused."""
    ok = _contact(client, h, companyName="3M India")
    assert ok.status_code == 201, ok.text
    assert ok.json()["companyName"] == "3M India"

    assert _contact(client, h, companyName="Acme 123").status_code == 201
    assert _contact(client, h, companyName="12345").status_code == 422


def test_product_names_still_allow_digits(client, h):
    """The no-digits rule covers people and companies, not things: "27 inch
    Monitor" and "A4 Paper" are what products are actually called."""
    res = client.post("/api/items", headers=h, json={"name": "27 inch Monitor", "sku": "MON-27X", "sellingPrice": 10000})
    assert res.status_code == 201, res.text


# ------------------------------------------------------------ clearing a field


def test_blank_values_still_clear_an_optional_field(client, h):
    """Validation must not turn "remove this value" into an error."""
    created = _contact(client, h, phone="9876543210").json()
    cleared = client.put(f"/api/contacts/{created['id']}", headers=h, json={"phone": ""})
    assert cleared.status_code == 200, cleared.text


# ------------------------------------------------- fields the forms now capture


def test_contact_captures_primary_contact_parts_and_bank_details(client, h):
    """The primary contact is entered in parts and the vendor's bank details are
    held on the contact, so a payment run does not need them re-keyed."""
    res = client.post(
        "/api/contacts",
        headers=h,
        json={
            "type": "vendor",
            "contactType": "business",
            "displayName": "Dell India",
            "salutation": "Mr.",
            "firstName": "Ravi",
            "lastName": "Kumar",
            "phone": "08012345678",
            "mobile": "+91 98765 43210",
            "bankAccountHolder": "Dell India Pvt Ltd",
            "bankName": "HDFC Bank",
            "bankAccountNumber": "50100123456789",
            "bankIfsc": "hdfc0001234",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["contactType"] == "business"
    assert (body["salutation"], body["firstName"], body["lastName"]) == ("Mr.", "Ravi", "Kumar")
    # The single display string every list and PDF reads is kept in step.
    assert body["contactPerson"] == "Mr. Ravi Kumar"
    assert body["phone"] == "8012345678" and body["mobile"] == "9876543210"
    assert body["bankIfsc"] == "HDFC0001234"
    assert body["bankAccountNumber"] == "50100123456789"


def test_editing_a_name_part_updates_the_display_form(client, h):
    created = client.post(
        "/api/contacts",
        headers=h,
        json={"type": "customer", "displayName": "Acme", "salutation": "Ms.", "firstName": "Asha", "lastName": "Rao"},
    ).json()
    assert created["contactPerson"] == "Ms. Asha Rao"

    updated = client.put(f"/api/contacts/{created['id']}", headers=h, json={"lastName": "Nair"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["contactPerson"] == "Ms. Asha Nair"


def test_invoice_and_bill_carry_order_number_and_subject(client, org):
    h = org["h"]
    inv = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": org["customer"]["id"],
            "date": "2026-09-01",
            "orderNumber": "PO-9912",
            "subject": "Q3 consulting retainer",
            "salesperson": "Priya Nair",
            "lines": [{"description": "Consulting", "quantity": 1, "rate": 5000, "taxRate": 0}],
        },
    )
    assert inv.status_code == 201, inv.text
    assert inv.json()["orderNumber"] == "PO-9912"
    assert inv.json()["subject"] == "Q3 consulting retainer"
    assert inv.json()["salesperson"] == "Priya Nair"

    bill = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": org["vendor"]["id"],
            "date": "2026-09-01",
            "orderNumber": "PO-4451",
            "subject": "Monitors for the new office",
            "lines": [{"description": "Monitor", "quantity": 1, "rate": 7000, "taxRate": 0}],
        },
    )
    assert bill.status_code == 201, bill.text
    assert bill.json()["orderNumber"] == "PO-4451"
    assert bill.json()["subject"] == "Monitors for the new office"


def test_contact_can_override_its_receivables_account(client, org):
    """A customer pointed at its own receivables account posts there instead of
    the org-wide 1100, which is what the per-contact account selector is for."""
    h = org["h"]
    accounts = client.get("/api/accounting/accounts", headers=h).json()
    default_ar = next(a for a in accounts if a["code"] == "1100")
    other_ar = client.post(
        "/api/accounting/accounts",
        headers=h,
        json={"code": "1150", "name": "Receivables - Key Accounts", "type": "asset", "subtype": "accounts_receivable"},
    ).json()

    customer = client.post(
        "/api/contacts",
        headers=h,
        json={"type": "customer", "displayName": "Key Account", "ledgerAccountId": other_ar["id"]},
    ).json()
    assert customer["ledgerAccountId"] == other_ar["id"]

    inv = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": customer["id"],
            "date": "2026-09-01",
            "status": "sent",
            "lines": [{"description": "Work", "quantity": 1, "rate": 1000, "taxRate": 0}],
        },
    )
    assert inv.status_code == 201, inv.text
    number = inv.json()["invoiceNumber"]

    # Match on this invoice's own number - the shared org fixture has plenty of
    # other invoices posting to the default account.
    def mentions(lines):
        return any(number in (line.get("reference") or "") or number in (line.get("description") or "") for line in lines)

    posted = client.get(f"/api/accounting/ledger/{other_ar['id']}", headers=h).json()["lines"]
    assert mentions(posted), "should post to the overridden account"

    default_lines = client.get(f"/api/accounting/ledger/{default_ar['id']}", headers=h).json()["lines"]
    assert not mentions(default_lines), "should not touch the default account"


def test_an_unknown_ledger_account_is_rejected(client, h):
    res = _contact(client, h, ledgerAccountId="does-not-exist")
    assert res.status_code == 404, res.text
