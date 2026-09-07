import unittest
from backend.services.accounting_engine import AccountingEngine
from backend.services.event_engine import EventEngine
from backend.services.assistant_service import AssistantService
from backend.database import (
    init_db,
    get_general_ledger,
    get_trial_balance,
    get_automation_rules,
    get_bank_reconciliations,
    confirm_bank_match,
    get_needs_attention_items,
    get_automation_metrics,
)


class TestBusinessAutomationEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_tax_breakdown_calculation(self):
        """Verify 18% GST split into equal CGST and SGST with sum exactness."""
        breakdown = AccountingEngine.calculate_tax_breakdown(59000.0, tax_rate=18.0)
        self.assertAlmostEqual(breakdown["base_amount"], 50000.0, places=1)
        self.assertAlmostEqual(breakdown["total_tax"], 9000.0, places=1)
        self.assertAlmostEqual(breakdown["cgst"] + breakdown["sgst"], 9000.0, places=1)
        self.assertAlmostEqual(breakdown["cgst"], 4500.0, places=1)
        self.assertAlmostEqual(breakdown["sgst"], 4500.0, places=1)

    def test_double_entry_equality(self):
        """Verify that double-entry journal entries strictly enforce debits == credits."""
        result = AccountingEngine.process_purchase({
            "vendor": "ABC Traders",
            "amount": 59000.0,
            "item": "Test Goods",
            "quantity": 10,
            "payment_mode": "credit",
        })
        je = result["journalEntry"]
        self.assertTrue(je["balanced"])
        self.assertAlmostEqual(je["totalDebit"], je["totalCredit"], places=2)
        self.assertEqual(je["totalDebit"], 59000.0)

    def test_natural_language_purchase_parsing(self):
        """Verify natural language parsing for: 'Bought 5 chairs from IKEA for ₹30,000 and paid through HDFC'"""
        parsed = EventEngine.parse_natural_language("Bought 5 chairs from IKEA for ₹30,000 and paid through HDFC")
        self.assertEqual(parsed["intent"], "purchase")
        self.assertEqual(parsed["amount"], 30000.0)
        self.assertEqual(parsed["quantity"], 5.0)
        self.assertIn("IKEA", parsed["party"])
        self.assertEqual(parsed["payment_mode"], "bank")

    def test_end_to_end_event_processing(self):
        """Verify full event pipeline converts natural language to balanced accounting."""
        import time
        unique_amt = 58100 + int(time.time() % 1000)
        res = EventEngine.process_event("test_suite", f"Purchased 2 monitors from Dell for ₹{unique_amt} via bank")
        self.assertEqual(res["status"], "auto_processed")
        self.assertGreaterEqual(res["confidence"], 0.85)
        self.assertIsNotNone(res["accounting"])
        self.assertTrue(res["accounting"]["journalEntry"]["balanced"])

    def test_customer_payment_reconciliation(self):
        """Verify customer payment event: 'ABC paid ₹59,000'."""
        import time
        unique_amt = 61200 + int(time.time() % 1000)
        res = EventEngine.process_event("test_suite", f"ABC paid ₹{unique_amt}")
        self.assertEqual(res["extracted"]["intent"], "customer_payment")
        self.assertEqual(res["extracted"]["amount"], float(unique_amt))
        self.assertIsNotNone(res["accounting"])
        self.assertTrue(res["accounting"]["journalEntry"]["balanced"])

    def test_duplicate_detection(self):
        """Verify duplicate detection flags identical recurring events."""
        import time
        dup_amt = 70000.0 + (int(time.time() * 1000) % 9999)
        # First execution -> auto_processed
        res1 = EventEngine.process_event("test_suite", f"Bought 1 desk from IKEA for ₹{dup_amt}")
        self.assertEqual(res1["status"], "auto_processed")
        # Second execution with exact same party and amount -> flagged as duplicate in needs_review
        res2 = EventEngine.process_event("test_suite", f"Bought 1 desk from IKEA for ₹{dup_amt}")
        self.assertEqual(res2["status"], "needs_review")
        self.assertIn("duplicate", res2["reviewReason"].lower())

    def test_needs_attention_exceptions(self):
        """Verify prioritized attention queue aggregates actionable exceptions."""
        items = get_needs_attention_items()
        self.assertIsInstance(items, list)
        self.assertGreater(len(items), 0)
        # Check keys
        first = items[0]
        self.assertIn("id", first)
        self.assertIn("type", first)
        self.assertIn("severity", first)
        self.assertIn("title", first)

    def test_bank_reconciliation_confirmation(self):
        """Verify bank feed confirmation transitions status to confirmed."""
        recons = get_bank_reconciliations()
        self.assertGreater(len(recons), 0)
        recon_id = recons[0]["id"]
        confirmed = confirm_bank_match(recon_id)
        self.assertEqual(confirmed["status"], "confirmed")

    def test_assistant_unpaid_invoices_query(self):
        """Verify Natural Language Assistant answers 'Show unpaid invoices' with real data."""
        ans = AssistantService.answer_query("Show unpaid invoices")
        self.assertEqual(ans["intent"], "unpaid_invoices")
        self.assertIn("unpaid", ans["reply"].lower())
        self.assertIsNotNone(ans["data"])

    def test_assistant_gst_query(self):
        """Verify Natural Language Assistant answers 'How much GST do I owe this month?'."""
        ans = AssistantService.answer_query("How much GST do I owe this month?")
        self.assertEqual(ans["intent"], "gst_liability")
        self.assertIn("Output GST", ans["reply"])
        self.assertIn("Input Tax Credit", ans["reply"])

    def test_trial_balance_is_balanced(self):
        """Verify trial balance ledger balances."""
        tb = get_trial_balance()
        self.assertIn("totalDebit", tb)
        self.assertIn("totalCredit", tb)
        self.assertTrue(tb["isBalanced"])

    def test_automation_metrics(self):
        """Verify automation score calculation."""
        metrics = get_automation_metrics()
        self.assertGreater(metrics["automationScore"], 80)
        self.assertGreater(metrics["processedTodayCount"], 0)


if __name__ == "__main__":
    unittest.main()
