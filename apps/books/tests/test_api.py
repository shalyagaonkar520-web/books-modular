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
        self.assertEqual(data["database"], "SQLite connected")

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


if __name__ == "__main__":
    unittest.main()

