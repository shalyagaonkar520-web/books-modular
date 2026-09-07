import unittest
import requests

BASE_URL = "http://127.0.0.1:8000"

class TestZohoBooksFastAPI(unittest.TestCase):
    def setUp(self):
        # Reset sample data before each test
        requests.post(f"{BASE_URL}/api/items/reset")

    def test_health_check(self):
        response = requests.get(f"{BASE_URL}/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["database"], "Connected")

    def test_get_items(self):
        response = requests.get(f"{BASE_URL}/api/items")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertEqual(len(items), 5)

    def test_filter_and_search_items(self):
        # Search by keyword
        response = requests.get(f"{BASE_URL}/api/items?search=Dell")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertEqual(len(items), 1)
        self.assertIn("Dell", items[0]["name"])

        # Filter by type 'goods'
        response = requests.get(f"{BASE_URL}/api/items?type_filter=goods")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertTrue(all(item["type"] == "goods" for item in items))

        # Filter by inventory 'tracked'
        response = requests.get(f"{BASE_URL}/api/items?inventory_filter=tracked")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertTrue(all(item.get("inventoryInfo", {}).get("trackInventory") for item in items))

    def test_create_item_success(self):
        new_item = {
            "name": "Apple MacBook Pro 16",
            "type": "goods",
            "sku": "LAP-MBP-16",
            "unit": "pcs",
            "description": "M3 Max 36GB 1TB Space Black",
            "salesInfo": {
                "sellingPrice": 349900.0,
                "salesAccount": "Sales - Hardware",
                "description": "High performance workstation laptop",
            },
            "purchaseInfo": {
                "costPrice": 295000.0,
                "costAccount": "Cost of Goods Sold",
                "preferredVendor": "Apple Authorised Reseller",
            },
            "inventoryInfo": {
                "trackInventory": True,
                "openingStock": 8.0,
                "openingStockRate": 295000.0,
                "reorderLevel": 2.0,
                "warehouseLocation": "Secure Vault - V1",
            }
        }
        response = requests.post(f"{BASE_URL}/api/items", json=new_item)
        self.assertEqual(response.status_code, 201)
        created = response.json()
        self.assertEqual(created["name"], new_item["name"])
        self.assertEqual(created["sku"], new_item["sku"])
        self.assertTrue("id" in created)

        # Verify duplicate SKU prevention
        dup_response = requests.post(f"{BASE_URL}/api/items", json=new_item)
        self.assertEqual(dup_response.status_code, 400)

    def test_update_item(self):
        items = requests.get(f"{BASE_URL}/api/items").json()
        item_id = items[0]["id"]

        update_payload = {
            "name": "Updated Item Name",
            "salesInfo": {
                "sellingPrice": 42000.0,
                "salesAccount": "Sales - Hardware"
            }
        }
        response = requests.put(f"{BASE_URL}/api/items/{item_id}", json=update_payload)
        self.assertEqual(response.status_code, 200)
        updated = response.json()
        self.assertEqual(updated["name"], "Updated Item Name")
        self.assertEqual(updated["salesInfo"]["sellingPrice"], 42000.0)

    def test_delete_item(self):
        items = requests.get(f"{BASE_URL}/api/items").json()
        initial_count = len(items)
        item_id = items[0]["id"]

        response = requests.delete(f"{BASE_URL}/api/items/{item_id}")
        self.assertEqual(response.status_code, 200)

        new_items = requests.get(f"{BASE_URL}/api/items").json()
        self.assertEqual(len(new_items), initial_count - 1)

    def test_dashboard_summary(self):
        for period in ["this_fiscal_year", "this_month", "last_month", "this_quarter"]:
            response = requests.get(f"{BASE_URL}/api/dashboard/summary?period={period}")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertIn("receivables", data)
            self.assertIn("payables", data)
            self.assertIn("cashFlow", data)
            self.assertIn("inventory", data)
            self.assertGreater(data["receivables"]["totalReceivables"], 0)
            self.assertGreater(data["inventory"]["totalInventoryValuation"], 0)

    def test_auth_login_success(self):
        payload = {"email": "admin@zylkerbooks.com", "password": "password123"}
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("token", data)
        self.assertEqual(data["user"]["email"], "admin@zylkerbooks.com")
        self.assertEqual(data["user"]["role"], "Administrator")

    def test_auth_login_invalid(self):
        payload = {"email": "admin@zylkerbooks.com", "password": "wrongpassword"}
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        self.assertEqual(response.status_code, 401)

    def test_auth_demo_users(self):
        response = requests.get(f"{BASE_URL}/api/auth/demo-users")
        self.assertEqual(response.status_code, 200)
        users = response.json()
        self.assertGreaterEqual(len(users), 2)
        roles = [u["role"] for u in users]
        self.assertIn("Administrator", roles)
        self.assertIn("Chief Accountant", roles)

    def test_auth_register(self):
        import time
        unique_email = f"testuser_{int(time.time())}@example.com"
        payload = {
            "name": "Integration Test User",
            "email": unique_email,
            "password": "securepassword123",
            "organization": "Test Corp"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["user"]["email"], unique_email)

        # Duplicate registration should fail
        dup_res = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        self.assertEqual(dup_res.status_code, 400)

    def test_oauth_providers(self):
        response = requests.get(f"{BASE_URL}/api/auth/oauth/providers")
        self.assertEqual(response.status_code, 200)
        providers = response.json()
        ids = [p["id"] for p in providers]
        self.assertIn("google", ids)
        self.assertIn("microsoft", ids)
        self.assertIn("zoho", ids)
        self.assertIn("github", ids)

    def test_oauth_login_google(self):
        payload = {
            "provider": "google",
            "email": "shalya.oauth.test@gmail.com",
            "name": "Shalya Google SSO User",
            "avatar": "https://lh3.googleusercontent.com/a/test",
            "role": "Administrator"
        }
        response = requests.post(f"{BASE_URL}/api/auth/oauth/google", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("token", data)
        self.assertEqual(data["user"]["email"], "shalya.oauth.test@gmail.com")
        self.assertEqual(data["user"]["name"], "Shalya Google SSO User")
        self.assertEqual(data["user"]["authProvider"], "google")

    def test_oauth_login_microsoft(self):
        response = requests.post(f"{BASE_URL}/api/auth/oauth/microsoft")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("token", data)
        self.assertEqual(data["user"]["authProvider"], "microsoft")

    def test_invoices_api(self):
        # List invoices
        res = requests.get(f"{BASE_URL}/api/invoices")
        self.assertEqual(res.status_code, 200)
        invoices = res.json()
        self.assertGreaterEqual(len(invoices), 5)

        # Create new invoice
        new_inv = {
            "client": "Zoho Test Corporation",
            "clientEmail": "finance@zohotest.com",
            "clientGstin": "29AAACZ9999Z1Z5",
            "date": "07 Sep 2026",
            "due": "21 Sep 2026",
            "items": [
                {
                    "name": "Cloud Ledger Automation Suite",
                    "hsn": "998313",
                    "quantity": 2,
                    "rate": 50000.0,
                    "taxRate": 18
                }
            ],
            "status": "Sent"
        }
        create_res = requests.post(f"{BASE_URL}/api/invoices", json=new_inv)
        self.assertEqual(create_res.status_code, 201)
        created = create_res.json()
        self.assertEqual(created["client"], "Zoho Test Corporation")
        self.assertEqual(created["amount"], 118000.0)

        # Update status
        status_res = requests.put(f"{BASE_URL}/api/invoices/{created['id']}/status", json={"status": "Paid"})
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["status"], "Paid")

        # HTML Tax Invoice generation
        html_res = requests.get(f"{BASE_URL}/api/invoices/{created['id']}/html")
        self.assertEqual(html_res.status_code, 200)
        self.assertIn("TAX INVOICE", html_res.text)

    def test_documents_api(self):
        # List documents
        res = requests.get(f"{BASE_URL}/api/documents")
        self.assertEqual(res.status_code, 200)
        docs = res.json()
        self.assertGreaterEqual(len(docs), 5)

        # Upload document
        new_doc = {
            "title": "Annual_Statutory_Audit_Report.pdf",
            "category": "Tax & GST",
            "uploadedBy": "Auditor Team"
        }
        create_res = requests.post(f"{BASE_URL}/api/documents", json=new_doc)
        self.assertEqual(create_res.status_code, 201)
        created = create_res.json()
        self.assertEqual(created["title"], "Annual_Statutory_Audit_Report.pdf")

        # Download document
        dl_res = requests.get(f"{BASE_URL}/api/documents/{created['id']}/download")
        self.assertEqual(dl_res.status_code, 200)
        self.assertIn("ZOHO BOOKS COMPLIANCE", dl_res.text)

    def test_payroll_api(self):
        # List employees
        res = requests.get(f"{BASE_URL}/api/payroll/employees")
        self.assertEqual(res.status_code, 200)
        employees = res.json()
        self.assertGreaterEqual(len(employees), 5)

        # Add employee
        new_emp = {
            "name": "Arjun Nair",
            "designation": "Staff Reliability Engineer",
            "department": "Engineering",
            "gross": 200000.0
        }
        create_res = requests.post(f"{BASE_URL}/api/payroll/employees", json=new_emp)
        self.assertEqual(create_res.status_code, 201)
        created = create_res.json()
        self.assertEqual(created["net"], 176000.0)

        # Run pay batch
        disburse_res = requests.post(f"{BASE_URL}/api/payroll/disburse")
        self.assertEqual(disburse_res.status_code, 200)
        self.assertTrue(all(e["status"] == "Paid" for e in disburse_res.json()))

        # Payslip generation
        payslip_res = requests.get(f"{BASE_URL}/api/payroll/payslip/EMP-101")
        self.assertEqual(payslip_res.status_code, 200)
        payslip = payslip_res.json()
        self.assertIn("Rupees Only", payslip["netInWords"])

        # Payslip HTML document
        html_res = requests.get(f"{BASE_URL}/api/payroll/payslip/EMP-101/html")
        self.assertEqual(html_res.status_code, 200)
        self.assertIn("Salary Payslip", html_res.text)


if __name__ == "__main__":
    unittest.main()


