"""Add the Phase 6 texts (AI assistant and cash-flow forecast) to both copies of the
default app content. Run from the repo root: python scripts/content_phase6.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import main  # noqa: E402

TEXTS = {
    "sidebar.aiAssistant": "AI assistant",
    "ai.title": "AI assistant",
    "ai.subtitle": "Ask questions about your books, scan bills into drafts, and see where cash is heading.",
    "ai.notConfigured": "The AI assistant is not set up yet: ask your administrator to add an Anthropic API key. The cash forecast works without it.",
    "ai.tab.ask": "Ask your books",
    "ai.tab.scan": "Scan a bill",
    "ai.tab.forecast": "Cash forecast",
    "ai.ask.title": "Ask your books",
    "ai.ask.subtitle": "Answers come from your own reports and documents; nothing is changed.",
    "ai.ask.example1": "Who owes us the most money right now?",
    "ai.ask.example2": "How did profit this month compare with last month?",
    "ai.ask.example3": "How much GST do we owe for last month?",
    "ai.ask.placeholder": "Ask a question about your business",
    "ai.ask.send": "Ask",
    "ai.ask.thinking": "Looking through your books...",
    "ai.ask.disclaimer": "AI answers can be wrong - check important figures in the reports.",
    "ai.scan.title": "Scan a bill or receipt",
    "ai.scan.subtitle": "Upload a photo or PDF; the details are read into a draft bill you review before it posts.",
    "ai.scan.choose": "Choose a photo or PDF",
    "ai.scan.reading": "Reading the document...",
    "ai.scan.notABill": "This does not look like a bill or receipt - check the details carefully.",
    "ai.scan.vendor": "Vendor",
    "ai.scan.vendorMatched": "Matched to an existing vendor",
    "ai.scan.vendorNew": "No matching vendor - add the vendor first",
    "ai.scan.billNumber": "Bill number",
    "ai.scan.account": "Suggested account",
    "ai.scan.createBill": "Create draft bill",
    "ai.scan.createdNote": "Created from a scanned document",
    "ai.scan.billCreated": "Draft bill {number} created - review and open it",
    "ai.scan.noVendor": "'{name}' is not one of your vendors yet. Add the vendor, then scan again.",
    "ai.scan.review": "Always check scanned figures against the original before opening the bill.",
    "ai.forecast.title": "13-week cash forecast",
    "ai.forecast.today": "Cash today",
    "ai.forecast.lowest": "Lowest point",
    "ai.forecast.weekOf": "Week of {date}",
    "ai.forecast.dailySpend": "Average daily spend",
    "ai.forecast.week": "Week of",
    "ai.forecast.in": "Coming in",
    "ai.forecast.out": "Going out",
    "ai.forecast.closing": "Cash at end",
}

if __name__ == "__main__":
    main(TEXTS)
