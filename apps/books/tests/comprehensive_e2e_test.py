import time
import unittest

from fastapi.testclient import TestClient

from backend.main import app


class ComprehensiveBackendE2ETest(unittest.TestCase):
    client = None
    token = None
    headers = {}

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        test_email = f"e2e_user_{int(time.time()*1000)}@rooman.com"
        reg_res = cls.client.post("/api/auth/register", json={
            "name": "E2E Test User",
            "email": test_email,
            "password": "SecurePassword123",
            "organizationName": "Rooman E2E Org",
            "gstin": "29ABCDE1234F1Z5"
        })
        if reg_res.status_code == 201:
            data = reg_res.json()
            cls.token = data.get("accessToken") or data.get("token")
            cls.headers = {"Authorization": f"Bearer {cls.token}"}
        else:
            login_res = cls.client.post("/api/auth/login", json={
                "email": test_email,
                "password": "SecurePassword123"
            })
            if login_res.status_code == 200:
                ldata = login_res.json()
                cls.token = ldata.get("accessToken") or ldata.get("token")
                cls.headers = {"Authorization": f"Bearer {cls.token}"}

    # ── 1. SYSTEM HEALTH ──
    def test_01_health_check(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["database"], "ok")

    # ── 2. AUTHENTICATION FLOWS ──
    def test_02_register_duplicate_fails(self):
        dup_email = f"dup_{int(time.time()*1000)}@rooman.com"
        r1 = self.client.post("/api/auth/register", json={
            "name": "Duplicate Test",
            "email": dup_email,
            "password": "SecurePassword123",
            "organizationName": "Dup Org"
        })
        self.assertEqual(r1.status_code, 201)

        r2 = self.client.post("/api/auth/register", json={
            "name": "Duplicate Test",
            "email": dup_email,
            "password": "SecurePassword123",
            "organizationName": "Dup Org"
        })
        self.assertIn(r2.status_code, (400, 409))

    def test_03_login_success_and_invalid(self):
        email = f"login_test_{int(time.time()*1000)}@rooman.com"
        self.client.post("/api/auth/register", json={
            "name": "Login Test",
            "email": email,
            "password": "SecurePassword123",
            "organizationName": "Login Org"
        })

        res = self.client.post("/api/auth/login", json={
            "email": email,
            "password": "SecurePassword123"
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue("token" in res.json() or "accessToken" in res.json())

        bad_res = self.client.post("/api/auth/login", json={
            "email": email,
            "password": "WrongPassword999"
        })
        self.assertEqual(bad_res.status_code, 401)

    def test_04_me_endpoint(self):
        res = self.client.get("/api/auth/me", headers=self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn("user", res.json())
        self.assertIn("organization", res.json())

    # ── 3. ITEMS & CATALOG MANAGEMENT ──
    def test_05_items_crud(self):
        item_payload = {
            "name": f"E2E Switch {int(time.time()*1000)}",
            "type": "goods",
            "sku": f"SW-{int(time.time()*1000)}",
            "unit": "pcs",
            "description": "24-port Gigabit Managed Switch",
            "sellingPrice": 45000.0,
            "purchasePrice": 32000.0,
            "openingStock": 15.0,
            "reorderLevel": 3.0
        }
        create_res = self.client.post("/api/items", headers=self.headers, json=item_payload)
        self.assertEqual(create_res.status_code, 201)
        created_id = create_res.json()["id"]

        get_res = self.client.get(f"/api/items/{created_id}", headers=self.headers)
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["id"], created_id)

        list_res = self.client.get("/api/items", headers=self.headers)
        self.assertEqual(list_res.status_code, 200)
        self.assertIn("items", list_res.json())

        del_res = self.client.delete(f"/api/items/{created_id}", headers=self.headers)
        self.assertEqual(del_res.status_code, 200)

    # ── 4. CONTACTS & CUSTOMERS ──
    def test_06_contacts_crud(self):
        contact_payload = {
            "type": "customer",
            "displayName": "Acme Global Solutions",
            "companyName": "Acme Global Corp",
            "email": "billing@acmeglobal.com",
            "phone": "+91 98765 43210",
            "gstTreatment": "registered_business",
            "paymentTermsDays": 30
        }
        res = self.client.post("/api/contacts", headers=self.headers, json=contact_payload)
        self.assertEqual(res.status_code, 201)
        contact = res.json()
        self.assertEqual(contact["displayName"], "Acme Global Solutions")

        list_res = self.client.get("/api/contacts?type=customer", headers=self.headers)
        self.assertEqual(list_res.status_code, 200)
        self.assertGreater(len(list_res.json()["items"]), 0)

    # ── 5. DASHBOARD SUMMARY ──
    def test_07_dashboard_summary(self):
        res = self.client.get("/api/dashboard/summary?period=this_fiscal_year", headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("receivables", data)
        self.assertIn("payables", data)

    # ── 6. EMAIL & SMTP ENDPOINTS ──
    def test_08_email_service_status(self):
        res = self.client.get("/api/email/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "operational")
        self.assertEqual(data["sender"], "shalya@rooman.com")
        self.assertIn("smtp.gmail.com", data["smtp_server"])

    def test_09_email_validation_and_errors(self):
        bad_req = self.client.post("/api/email/send-due-reminder", json={})
        self.assertEqual(bad_req.status_code, 422)

        bad_inv = self.client.post("/api/email/send-invoice", json={})
        self.assertEqual(bad_inv.status_code, 422)

        bad_msg = self.client.post("/api/email/send-message", json={})
        self.assertEqual(bad_msg.status_code, 422)

    # ── 7. ERROR HANDLING AND 404s ──
    def test_10_non_existent_route(self):
        res = self.client.get("/api/this-does-not-exist")
        self.assertEqual(res.status_code, 404)

if __name__ == "__main__":
    unittest.main()
