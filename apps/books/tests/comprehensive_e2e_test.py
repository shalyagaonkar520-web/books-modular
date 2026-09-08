import unittest
import requests
import json
import base64
import time

BASE_URL = "http://127.0.0.1:8000"

class ComprehensiveBackendE2ETest(unittest.TestCase):
    
    # ── 1. SYSTEM HEALTH ──
    def test_01_health_check(self):
        res = requests.get(f"{BASE_URL}/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["database"], "Connected")

    # ── 2. AUTHENTICATION FLOWS ──
    def test_02_demo_users_endpoint(self):
        res = requests.get(f"{BASE_URL}/api/auth/demo-users")
        self.assertEqual(res.status_code, 200)
        users = res.json()
        self.assertGreaterEqual(len(users), 2)
        emails = [u["email"] for u in users]
        self.assertIn("admin@zylkerbooks.com", emails)

    def test_03_login_success(self):
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@zylkerbooks.com",
            "password": "password123"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("token", data)
        self.assertEqual(data["user"]["email"], "admin@zylkerbooks.com")

    def test_04_login_invalid_credentials(self):
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@zylkerbooks.com",
            "password": "wrongpassword"
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("detail", res.json())

    def test_05_register_new_user_and_duplicate(self):
        test_email = f"test_e2e_{int(time.time()*1000)}@rooman.com"
        # Register
        res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "E2E Test User",
            "email": test_email,
            "password": "SecurePassword@123",
            "organization": "Rooman E2E Org",
            "role": "Accountant"
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["user"]["email"], test_email)

        # Duplicate registration should fail
        dup_res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "E2E Test User",
            "email": test_email,
            "password": "SecurePassword@123"
        })
        self.assertEqual(dup_res.status_code, 400)

    def test_06_oauth_providers_and_flow(self):
        res = requests.get(f"{BASE_URL}/api/auth/oauth/providers")
        self.assertEqual(res.status_code, 200)
        providers = [p["id"] for p in res.json()]
        self.assertIn("google", providers)

        # Valid OAuth login
        login_res = requests.post(f"{BASE_URL}/api/auth/oauth/google", json={
            "provider": "google",
            "email": "google_test@rooman.com",
            "name": "Google Tester",
            "organization": "Rooman Google"
        })
        self.assertEqual(login_res.status_code, 200)

        # Invalid OAuth provider
        bad_res = requests.post(f"{BASE_URL}/api/auth/oauth/unsupported_provider", json={})
        self.assertEqual(bad_res.status_code, 400)

    def test_07_me_endpoint(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@zylkerbooks.com",
            "password": "password123"
        })
        token = login_res.json()["token"]
        me_res = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["email"], "admin@zylkerbooks.com")

    # ── 3. ITEMS & CATALOG MANAGEMENT ──
    def test_08_items_crud(self):
        # 1. Reset
        requests.post(f"{BASE_URL}/api/items/reset")

        # 2. List
        list_res = requests.get(f"{BASE_URL}/api/items")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 5)

        # 3. Create
        item_payload = {
            "name": "E2E Test Industrial Switch",
            "type": "goods",
            "sku": "E2E-SW-001",
            "unit": "pcs",
            "description": "24 port rack switch",
            "salesInfo": {"sellingPrice": 45000.0, "salesAccount": "Sales - Hardware"},
            "purchaseInfo": {"costPrice": 32000.0, "costAccount": "Cost of Goods Sold"},
            "inventoryInfo": {"trackInventory": True, "openingStock": 15.0, "reorderLevel": 3.0}
        }
        create_res = requests.post(f"{BASE_URL}/api/items", json=item_payload)
        self.assertEqual(create_res.status_code, 201)
        created_id = create_res.json()["id"]

        # 4. Get by ID
        get_res = requests.get(f"{BASE_URL}/api/items/{created_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["name"], "E2E Test Industrial Switch")

        # 5. Update
        update_res = requests.put(f"{BASE_URL}/api/items/{created_id}", json={
            "name": "E2E Test Industrial Switch v2",
            "salesInfo": {"sellingPrice": 48000.0}
        })
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["name"], "E2E Test Industrial Switch v2")

        # 6. Delete
        del_res = requests.delete(f"{BASE_URL}/api/items/{created_id}")
        self.assertEqual(del_res.status_code, 200)

        # Verify not found
        get_again = requests.get(f"{BASE_URL}/api/items/{created_id}")
        self.assertEqual(get_again.status_code, 404)

    # ── 4. INVOICES & LEDGER ──
    def test_09_invoices_endpoints(self):
        # 1. List invoices
        res = requests.get(f"{BASE_URL}/api/invoices")
        self.assertEqual(res.status_code, 200)
        invs = res.json()
        self.assertGreater(len(invs), 0)
        inv_id = invs[0]["id"]

        # 2. Get invoice by ID
        single = requests.get(f"{BASE_URL}/api/invoices/{inv_id}")
        self.assertEqual(single.status_code, 200)

        # 3. Get invoice HTML
        html_res = requests.get(f"{BASE_URL}/api/invoices/{inv_id}/html")
        self.assertEqual(html_res.status_code, 200)
        self.assertIn("Tax Invoice", html_res.text)

        # 4. Update status
        status_res = requests.put(f"{BASE_URL}/api/invoices/{inv_id}/status", json={"status": "Paid"})
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["status"], "Paid")

        # 5. Invalid invoice ID
        bad_inv = requests.get(f"{BASE_URL}/api/invoices/NON_EXISTENT_ID")
        self.assertEqual(bad_inv.status_code, 404)

    # ── 5. DASHBOARD & FINANCIAL ANALYTICS ──
    def test_10_dashboard_summary(self):
        res = requests.get(f"{BASE_URL}/api/dashboard/summary?period=this_fiscal_year")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("receivables", data)
        self.assertIn("payables", data)
        self.assertIn("cashFlow", data)
        self.assertIn("inventory", data)
        self.assertGreaterEqual(data["receivables"]["totalReceivables"], 0)

    # ── 6. DOCUMENTS VAULT ──
    def test_11_documents_endpoints(self):
        # List
        res = requests.get(f"{BASE_URL}/api/documents")
        self.assertEqual(res.status_code, 200)
        docs = res.json()
        self.assertGreater(len(docs), 0)

        # Upload new doc
        upload_res = requests.post(f"{BASE_URL}/api/documents", json={
            "title": "E2E_Test_Audit_Document.pdf",
            "category": "Tax & GST",
            "uploadedBy": "E2E Test Runner",
            "size": "1.2 MB",
            "notes": "Automated verification file"
        })
        self.assertEqual(upload_res.status_code, 201)
        self.assertTrue(upload_res.json()["verified"])

    # ── 7. PAYROLL MANAGEMENT ──
    def test_12_payroll_endpoints(self):
        # 1. List employees
        res = requests.get(f"{BASE_URL}/api/payroll/employees")
        self.assertEqual(res.status_code, 200)
        emps = res.json()
        self.assertGreater(len(emps), 0)
        emp_id = emps[0]["id"]

        # 2. Get payslip
        ps_res = requests.get(f"{BASE_URL}/api/payroll/payslip/{emp_id}?month=August%202026")
        self.assertEqual(ps_res.status_code, 200)
        ps_data = ps_res.json()
        self.assertIn("net", ps_data)
        self.assertIn("netInWords", ps_data)

        # 3. Disburse payroll
        disburse_res = requests.post(f"{BASE_URL}/api/payroll/disburse")
        self.assertEqual(disburse_res.status_code, 200)

    # ── 8. EMAIL & SMTP ENDPOINTS ──
    def test_13_email_service_status(self):
        res = requests.get(f"{BASE_URL}/api/email/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "operational")
        self.assertEqual(data["sender"], "shalya@rooman.com")

    def test_14_email_validation_and_errors(self):
        # Missing required fields
        bad_req = requests.post(f"{BASE_URL}/api/email/send-due-reminder", json={})
        self.assertEqual(bad_req.status_code, 422)

    # ── 9. ERROR HANDLING AND 404s ──
    def test_15_non_existent_route(self):
        res = requests.get(f"{BASE_URL}/api/this-does-not-exist")
        self.assertEqual(res.status_code, 404)

if __name__ == "__main__":
    unittest.main()
