"""
Database extensions and data layer for the Business Automation Engine:
- Business Events
- Double-Entry General Ledger & Trial Balance
- Automation Rules (IF-THEN)
- Bank Reconciliation & Fuzzy Matching
- Audit Trail & Explainability
- AI Organizational Learning
- Proactive Business Insights
"""
import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from backend.automation_seed import (
    get_initial_automation_rules,
    get_initial_bank_reconciliations,
    get_initial_audit_logs,
    get_initial_ai_learnings,
    get_initial_ai_insights,
    get_initial_journal_entries,
)


def init_automation_tables(conn, cursor, is_postgres: bool):
    """Creates automation tables and seeds initial data if tables are empty."""
    if is_postgres:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS business_events (
                id VARCHAR(100) PRIMARY KEY,
                source VARCHAR(100) NOT NULL,
                raw_text TEXT,
                event_type VARCHAR(100) NOT NULL,
                amount REAL NOT NULL DEFAULT 0.0,
                currency VARCHAR(20) NOT NULL DEFAULT 'INR',
                extracted_data TEXT,
                confidence REAL NOT NULL DEFAULT 1.0,
                status VARCHAR(50) NOT NULL DEFAULT 'auto_processed',
                review_reason TEXT,
                created_at VARCHAR(100) NOT NULL
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS journal_entries (
                id VARCHAR(100) PRIMARY KEY,
                event_id VARCHAR(100),
                reference_no VARCHAR(100),
                date VARCHAR(100) NOT NULL,
                description TEXT NOT NULL,
                source VARCHAR(100) NOT NULL DEFAULT 'auto_engine',
                total_debit REAL NOT NULL,
                total_credit REAL NOT NULL,
                balanced INTEGER NOT NULL DEFAULT 1,
                created_at VARCHAR(100) NOT NULL
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS journal_lines (
                id VARCHAR(100) PRIMARY KEY,
                journal_entry_id VARCHAR(100) NOT NULL,
                account VARCHAR(255) NOT NULL,
                debit REAL NOT NULL DEFAULT 0.0,
                credit REAL NOT NULL DEFAULT 0.0,
                notes TEXT
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS automation_rules (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                trigger_event VARCHAR(100) NOT NULL,
                condition_field VARCHAR(100) NOT NULL,
                operator VARCHAR(50) NOT NULL,
                condition_value TEXT NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                action_value TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                execution_count INTEGER NOT NULL DEFAULT 0,
                created_at VARCHAR(100) NOT NULL
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bank_reconciliations (
                id VARCHAR(100) PRIMARY KEY,
                bank_trans_date VARCHAR(100) NOT NULL,
                bank_description TEXT NOT NULL,
                bank_amount REAL NOT NULL,
                trans_type VARCHAR(20) NOT NULL,
                matched_entity_type VARCHAR(50),
                matched_entity_id VARCHAR(100),
                matched_entity_name VARCHAR(255),
                confidence REAL NOT NULL DEFAULT 0.0,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                reconciled_at VARCHAR(100)
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_learnings (
                id VARCHAR(100) PRIMARY KEY,
                organization VARCHAR(255) NOT NULL,
                pattern_key VARCHAR(255) NOT NULL,
                category VARCHAR(255) NOT NULL,
                account VARCHAR(255) NOT NULL,
                confidence_score REAL NOT NULL DEFAULT 0.9,
                occurrence_count INTEGER NOT NULL DEFAULT 1,
                last_used VARCHAR(100) NOT NULL
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id VARCHAR(100) PRIMARY KEY,
                event_id VARCHAR(100),
                action VARCHAR(255) NOT NULL,
                actor VARCHAR(255) NOT NULL DEFAULT 'System Automation Engine',
                rationale TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 1.0,
                status VARCHAR(50) NOT NULL DEFAULT 'Success',
                timestamp VARCHAR(100) NOT NULL
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_insights (
                id VARCHAR(100) PRIMARY KEY,
                category VARCHAR(100) NOT NULL,
                severity VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                metric_detail TEXT,
                action_label VARCHAR(100),
                action_module VARCHAR(100),
                created_at VARCHAR(100) NOT NULL
            );
        """)
        conn.commit()

        # Check and seed tables if empty
        cursor.execute("SELECT COUNT(*) as count FROM automation_rules")
        res = cursor.fetchone()
        count = res["count"] if isinstance(res, dict) else res[0]
        if count == 0:
            for r in get_initial_automation_rules():
                cursor.execute("""
                    INSERT INTO automation_rules (
                        id, name, trigger_event, condition_field, operator, condition_value, action_type, action_value, is_active, execution_count, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    r["id"], r["name"], r["trigger_event"], r["condition_field"], r["operator"],
                    r["condition_value"], r["action_type"], r["action_value"], r["is_active"],
                    r["execution_count"], r["created_at"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) as count FROM bank_reconciliations")
        res = cursor.fetchone()
        count = res["count"] if isinstance(res, dict) else res[0]
        if count == 0:
            for b in get_initial_bank_reconciliations():
                cursor.execute("""
                    INSERT INTO bank_reconciliations (
                        id, bank_trans_date, bank_description, bank_amount, trans_type, matched_entity_type, matched_entity_id, matched_entity_name, confidence, status, reconciled_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    b["id"], b["bank_trans_date"], b["bank_description"], b["bank_amount"], b["trans_type"],
                    b["matched_entity_type"], b["matched_entity_id"], b["matched_entity_name"],
                    b["confidence"], b["status"], b["reconciled_at"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) as count FROM audit_logs")
        res = cursor.fetchone()
        count = res["count"] if isinstance(res, dict) else res[0]
        if count == 0:
            for a in get_initial_audit_logs():
                cursor.execute("""
                    INSERT INTO audit_logs (id, event_id, action, actor, rationale, confidence, status, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    a["id"], a["event_id"], a["action"], a["actor"], a["rationale"], a["confidence"], a["status"], a["timestamp"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) as count FROM ai_learnings")
        res = cursor.fetchone()
        count = res["count"] if isinstance(res, dict) else res[0]
        if count == 0:
            for l in get_initial_ai_learnings():
                cursor.execute("""
                    INSERT INTO ai_learnings (id, organization, pattern_key, category, account, confidence_score, occurrence_count, last_used)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    l["id"], l["organization"], l["pattern_key"], l["category"], l["account"],
                    l["confidence_score"], l["occurrence_count"], l["last_used"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) as count FROM ai_insights")
        res = cursor.fetchone()
        count = res["count"] if isinstance(res, dict) else res[0]
        if count == 0:
            for i in get_initial_ai_insights():
                cursor.execute("""
                    INSERT INTO ai_insights (id, category, severity, title, description, metric_detail, action_label, action_module, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    i["id"], i["category"], i["severity"], i["title"], i["description"],
                    i["metric_detail"], i["action_label"], i["action_module"], i["created_at"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) as count FROM journal_entries")
        res = cursor.fetchone()
        count = res["count"] if isinstance(res, dict) else res[0]
        if count == 0:
            for je in get_initial_journal_entries():
                cursor.execute("""
                    INSERT INTO journal_entries (id, event_id, reference_no, date, description, source, total_debit, total_credit, balanced, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    je["id"], je["event_id"], je["reference_no"], je["date"], je["description"],
                    je["source"], je["total_debit"], je["total_credit"], je["balanced"], je["created_at"]
                ))
                for line in je["lines"]:
                    line_id = f"line-{uuid.uuid4().hex[:8]}"
                    cursor.execute("""
                        INSERT INTO journal_lines (id, journal_entry_id, account, debit, credit, notes)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        line_id, je["id"], line["account"], line["debit"], line["credit"], line["notes"]
                    ))
            conn.commit()

    else:
        # SQLite
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS business_events (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                raw_text TEXT,
                event_type TEXT NOT NULL,
                amount REAL NOT NULL DEFAULT 0.0,
                currency TEXT NOT NULL DEFAULT 'INR',
                extracted_data TEXT,
                confidence REAL NOT NULL DEFAULT 1.0,
                status TEXT NOT NULL DEFAULT 'auto_processed',
                review_reason TEXT,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS journal_entries (
                id TEXT PRIMARY KEY,
                event_id TEXT,
                reference_no TEXT,
                date TEXT NOT NULL,
                description TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'auto_engine',
                total_debit REAL NOT NULL,
                total_credit REAL NOT NULL,
                balanced INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS journal_lines (
                id TEXT PRIMARY KEY,
                journal_entry_id TEXT NOT NULL,
                account TEXT NOT NULL,
                debit REAL NOT NULL DEFAULT 0.0,
                credit REAL NOT NULL DEFAULT 0.0,
                notes TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS automation_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                trigger_event TEXT NOT NULL,
                condition_field TEXT NOT NULL,
                operator TEXT NOT NULL,
                condition_value TEXT NOT NULL,
                action_type TEXT NOT NULL,
                action_value TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                execution_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bank_reconciliations (
                id TEXT PRIMARY KEY,
                bank_trans_date TEXT NOT NULL,
                bank_description TEXT NOT NULL,
                bank_amount REAL NOT NULL,
                trans_type TEXT NOT NULL,
                matched_entity_type TEXT,
                matched_entity_id TEXT,
                matched_entity_name TEXT,
                confidence REAL NOT NULL DEFAULT 0.0,
                status TEXT NOT NULL DEFAULT 'pending',
                reconciled_at TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_learnings (
                id TEXT PRIMARY KEY,
                organization TEXT NOT NULL,
                pattern_key TEXT NOT NULL,
                category TEXT NOT NULL,
                account TEXT NOT NULL,
                confidence_score REAL NOT NULL DEFAULT 0.9,
                occurrence_count INTEGER NOT NULL DEFAULT 1,
                last_used TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                event_id TEXT,
                action TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT 'System Automation Engine',
                rationale TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 1.0,
                status TEXT NOT NULL DEFAULT 'Success',
                timestamp TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_insights (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                metric_detail TEXT,
                action_label TEXT,
                action_module TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()

        # Seed if empty
        cursor.execute("SELECT COUNT(*) FROM automation_rules")
        if cursor.fetchone()[0] == 0:
            for r in get_initial_automation_rules():
                cursor.execute("""
                    INSERT INTO automation_rules (
                        id, name, trigger_event, condition_field, operator, condition_value, action_type, action_value, is_active, execution_count, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    r["id"], r["name"], r["trigger_event"], r["condition_field"], r["operator"],
                    r["condition_value"], r["action_type"], r["action_value"], r["is_active"],
                    r["execution_count"], r["created_at"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) FROM bank_reconciliations")
        if cursor.fetchone()[0] == 0:
            for b in get_initial_bank_reconciliations():
                cursor.execute("""
                    INSERT INTO bank_reconciliations (
                        id, bank_trans_date, bank_description, bank_amount, trans_type, matched_entity_type, matched_entity_id, matched_entity_name, confidence, status, reconciled_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    b["id"], b["bank_trans_date"], b["bank_description"], b["bank_amount"], b["trans_type"],
                    b["matched_entity_type"], b["matched_entity_id"], b["matched_entity_name"],
                    b["confidence"], b["status"], b["reconciled_at"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) FROM audit_logs")
        if cursor.fetchone()[0] == 0:
            for a in get_initial_audit_logs():
                cursor.execute("""
                    INSERT INTO audit_logs (id, event_id, action, actor, rationale, confidence, status, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    a["id"], a["event_id"], a["action"], a["actor"], a["rationale"], a["confidence"], a["status"], a["timestamp"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) FROM ai_learnings")
        if cursor.fetchone()[0] == 0:
            for l in get_initial_ai_learnings():
                cursor.execute("""
                    INSERT INTO ai_learnings (id, organization, pattern_key, category, account, confidence_score, occurrence_count, last_used)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    l["id"], l["organization"], l["pattern_key"], l["category"], l["account"],
                    l["confidence_score"], l["occurrence_count"], l["last_used"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) FROM ai_insights")
        if cursor.fetchone()[0] == 0:
            for i in get_initial_ai_insights():
                cursor.execute("""
                    INSERT INTO ai_insights (id, category, severity, title, description, metric_detail, action_label, action_module, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    i["id"], i["category"], i["severity"], i["title"], i["description"],
                    i["metric_detail"], i["action_label"], i["action_module"], i["created_at"]
                ))
            conn.commit()

        cursor.execute("SELECT COUNT(*) FROM journal_entries")
        if cursor.fetchone()[0] == 0:
            for je in get_initial_journal_entries():
                cursor.execute("""
                    INSERT INTO journal_entries (id, event_id, reference_no, date, description, source, total_debit, total_credit, balanced, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    je["id"], je["event_id"], je["reference_no"], je["date"], je["description"],
                    je["source"], je["total_debit"], je["total_credit"], je["balanced"], je["created_at"]
                ))
                for line in je["lines"]:
                    line_id = f"line-{uuid.uuid4().hex[:8]}"
                    cursor.execute("""
                        INSERT INTO journal_lines (id, journal_entry_id, account, debit, credit, notes)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        line_id, je["id"], line["account"], line["debit"], line["credit"], line["notes"]
                    ))
            conn.commit()


# =========================================================================
# HELPER OPERATIONS & TRANSACTIONS
# =========================================================================

def record_business_event_db(conn, cursor, is_postgres: bool, data: Dict[str, Any]) -> Dict[str, Any]:
    event_id = data.get("id") or f"EVT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
    created_at = data.get("createdAt") or datetime.utcnow().strftime("%d %b %Y, %H:%M")
    extracted = json.dumps(data.get("extractedData", {}))

    ph = "%s" if is_postgres else "?"
    cursor.execute(f"""
        INSERT INTO business_events (
            id, source, raw_text, event_type, amount, currency, extracted_data, confidence, status, review_reason, created_at
        ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
    """, (
        event_id,
        data.get("source", "manual_prompt"),
        data.get("rawText", ""),
        data.get("eventType", "general"),
        float(data.get("amount", 0.0)),
        data.get("currency", "INR"),
        extracted,
        float(data.get("confidence", 1.0)),
        data.get("status", "auto_processed"),
        data.get("reviewReason", None),
        created_at,
    ))
    conn.commit()

    return {
        "id": event_id,
        "source": data.get("source", "manual_prompt"),
        "rawText": data.get("rawText", ""),
        "eventType": data.get("eventType", "general"),
        "amount": float(data.get("amount", 0.0)),
        "currency": data.get("currency", "INR"),
        "extractedData": data.get("extractedData", {}),
        "confidence": float(data.get("confidence", 1.0)),
        "status": data.get("status", "auto_processed"),
        "reviewReason": data.get("reviewReason"),
        "createdAt": created_at,
    }


def get_business_events_db(conn, cursor, is_postgres: bool, limit: int = 50, status: Optional[str] = None) -> List[Dict[str, Any]]:
    ph = "%s" if is_postgres else "?"
    if status:
        cursor.execute(f"SELECT * FROM business_events WHERE status = {ph} ORDER BY created_at DESC LIMIT {limit}", (status,))
    else:
        cursor.execute(f"SELECT * FROM business_events ORDER BY created_at DESC LIMIT {limit}")

    if is_postgres:
        rows = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]

    events = []
    for r in rows:
        events.append({
            "id": r["id"],
            "source": r["source"],
            "rawText": r["raw_text"],
            "eventType": r["event_type"],
            "amount": r["amount"],
            "currency": r["currency"],
            "extractedData": json.loads(r["extracted_data"]) if r.get("extracted_data") else {},
            "confidence": r["confidence"],
            "status": r["status"],
            "reviewReason": r["review_reason"],
            "createdAt": r["created_at"],
        })
    return events


def create_journal_entry_db(conn, cursor, is_postgres: bool, data: Dict[str, Any]) -> Dict[str, Any]:
    lines = data.get("lines", [])
    total_debit = round(sum(float(l.get("debit", 0.0)) for l in lines), 2)
    total_credit = round(sum(float(l.get("credit", 0.0)) for l in lines), 2)

    # Validate double-entry equality
    if abs(total_debit - total_credit) > 0.01:
        raise ValueError(f"Double-entry violation: Total debits (₹{total_debit}) must equal total credits (₹{total_credit})")

    je_id = data.get("id") or f"JE-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    date_str = data.get("date") or datetime.utcnow().strftime("%d %b %Y")
    created_at = datetime.utcnow().strftime("%d %b %Y, %H:%M")

    ph = "%s" if is_postgres else "?"
    cursor.execute(f"""
        INSERT INTO journal_entries (
            id, event_id, reference_no, date, description, source, total_debit, total_credit, balanced, created_at
        ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
    """, (
        je_id,
        data.get("eventId"),
        data.get("referenceNo", f"REF-{uuid.uuid4().hex[:6].upper()}"),
        date_str,
        data.get("description", "Automated Financial Transaction"),
        data.get("source", "auto_engine"),
        total_debit,
        total_credit,
        1,
        created_at,
    ))

    stored_lines = []
    for line in lines:
        line_id = f"line-{uuid.uuid4().hex[:8]}"
        d_val = round(float(line.get("debit", 0.0)), 2)
        c_val = round(float(line.get("credit", 0.0)), 2)
        cursor.execute(f"""
            INSERT INTO journal_lines (id, journal_entry_id, account, debit, credit, notes)
            VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph})
        """, (
            line_id,
            je_id,
            line["account"],
            d_val,
            c_val,
            line.get("notes", ""),
        ))
        stored_lines.append({
            "id": line_id,
            "account": line["account"],
            "debit": d_val,
            "credit": c_val,
            "notes": line.get("notes", ""),
        })

    conn.commit()

    return {
        "id": je_id,
        "eventId": data.get("eventId"),
        "referenceNo": data.get("referenceNo"),
        "date": date_str,
        "description": data.get("description"),
        "source": data.get("source", "auto_engine"),
        "totalDebit": total_debit,
        "totalCredit": total_credit,
        "balanced": True,
        "createdAt": created_at,
        "lines": stored_lines,
    }


def get_general_ledger_db(conn, cursor, is_postgres: bool, limit: int = 50) -> List[Dict[str, Any]]:
    cursor.execute(f"SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT {limit}")
    if is_postgres:
        entries = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        entries = [dict(zip(cols, r)) for r in cursor.fetchall()]

    result = []
    ph = "%s" if is_postgres else "?"
    for e in entries:
        cursor.execute(f"SELECT * FROM journal_lines WHERE journal_entry_id = {ph}", (e["id"],))
        if is_postgres:
            lines = cursor.fetchall()
        else:
            line_cols = [d[0] for d in cursor.description]
            lines = [dict(zip(line_cols, r)) for r in cursor.fetchall()]

        result.append({
            "id": e["id"],
            "eventId": e["event_id"],
            "referenceNo": e["reference_no"],
            "date": e["date"],
            "description": e["description"],
            "source": e["source"],
            "totalDebit": e["total_debit"],
            "totalCredit": e["total_credit"],
            "balanced": bool(e["balanced"]),
            "createdAt": e["created_at"],
            "lines": [
                {
                    "id": l["id"],
                    "account": l["account"],
                    "debit": l["debit"],
                    "credit": l["credit"],
                    "notes": l["notes"],
                }
                for l in lines
            ],
        })
    return result


def get_trial_balance_db(conn, cursor, is_postgres: bool) -> Dict[str, Any]:
    cursor.execute("""
        SELECT account, SUM(debit) as total_debit, SUM(credit) as total_credit
        FROM journal_lines
        GROUP BY account
        ORDER BY account ASC
    """)
    if is_postgres:
        rows = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]

    accounts = []
    overall_debit = 0.0
    overall_credit = 0.0

    for r in rows:
        d = round(r["total_debit"] or 0.0, 2)
        c = round(r["total_credit"] or 0.0, 2)
        overall_debit += d
        overall_credit += c
        accounts.append({
            "account": r["account"],
            "debit": d,
            "credit": c,
            "net": round(d - c, 2),
        })

    return {
        "asOf": datetime.utcnow().strftime("%d %b %Y"),
        "totalDebit": round(overall_debit, 2),
        "totalCredit": round(overall_credit, 2),
        "isBalanced": abs(overall_debit - overall_credit) < 0.05,
        "accounts": accounts,
    }


def get_automation_rules_db(conn, cursor, is_postgres: bool) -> List[Dict[str, Any]]:
    cursor.execute("SELECT * FROM automation_rules ORDER BY created_at DESC")
    if is_postgres:
        rows = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]

    return [
        {
            "id": r["id"],
            "name": r["name"],
            "triggerEvent": r["trigger_event"],
            "conditionField": r["condition_field"],
            "operator": r["operator"],
            "conditionValue": r["condition_value"],
            "actionType": r["action_type"],
            "actionValue": r["action_value"],
            "isActive": bool(r["is_active"]),
            "executionCount": r["execution_count"],
            "createdAt": r["created_at"],
        }
        for r in rows
    ]


def toggle_automation_rule_db(conn, cursor, is_postgres: bool, rule_id: str, is_active: bool) -> Optional[Dict[str, Any]]:
    ph = "%s" if is_postgres else "?"
    cursor.execute(f"UPDATE automation_rules SET is_active = {ph} WHERE id = {ph}", (1 if is_active else 0, rule_id))
    conn.commit()

    cursor.execute(f"SELECT * FROM automation_rules WHERE id = {ph}", (rule_id,))
    if is_postgres:
        r = cursor.fetchone()
    else:
        res = cursor.fetchone()
        if not res:
            return None
        cols = [d[0] for d in cursor.description]
        r = dict(zip(cols, res))

    if not r:
        return None
    return {
        "id": r["id"],
        "name": r["name"],
        "triggerEvent": r["trigger_event"],
        "conditionField": r["condition_field"],
        "operator": r["operator"],
        "conditionValue": r["condition_value"],
        "actionType": r["action_type"],
        "actionValue": r["action_value"],
        "isActive": bool(r["is_active"]),
        "executionCount": r["execution_count"],
        "createdAt": r["created_at"],
    }


def get_bank_reconciliations_db(conn, cursor, is_postgres: bool, status: Optional[str] = None) -> List[Dict[str, Any]]:
    ph = "%s" if is_postgres else "?"
    if status:
        cursor.execute(f"SELECT * FROM bank_reconciliations WHERE status = {ph} ORDER BY bank_trans_date DESC", (status,))
    else:
        cursor.execute("SELECT * FROM bank_reconciliations ORDER BY bank_trans_date DESC")

    if is_postgres:
        rows = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]

    return [
        {
            "id": r["id"],
            "bankTransDate": r["bank_trans_date"],
            "bankDescription": r["bank_description"],
            "bankAmount": r["bank_amount"],
            "transType": r["trans_type"],
            "matchedEntityType": r["matched_entity_type"],
            "matchedEntityId": r["matched_entity_id"],
            "matchedEntityName": r["matched_entity_name"],
            "confidence": r["confidence"],
            "status": r["status"],
            "reconciledAt": r["reconciled_at"],
        }
        for r in rows
    ]


def confirm_bank_match_db(conn, cursor, is_postgres: bool, recon_id: str) -> Optional[Dict[str, Any]]:
    today = datetime.utcnow().strftime("%d %b %Y")
    ph = "%s" if is_postgres else "?"
    cursor.execute(f"""
        UPDATE bank_reconciliations
        SET status = 'confirmed', reconciled_at = {ph}
        WHERE id = {ph}
    """, (today, recon_id))
    conn.commit()

    cursor.execute(f"SELECT * FROM bank_reconciliations WHERE id = {ph}", (recon_id,))
    if is_postgres:
        r = cursor.fetchone()
    else:
        res = cursor.fetchone()
        if not res:
            return None
        cols = [d[0] for d in cursor.description]
        r = dict(zip(cols, res))

    if not r:
        return None

    # Record audit log
    record_audit_log_db(conn, cursor, is_postgres, {
        "action": "Bank Transaction Matched & Confirmed",
        "actor": "User (Human Confirmation)",
        "rationale": f"Confirmed match for bank transaction ₹{r['bank_amount']} with {r['matched_entity_name']}.",
        "confidence": 1.0,
        "status": "Confirmed",
    })

    return {
        "id": r["id"],
        "bankTransDate": r["bank_trans_date"],
        "bankDescription": r["bank_description"],
        "bankAmount": r["bank_amount"],
        "transType": r["trans_type"],
        "matchedEntityType": r["matched_entity_type"],
        "matchedEntityId": r["matched_entity_id"],
        "matchedEntityName": r["matched_entity_name"],
        "confidence": 1.0,
        "status": "confirmed",
        "reconciledAt": today,
    }


def record_audit_log_db(conn, cursor, is_postgres: bool, data: Dict[str, Any]) -> Dict[str, Any]:
    log_id = data.get("id") or f"audit-{uuid.uuid4().hex[:8]}"
    ts = data.get("timestamp") or datetime.utcnow().strftime("%d %b %Y, %H:%M")

    ph = "%s" if is_postgres else "?"
    cursor.execute(f"""
        INSERT INTO audit_logs (id, event_id, action, actor, rationale, confidence, status, timestamp)
        VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
    """, (
        log_id,
        data.get("eventId"),
        data["action"],
        data.get("actor", "System Automation Engine"),
        data.get("rationale", ""),
        float(data.get("confidence", 1.0)),
        data.get("status", "Success"),
        ts,
    ))
    conn.commit()

    return {
        "id": log_id,
        "eventId": data.get("eventId"),
        "action": data["action"],
        "actor": data.get("actor", "System Automation Engine"),
        "rationale": data.get("rationale", ""),
        "confidence": float(data.get("confidence", 1.0)),
        "status": data.get("status", "Success"),
        "timestamp": ts,
    }


def get_audit_logs_db(conn, cursor, is_postgres: bool, limit: int = 50) -> List[Dict[str, Any]]:
    cursor.execute(f"SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT {limit}")
    if is_postgres:
        rows = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]

    return [
        {
            "id": r["id"],
            "eventId": r["event_id"],
            "action": r["action"],
            "actor": r["actor"],
            "rationale": r["rationale"],
            "confidence": r["confidence"],
            "status": r["status"],
            "timestamp": r["timestamp"],
        }
        for r in rows
    ]


def get_ai_learnings_db(conn, cursor, is_postgres: bool) -> List[Dict[str, Any]]:
    cursor.execute("SELECT * FROM ai_learnings ORDER BY occurrence_count DESC")
    if is_postgres:
        rows = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]

    return [
        {
            "id": r["id"],
            "organization": r["organization"],
            "patternKey": r["pattern_key"],
            "category": r["category"],
            "account": r["account"],
            "confidenceScore": r["confidence_score"],
            "occurrenceCount": r["occurrence_count"],
            "lastUsed": r["last_used"],
        }
        for r in rows
    ]


def get_ai_insights_db(conn, cursor, is_postgres: bool) -> List[Dict[str, Any]]:
    cursor.execute("SELECT * FROM ai_insights ORDER BY created_at DESC")
    if is_postgres:
        rows = cursor.fetchall()
    else:
        cols = [d[0] for d in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]

    return [
        {
            "id": r["id"],
            "category": r["category"],
            "severity": r["severity"],
            "title": r["title"],
            "description": r["description"],
            "metricDetail": r["metric_detail"],
            "actionLabel": r["action_label"],
            "actionModule": r["action_module"],
            "createdAt": r["created_at"],
        }
        for r in rows
    ]
