import sqlite3
import json
import os
import threading
from typing import List, Optional, Dict, Any
from datetime import datetime
from backend.seed_data import get_initial_seed_items

# Database Configuration
DB_PATH = os.path.join(os.path.dirname(__file__), "zoho_books.db")
DATABASE_URL = os.environ.get("DATABASE_URL")
_lock = threading.RLock()

# Try connecting to PostgreSQL if DATABASE_URL is configured
IS_POSTGRES = False
psycopg2 = None
RealDictCursor = None

if DATABASE_URL and (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        # Test connection
        test_conn = psycopg2.connect(DATABASE_URL, connect_timeout=3)
        test_conn.close()
        IS_POSTGRES = True
    except Exception:
        IS_POSTGRES = False


def get_connection():
    """Returns database connection based on active engine."""
    if IS_POSTGRES and psycopg2:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    else:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn


def hash_password(password: str) -> str:
    import hashlib
    return hashlib.sha256((password + "zoho_salt_secure").encode()).hexdigest()


def _format_query(query: str) -> str:
    """Adapts query parameter placeholders for PostgreSQL (%s) vs SQLite (?)."""
    if IS_POSTGRES:
        return query.replace("?", "%s")
    return query


def init_db():
    with _lock:
        conn = get_connection()
        try:
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS items (
                        id VARCHAR(100) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        type VARCHAR(50) NOT NULL,
                        sku VARCHAR(100) NOT NULL UNIQUE,
                        unit VARCHAR(50) NOT NULL,
                        description TEXT,
                        image_url TEXT,
                        sales_info TEXT NOT NULL,
                        purchase_info TEXT NOT NULL,
                        inventory_info TEXT,
                        created_at VARCHAR(100) NOT NULL,
                        updated_at VARCHAR(100) NOT NULL
                    );
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id VARCHAR(100) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        email VARCHAR(255) NOT NULL UNIQUE,
                        password_hash VARCHAR(255) NOT NULL,
                        role VARCHAR(100) NOT NULL,
                        organization VARCHAR(255) NOT NULL,
                        avatar TEXT,
                        created_at VARCHAR(100) NOT NULL,
                        auth_provider VARCHAR(50) DEFAULT 'local'
                    );
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS invoices (
                        id VARCHAR(100) PRIMARY KEY,
                        client VARCHAR(255) NOT NULL,
                        client_email VARCHAR(255),
                        client_gstin VARCHAR(100),
                        date VARCHAR(100) NOT NULL,
                        due VARCHAR(100) NOT NULL,
                        subtotal REAL NOT NULL,
                        tax_amount REAL NOT NULL,
                        amount REAL NOT NULL,
                        status VARCHAR(50) NOT NULL,
                        items TEXT NOT NULL,
                        notes TEXT,
                        created_at VARCHAR(100) NOT NULL
                    );
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id VARCHAR(100) PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        category VARCHAR(100) NOT NULL,
                        uploaded_by VARCHAR(255) NOT NULL,
                        date VARCHAR(100) NOT NULL,
                        size VARCHAR(50) NOT NULL,
                        verified BOOLEAN NOT NULL DEFAULT TRUE,
                        checksum VARCHAR(100) NOT NULL,
                        notes TEXT
                    );
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS payroll_employees (
                        id VARCHAR(100) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        designation VARCHAR(255) NOT NULL,
                        department VARCHAR(100) NOT NULL,
                        gross REAL NOT NULL,
                        deductions REAL NOT NULL,
                        net REAL NOT NULL,
                        bank_acc VARCHAR(100) NOT NULL,
                        pan VARCHAR(50) NOT NULL,
                        uan VARCHAR(50) NOT NULL,
                        status VARCHAR(50) NOT NULL,
                        last_pay_date VARCHAR(100) NOT NULL
                    );
                """)
                conn.commit()

                cursor.execute("SELECT COUNT(*) as count FROM items")
                res = cursor.fetchone()
                count = res["count"] if isinstance(res, dict) else res[0]
                if count == 0:
                    _seed_items_pg(cursor, get_initial_seed_items())
                    conn.commit()

                cursor.execute("SELECT COUNT(*) as count FROM users")
                res_u = cursor.fetchone()
                count_u = res_u["count"] if isinstance(res_u, dict) else res_u[0]
                if count_u == 0:
                    _seed_users_pg(cursor)
                    conn.commit()

                cursor.execute("SELECT COUNT(*) as count FROM invoices")
                res_i = cursor.fetchone()
                count_i = res_i["count"] if isinstance(res_i, dict) else res_i[0]
                if count_i == 0:
                    _seed_invoices_pg(cursor)
                    conn.commit()

                cursor.execute("SELECT COUNT(*) as count FROM documents")
                res_d = cursor.fetchone()
                count_d = res_d["count"] if isinstance(res_d, dict) else res_d[0]
                if count_d == 0:
                    _seed_documents_pg(cursor)
                    conn.commit()

                cursor.execute("SELECT COUNT(*) as count FROM payroll_employees")
                res_p = cursor.fetchone()
                count_p = res_p["count"] if isinstance(res_p, dict) else res_p[0]
                if count_p == 0:
                    _seed_payroll_pg(cursor)
                    conn.commit()

                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS items (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        type TEXT NOT NULL,
                        sku TEXT NOT NULL UNIQUE,
                        unit TEXT NOT NULL,
                        description TEXT,
                        image_url TEXT,
                        sales_info TEXT NOT NULL,
                        purchase_info TEXT NOT NULL,
                        inventory_info TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL,
                        organization TEXT NOT NULL,
                        avatar TEXT,
                        created_at TEXT NOT NULL,
                        auth_provider TEXT DEFAULT 'local'
                    )
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS invoices (
                        id TEXT PRIMARY KEY,
                        client TEXT NOT NULL,
                        client_email TEXT,
                        client_gstin TEXT,
                        date TEXT NOT NULL,
                        due TEXT NOT NULL,
                        subtotal REAL NOT NULL,
                        tax_amount REAL NOT NULL,
                        amount REAL NOT NULL,
                        status TEXT NOT NULL,
                        items TEXT NOT NULL,
                        notes TEXT,
                        created_at TEXT NOT NULL
                    )
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        category TEXT NOT NULL,
                        uploaded_by TEXT NOT NULL,
                        date TEXT NOT NULL,
                        size TEXT NOT NULL,
                        verified INTEGER NOT NULL DEFAULT 1,
                        checksum TEXT NOT NULL,
                        notes TEXT
                    )
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS payroll_employees (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        designation TEXT NOT NULL,
                        department TEXT NOT NULL,
                        gross REAL NOT NULL,
                        deductions REAL NOT NULL,
                        net REAL NOT NULL,
                        bank_acc TEXT NOT NULL,
                        pan TEXT NOT NULL,
                        uan TEXT NOT NULL,
                        status TEXT NOT NULL,
                        last_pay_date TEXT NOT NULL
                    )
                """)
                conn.commit()

                # Migrate schema if auth_provider column is missing in SQLite
                cursor.execute("PRAGMA table_info(users)")
                user_cols = [c[1] for c in cursor.fetchall()]
                if "auth_provider" not in user_cols:
                    cursor.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'")
                    conn.commit()

                cursor.execute("SELECT COUNT(*) FROM items")
                if cursor.fetchone()[0] == 0:
                    _seed_items_sqlite(cursor, get_initial_seed_items())
                    conn.commit()

                cursor.execute("SELECT COUNT(*) FROM users")
                if cursor.fetchone()[0] == 0:
                    _seed_users_sqlite(cursor)
                    conn.commit()

                cursor.execute("SELECT COUNT(*) FROM invoices")
                if cursor.fetchone()[0] == 0:
                    _seed_invoices_sqlite(cursor)
                    conn.commit()

                cursor.execute("SELECT COUNT(*) FROM documents")
                if cursor.fetchone()[0] == 0:
                    _seed_documents_sqlite(cursor)
                    conn.commit()

                cursor.execute("SELECT COUNT(*) FROM payroll_employees")
                if cursor.fetchone()[0] == 0:
                    _seed_payroll_sqlite(cursor)
                    conn.commit()

                cursor.close()
        finally:
            conn.close()


def _seed_users_sqlite(cursor):
    now = datetime.utcnow().isoformat() + "Z"
    demo_users = [
        (
            "user-1",
            "Shalya Gaonkar",
            "admin@zylkerbooks.com",
            hash_password("password123"),
            "Administrator",
            "Zylker Electronics India Pvt Ltd",
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80",
            now,
            "local",
        ),
        (
            "user-2",
            "Priya Sharma",
            "accountant@rooman.com",
            hash_password("password123"),
            "Chief Accountant",
            "Zylker Electronics India Pvt Ltd",
            "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80",
            now,
            "local",
        ),
    ]
    cursor.executemany("""
        INSERT OR REPLACE INTO users (
            id, name, email, password_hash, role, organization, avatar, created_at, auth_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, demo_users)


def _seed_users_pg(cursor):
    now = datetime.utcnow().isoformat() + "Z"
    demo_users = [
        (
            "user-1",
            "Shalya Gaonkar",
            "admin@zylkerbooks.com",
            hash_password("password123"),
            "Administrator",
            "Zylker Electronics India Pvt Ltd",
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80",
            now,
            "local",
        ),
        (
            "user-2",
            "Priya Sharma",
            "accountant@rooman.com",
            hash_password("password123"),
            "Chief Accountant",
            "Zylker Electronics India Pvt Ltd",
            "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80",
            now,
            "local",
        ),
    ]
    for u in demo_users:
        cursor.execute("""
            INSERT INTO users (
                id, name, email, password_hash, role, organization, avatar, created_at, auth_provider
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                organization = EXCLUDED.organization,
                avatar = EXCLUDED.avatar,
                auth_provider = EXCLUDED.auth_provider
        """, u)


def _get_initial_invoices():
    now = datetime.utcnow().isoformat() + "Z"
    return [
        (
            "INV-00104",
            "Infosys BPM Limited",
            "billing@infosys.com",
            "29AAACI4567B1Z8",
            "02 Sep 2026",
            "16 Sep 2026",
            156779.66,
            28220.34,
            185000.0,
            "Sent",
            json.dumps([
                {
                    "name": "Cloud Infrastructure Migration & DevOps Consulting",
                    "description": "Kubernetes migration, auto-scaling policy setup & multi-region configuration",
                    "hsn": "998313",
                    "quantity": 1,
                    "rate": 156779.66,
                    "discount": 0,
                    "taxRate": 18,
                    "amount": 185000.0
                }
            ]),
            "Net 15 days terms. Remit payment to HDFC Bank A/C 50200049281928, IFSC: HDFC0000053.",
            now
        ),
        (
            "INV-00103",
            "Tata Consultancy Services",
            "ap.desk@tcs.com",
            "27AAACT9876C1Z4",
            "28 Aug 2026",
            "11 Sep 2026",
            289830.51,
            52169.49,
            342000.0,
            "Paid",
            json.dumps([
                {
                    "name": "Enterprise ERP Ledger Security Architecture",
                    "description": "High-throughput double-entry transactional pipeline security hardening",
                    "hsn": "998313",
                    "quantity": 1,
                    "rate": 289830.51,
                    "discount": 0,
                    "taxRate": 18,
                    "amount": 342000.0
                }
            ]),
            "Invoice settled in full via IMPS transfer on 03 Sep 2026.",
            now
        ),
        (
            "INV-00102",
            "Wipro Digital Labs",
            "accounts@wipro.com",
            "29AAACW1234D1Z2",
            "20 Aug 2026",
            "03 Sep 2026",
            83474.58,
            15025.42,
            98500.0,
            "Overdue",
            json.dumps([
                {
                    "name": "API Gateway & Microservices Performance Audit",
                    "description": "Latency profiling, rate limit fine-tuning & load testing",
                    "hsn": "998313",
                    "quantity": 1,
                    "rate": 83474.58,
                    "discount": 0,
                    "taxRate": 18,
                    "amount": 98500.0
                }
            ]),
            "Payment overdue. Automated reminder sent to finance contact.",
            now
        ),
        (
            "INV-00101",
            "Razorpay Software Pvt Ltd",
            "merchant-pay@razorpay.com",
            "29AABCR8765E1Z6",
            "15 Aug 2026",
            "30 Aug 2026",
            182203.39,
            32796.61,
            215000.0,
            "Paid",
            json.dumps([
                {
                    "name": "Instant Settlement & UPI Webhook Integration",
                    "description": "Dynamic UPI QR code generator & webhook listener implementation",
                    "hsn": "998314",
                    "quantity": 1,
                    "rate": 182203.39,
                    "discount": 0,
                    "taxRate": 18,
                    "amount": 215000.0
                }
            ]),
            "Settled via UPI Instant payment gateway.",
            now
        ),
        (
            "INV-00100",
            "Swiggy Technologies",
            "vendor-invoices@swiggy.in",
            "29AALCS5432F1Z8",
            "08 Aug 2026",
            "22 Aug 2026",
            122881.36,
            22118.64,
            145000.0,
            "Paid",
            json.dumps([
                {
                    "name": "Corporate NetBanking Reconciliation Module",
                    "description": "Direct bank feed synchronization & automated statement parsing",
                    "hsn": "998313",
                    "quantity": 1,
                    "rate": 122881.36,
                    "discount": 0,
                    "taxRate": 18,
                    "amount": 145000.0
                }
            ]),
            "Received in corporate current account.",
            now
        ),
    ]


def _get_initial_documents():
    return [
        (
            "DOC-801",
            "GST_Certificate_2026_27.pdf",
            "Tax & GST",
            "Shalya Gaonkar",
            "02 Sep 2026",
            "2.4 MB",
            1,
            "SHA256:e8f237b5d1a89c32f8149e21",
            "Central Board of Indirect Taxes & Customs GST Registration Certificate Form GST REG-06"
        ),
        (
            "DOC-802",
            "HDFC_Bank_Statement_August2026.pdf",
            "Bank Statements",
            "Priya Iyer",
            "01 Sep 2026",
            "4.8 MB",
            1,
            "SHA256:d19a4e8c3b7f11904a5528ea",
            "Monthly corporate current account transaction reconciliation statement"
        ),
        (
            "DOC-803",
            "Vendor_Agreement_TechDistro.pdf",
            "Legal & Contracts",
            "Rahul Sharma",
            "28 Aug 2026",
            "1.8 MB",
            1,
            "SHA256:bc39271e0fa239d48b11c993",
            "Hardware procurement SLA and master service agreement"
        ),
        (
            "DOC-804",
            "Office_Lease_Rental_Deed.pdf",
            "Legal & Contracts",
            "Admin",
            "15 Aug 2026",
            "5.1 MB",
            1,
            "SHA256:f7a2184c2eb012a97d438901",
            "Registered commercial lease deed for Bengaluru headquarters"
        ),
        (
            "DOC-805",
            "Hardware_Procurement_Voucher_8092.pdf",
            "Invoices & Bills",
            "Accounts",
            "10 Aug 2026",
            "890 KB",
            0,
            "SHA256:a2b8490e3cd125f498327ba5",
            "Dell UltraSharp monitors voucher awaiting signoff"
        ),
    ]


def _get_initial_payroll():
    return [
        (
            "EMP-101",
            "Shalya Gaonkar",
            "Principal Architect",
            "Engineering",
            240000.0,
            28800.0,
            211200.0,
            "••••••••1928",
            "ABCDE1234F",
            "101294819201",
            "Paid",
            "31 Aug 2026"
        ),
        (
            "EMP-102",
            "Priya Iyer",
            "Senior Financial Controller",
            "Finance",
            185000.0,
            22200.0,
            162800.0,
            "••••••••4029",
            "BGHYT5678K",
            "101294819202",
            "Paid",
            "31 Aug 2026"
        ),
        (
            "EMP-103",
            "Rahul Sharma",
            "Lead Systems Engineer",
            "Engineering",
            160000.0,
            19200.0,
            140800.0,
            "••••••••9182",
            "JKLMN9012L",
            "101294819203",
            "Paid",
            "31 Aug 2026"
        ),
        (
            "EMP-104",
            "Ananya Deshmukh",
            "Tax & Compliance Specialist",
            "Finance",
            130000.0,
            15600.0,
            114400.0,
            "••••••••3821",
            "QWERT3456M",
            "101294819204",
            "Processing",
            "31 Jul 2026"
        ),
        (
            "EMP-105",
            "Vikram Mehta",
            "Operations Manager",
            "Operations",
            115000.0,
            13800.0,
            101200.0,
            "••••••••7741",
            "ZXCVB7890P",
            "101294819205",
            "Processing",
            "31 Jul 2026"
        ),
    ]


def _seed_invoices_sqlite(cursor):
    for inv in _get_initial_invoices():
        cursor.execute("""
            INSERT OR REPLACE INTO invoices (
                id, client, client_email, client_gstin, date, due, subtotal, tax_amount, amount, status, items, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, inv)


def _seed_invoices_pg(cursor):
    for inv in _get_initial_invoices():
        cursor.execute("""
            INSERT INTO invoices (
                id, client, client_email, client_gstin, date, due, subtotal, tax_amount, amount, status, items, notes, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                client = EXCLUDED.client,
                amount = EXCLUDED.amount,
                status = EXCLUDED.status
        """, inv)


def _seed_documents_sqlite(cursor):
    for doc in _get_initial_documents():
        cursor.execute("""
            INSERT OR REPLACE INTO documents (
                id, title, category, uploaded_by, date, size, verified, checksum, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, doc)


def _seed_documents_pg(cursor):
    for doc in _get_initial_documents():
        cursor.execute("""
            INSERT INTO documents (
                id, title, category, uploaded_by, date, size, verified, checksum, notes
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                verified = EXCLUDED.verified
        """, doc)


def _seed_payroll_sqlite(cursor):
    for emp in _get_initial_payroll():
        cursor.execute("""
            INSERT OR REPLACE INTO payroll_employees (
                id, name, designation, department, gross, deductions, net, bank_acc, pan, uan, status, last_pay_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, emp)


def _seed_payroll_pg(cursor):
    for emp in _get_initial_payroll():
        cursor.execute("""
            INSERT INTO payroll_employees (
                id, name, designation, department, gross, deductions, net, bank_acc, pan, uan, status, last_pay_date
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                gross = EXCLUDED.gross,
                status = EXCLUDED.status
        """, emp)


def _row_to_dict(row: Any) -> Dict[str, Any]:
    sales_info = row["sales_info"]
    if isinstance(sales_info, str):
        sales_info = json.loads(sales_info) if sales_info else {}
    elif not isinstance(sales_info, dict):
        sales_info = {}

    purchase_info = row["purchase_info"]
    if isinstance(purchase_info, str):
        purchase_info = json.loads(purchase_info) if purchase_info else {}
    elif not isinstance(purchase_info, dict):
        purchase_info = {}

    inventory_info = row["inventory_info"]
    if isinstance(inventory_info, str):
        inventory_info = json.loads(inventory_info) if inventory_info else None

    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "sku": row["sku"],
        "unit": row["unit"],
        "description": row["description"],
        "imageUrl": row["image_url"],
        "salesInfo": sales_info,
        "purchaseInfo": purchase_info,
        "inventoryInfo": inventory_info,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _seed_items_sqlite(cursor, items: List[Dict[str, Any]]):
    for item in items:
        cursor.execute("""
            INSERT OR REPLACE INTO items (
                id, name, type, sku, unit, description, image_url,
                sales_info, purchase_info, inventory_info, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["id"],
            item["name"],
            item["type"],
            item["sku"],
            item["unit"],
            item.get("description"),
            item.get("imageUrl"),
            json.dumps(item.get("salesInfo", {})),
            json.dumps(item.get("purchaseInfo", {})),
            json.dumps(item.get("inventoryInfo")) if item.get("inventoryInfo") else None,
            item["createdAt"],
            item["updatedAt"],
        ))


def _seed_items_pg(cursor, items: List[Dict[str, Any]]):
    for item in items:
        cursor.execute("""
            INSERT INTO items (
                id, name, type, sku, unit, description, image_url,
                sales_info, purchase_info, inventory_info, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                sku = EXCLUDED.sku,
                unit = EXCLUDED.unit,
                description = EXCLUDED.description,
                image_url = EXCLUDED.image_url,
                sales_info = EXCLUDED.sales_info,
                purchase_info = EXCLUDED.purchase_info,
                inventory_info = EXCLUDED.inventory_info,
                updated_at = EXCLUDED.updated_at
        """, (
            item["id"],
            item["name"],
            item["type"],
            item["sku"],
            item["unit"],
            item.get("description"),
            item.get("imageUrl"),
            json.dumps(item.get("salesInfo", {})),
            json.dumps(item.get("purchaseInfo", {})),
            json.dumps(item.get("inventoryInfo")) if item.get("inventoryInfo") else None,
            item["createdAt"],
            item["updatedAt"],
        ))


def reset_seed_data() -> List[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("DELETE FROM items")
                _seed_items_pg(cursor, get_initial_seed_items())
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM items")
                _seed_items_sqlite(cursor, get_initial_seed_items())
                conn.commit()
                cursor.close()
            return get_all_items()
        finally:
            conn.close()


def get_all_items() -> List[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("SELECT * FROM items ORDER BY created_at DESC")
                rows = cursor.fetchall()
                cursor.close()
                return [_row_to_dict(row) for row in rows]
            else:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM items ORDER BY created_at DESC")
                rows = cursor.fetchall()
                cursor.close()
                return [_row_to_dict(row) for row in rows]
        finally:
            conn.close()


def get_item_by_id(item_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM items WHERE id = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (item_id,))
                row = cursor.fetchone()
                cursor.close()
                return _row_to_dict(row) if row else None
            else:
                cursor = conn.cursor()
                cursor.execute(query, (item_id,))
                row = cursor.fetchone()
                cursor.close()
                return _row_to_dict(row) if row else None
        finally:
            conn.close()


def get_item_by_sku(sku: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM items WHERE sku = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (sku,))
                row = cursor.fetchone()
                cursor.close()
                return _row_to_dict(row) if row else None
            else:
                cursor = conn.cursor()
                cursor.execute(query, (sku,))
                row = cursor.fetchone()
                cursor.close()
                return _row_to_dict(row) if row else None
        finally:
            conn.close()


def create_item(item_data: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        conn = get_connection()
        try:
            now = datetime.utcnow().isoformat() + "Z"
            item_id = item_data.get("id") or f"item-{int(datetime.utcnow().timestamp() * 1000)}"
            query = _format_query("""
                INSERT INTO items (
                    id, name, type, sku, unit, description, image_url,
                    sales_info, purchase_info, inventory_info, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            params = (
                item_id,
                item_data["name"],
                item_data["type"],
                item_data["sku"],
                item_data.get("unit", "pcs"),
                item_data.get("description"),
                item_data.get("imageUrl"),
                json.dumps(item_data.get("salesInfo", {})),
                json.dumps(item_data.get("purchaseInfo", {})),
                json.dumps(item_data.get("inventoryInfo")) if item_data.get("inventoryInfo") else None,
                now,
                now,
            )

            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, params)
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                cursor.close()

            return get_item_by_id(item_id)
        finally:
            conn.close()


def update_item(item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    existing = get_item_by_id(item_id)
    if not existing:
        return None

    updated_name = updates.get("name", existing["name"])
    updated_type = updates.get("type", existing["type"])
    updated_sku = updates.get("sku", existing["sku"])
    updated_unit = updates.get("unit", existing["unit"])
    updated_desc = updates.get("description", existing["description"])
    updated_image = updates.get("imageUrl", existing["imageUrl"])

    updated_sales = updates.get("salesInfo", existing["salesInfo"])
    updated_purchase = updates.get("purchaseInfo", existing["purchaseInfo"])
    updated_inventory = updates.get("inventoryInfo", existing["inventoryInfo"])

    now = datetime.utcnow().isoformat() + "Z"

    with _lock:
        conn = get_connection()
        try:
            query = _format_query("""
                UPDATE items SET
                    name = ?,
                    type = ?,
                    sku = ?,
                    unit = ?,
                    description = ?,
                    image_url = ?,
                    sales_info = ?,
                    purchase_info = ?,
                    inventory_info = ?,
                    updated_at = ?
                WHERE id = ?
            """)
            params = (
                updated_name,
                updated_type,
                updated_sku,
                updated_unit,
                updated_desc,
                updated_image,
                json.dumps(updated_sales or {}),
                json.dumps(updated_purchase or {}),
                json.dumps(updated_inventory) if updated_inventory else None,
                now,
                item_id,
            )
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, params)
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                cursor.close()
            return get_item_by_id(item_id)
        finally:
            conn.close()


def delete_item(item_id: str) -> bool:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("DELETE FROM items WHERE id = ?")
            if IS_POSTGRES:
                cursor = conn.cursor()
                cursor.execute(query, (item_id,))
                conn.commit()
                count = cursor.rowcount
                cursor.close()
                return count > 0
            else:
                cursor = conn.cursor()
                cursor.execute(query, (item_id,))
                conn.commit()
                count = cursor.rowcount
                cursor.close()
                return count > 0
        finally:
            conn.close()


# User Management
def _user_row_to_dict(row: Any) -> Dict[str, Any]:
    if isinstance(row, dict):
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "organization": row["organization"],
            "avatar": row.get("avatar"),
            "createdAt": row["created_at"],
            "auth_provider": row.get("auth_provider", "local"),
        }
    keys = row.keys() if hasattr(row, "keys") else []
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "organization": row["organization"],
        "avatar": row["avatar"],
        "createdAt": row["created_at"],
        "auth_provider": row["auth_provider"] if "auth_provider" in keys else "local",
    }


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM users WHERE LOWER(email) = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (email.lower().strip(),))
                row = cursor.fetchone()
                cursor.close()
                return dict(row) if row else None
            else:
                cursor = conn.cursor()
                cursor.execute(query, (email.lower().strip(),))
                row = cursor.fetchone()
                cursor.close()
                return dict(row) if row else None
        finally:
            conn.close()


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM users WHERE id = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (user_id,))
                row = cursor.fetchone()
                cursor.close()
                return _user_row_to_dict(row) if row else None
            else:
                cursor = conn.cursor()
                cursor.execute(query, (user_id,))
                row = cursor.fetchone()
                cursor.close()
                return _user_row_to_dict(row) if row else None
        finally:
            conn.close()


def create_user(
    name: str,
    email: str,
    password: str,
    organization: str = "Zylker Electronics India Pvt Ltd",
    role: str = "Administrator"
) -> Dict[str, Any]:
    with _lock:
        conn = get_connection()
        try:
            now = datetime.utcnow().isoformat() + "Z"
            user_id = f"user-{int(datetime.utcnow().timestamp() * 1000)}"
            pw_hash = hash_password(password)

            query = _format_query("""
                INSERT INTO users (
                    id, name, email, password_hash, role, organization, avatar, created_at, auth_provider
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            params = (
                user_id,
                name.strip(),
                email.lower().strip(),
                pw_hash,
                role,
                organization,
                f"https://api.dicebear.com/7.x/initials/svg?seed={name}",
                now,
                "local",
            )

            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, params)
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                cursor.close()

            return get_user_by_id(user_id)
        finally:
            conn.close()


def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    raw_user = get_user_by_email(email)
    if not raw_user:
        return None

    expected_hash = hash_password(password)
    if raw_user["password_hash"] == expected_hash:
        return {
            "id": raw_user["id"],
            "name": raw_user["name"],
            "email": raw_user["email"],
            "role": raw_user["role"],
            "organization": raw_user["organization"],
            "avatar": raw_user["avatar"],
            "auth_provider": raw_user.get("auth_provider", "local"),
        }
    return None


def authenticate_or_create_oauth_user(
    provider: str,
    email: Optional[str] = None,
    name: Optional[str] = None,
    avatar: Optional[str] = None,
    organization: Optional[str] = None,
    role: Optional[str] = None,
) -> Dict[str, Any]:
    with _lock:
        conn = get_connection()
        try:
            provider_defaults = {
                "google": (
                    "Shalya Gaonkar",
                    "shalya.gaonkar@gmail.com",
                    "Administrator",
                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80",
                ),
                "microsoft": (
                    "Shalya Gaonkar",
                    "shalya@rooman.onmicrosoft.com",
                    "Chief Financial Officer",
                    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80",
                ),
                "zoho": (
                    "Shalya Gaonkar",
                    "shalya.g@zohomail.in",
                    "Administrator",
                    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80",
                ),
                "github": (
                    "Shalya Gaonkar",
                    "shalya-rooman@github.com",
                    "Lead Developer & Owner",
                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80",
                ),
            }

            def_name, def_email, def_role, def_avatar = provider_defaults.get(
                provider.lower(),
                ("Enterprise User", f"user@{provider.lower()}.oauth", "Administrator", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80")
            )

            user_email = (email or def_email).lower().strip()
            user_name = (name or def_name).strip()
            user_avatar = avatar or def_avatar
            user_role = role or def_role
            user_org = organization or "Zylker Electronics India Pvt Ltd"

            existing = get_user_by_email(user_email)
            if existing:
                update_q = _format_query("""
                    UPDATE users
                    SET auth_provider = ?, avatar = COALESCE(?, avatar)
                    WHERE email = ?
                """)
                if IS_POSTGRES:
                    cur = conn.cursor(cursor_factory=RealDictCursor)
                    cur.execute(update_q, (provider.lower(), user_avatar, user_email))
                    conn.commit()
                    cur.close()
                else:
                    cur = conn.cursor()
                    cur.execute(update_q, (provider.lower(), user_avatar, user_email))
                    conn.commit()
                    cur.close()
                updated = get_user_by_email(user_email)
                return {
                    "id": updated["id"],
                    "name": updated["name"],
                    "email": updated["email"],
                    "role": updated["role"],
                    "organization": updated["organization"],
                    "avatar": updated["avatar"],
                    "auth_provider": provider.lower(),
                }

            now = datetime.utcnow().isoformat() + "Z"
            user_id = f"oauth-{provider.lower()}-{int(datetime.utcnow().timestamp() * 1000)}"
            insert_q = _format_query("""
                INSERT INTO users (
                    id, name, email, password_hash, role, organization, avatar, created_at, auth_provider
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            params = (
                user_id,
                user_name,
                user_email,
                hash_password("oauth_sso_verified_account"),
                user_role,
                user_org,
                user_avatar,
                now,
                provider.lower(),
            )
            if IS_POSTGRES:
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(insert_q, params)
                conn.commit()
                cur.close()
            else:
                cur = conn.cursor()
                cur.execute(insert_q, params)
                conn.commit()
                cur.close()

            created = get_user_by_id(user_id)
            return {
                "id": created["id"],
                "name": created["name"],
                "email": created["email"],
                "role": created["role"],
                "organization": created["organization"],
                "avatar": created["avatar"],
                "auth_provider": provider.lower(),
            }
        finally:
            conn.close()


def number_to_indian_words(n: float) -> str:
    n = int(round(n))
    if n == 0:
        return "Zero Rupees Only"
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def two_digits(num):
        if num < 20:
            return ones[num]
        return tens[num // 10] + (" " + ones[num % 10] if num % 10 != 0 else "")

    def three_digits(num):
        h = num // 100
        rem = num % 100
        res = ""
        if h > 0:
            res += ones[h] + " Hundred"
            if rem > 0:
                res += " and "
        if rem > 0:
            res += two_digits(rem)
        return res

    parts = []
    crore = n // 10000000
    n %= 10000000
    lakh = n // 100000
    n %= 100000
    thousand = n // 1000
    n %= 1000
    remainder = n

    if crore > 0:
        parts.append(two_digits(crore) + " Crore")
    if lakh > 0:
        parts.append(two_digits(lakh) + " Lakh")
    if thousand > 0:
        parts.append(two_digits(thousand) + " Thousand")
    if remainder > 0:
        parts.append(three_digits(remainder))

    return " ".join(parts).strip() + " Rupees Only"


# ==================== INVOICE OPERATIONS ====================
def _invoice_row_to_dict(row: Any) -> Dict[str, Any]:
    items_raw = row["items"]
    if isinstance(items_raw, str):
        try:
            items = json.loads(items_raw)
        except Exception:
            items = []
    elif isinstance(items_raw, list):
        items = items_raw
    else:
        items = []

    return {
        "id": row["id"],
        "client": row["client"],
        "clientEmail": row.get("client_email") or "",
        "clientGstin": row.get("client_gstin") or "29AABCU9603R1ZM",
        "date": row["date"],
        "due": row["due"],
        "subtotal": float(row["subtotal"]),
        "taxAmount": float(row["tax_amount"]),
        "amount": float(row["amount"]),
        "status": row["status"],
        "items": items,
        "notes": row.get("notes") or "",
        "createdAt": row["created_at"],
    }


def get_all_invoices() -> List[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM invoices ORDER BY created_at DESC")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query)
                rows = cursor.fetchall()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query)
                cols = [d[0] for d in cursor.description]
                rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
                cursor.close()
            return [_invoice_row_to_dict(r) for r in rows]
        finally:
            conn.close()


def get_invoice_by_id(invoice_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM invoices WHERE id = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (invoice_id,))
                row = cursor.fetchone()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, (invoice_id,))
                res = cursor.fetchone()
                if not res:
                    return None
                cols = [d[0] for d in cursor.description]
                row = dict(zip(cols, res))
                cursor.close()
            return _invoice_row_to_dict(row) if row else None
        finally:
            conn.close()


def create_invoice(data: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        conn = get_connection()
        try:
            inv_id = data.get("id")
            if not inv_id:
                count_q = _format_query("SELECT COUNT(*) as count FROM invoices")
                if IS_POSTGRES:
                    c = conn.cursor(cursor_factory=RealDictCursor)
                    c.execute(count_q)
                    r = c.fetchone()
                    total = r["count"] if isinstance(r, dict) else r[0]
                    c.close()
                else:
                    c = conn.cursor()
                    c.execute(count_q)
                    total = c.fetchone()[0]
                    c.close()
                inv_id = f"INV-{105 + total}"

            now = datetime.utcnow().isoformat() + "Z"
            items = data.get("items", [])
            subtotal = sum(float(item.get("rate", 0)) * float(item.get("quantity", 1)) for item in items)
            tax_amount = sum((float(item.get("rate", 0)) * float(item.get("quantity", 1)) * float(item.get("taxRate", item.get("tax_rate", 18)))) / 100.0 for item in items)
            total_amount = data.get("amount") or (subtotal + tax_amount)
            if subtotal == 0 and total_amount > 0:
                subtotal = round(total_amount / 1.18, 2)
                tax_amount = round(total_amount - subtotal, 2)

            query = _format_query("""
                INSERT INTO invoices (
                    id, client, client_email, client_gstin, date, due, subtotal, tax_amount, amount, status, items, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            params = (
                inv_id,
                data["client"],
                data.get("clientEmail") or data.get("client_email") or "",
                data.get("clientGstin") or data.get("client_gstin") or "29AABCU9603R1ZM",
                data.get("date") or datetime.now().strftime("%d %b %Y"),
                data.get("due") or "30 Sep 2026",
                subtotal,
                tax_amount,
                total_amount,
                data.get("status", "Sent"),
                json.dumps(items),
                data.get("notes") or "Thank you for your business. Please remit payment via NEFT/RTGS.",
                now,
            )

            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, params)
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                cursor.close()

            return get_invoice_by_id(inv_id)
        finally:
            conn.close()


def update_invoice_status(invoice_id: str, status: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("UPDATE invoices SET status = ? WHERE id = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (status, invoice_id))
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, (status, invoice_id))
                conn.commit()
                cursor.close()
            return get_invoice_by_id(invoice_id)
        finally:
            conn.close()


# ==================== DOCUMENT OPERATIONS ====================
def _document_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "category": row["category"],
        "uploadedBy": row["uploaded_by"],
        "date": row["date"],
        "size": row["size"],
        "verified": bool(row["verified"]),
        "checksum": row["checksum"],
        "notes": row.get("notes") or "",
    }


def get_all_documents() -> List[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM documents ORDER BY id DESC")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query)
                rows = cursor.fetchall()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query)
                cols = [d[0] for d in cursor.description]
                rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
                cursor.close()
            return [_document_row_to_dict(r) for r in rows]
        finally:
            conn.close()


def get_document_by_id(doc_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM documents WHERE id = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (doc_id,))
                row = cursor.fetchone()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, (doc_id,))
                res = cursor.fetchone()
                if not res:
                    return None
                cols = [d[0] for d in cursor.description]
                row = dict(zip(cols, res))
                cursor.close()
            return _document_row_to_dict(row) if row else None
        finally:
            conn.close()


def create_document(data: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        conn = get_connection()
        try:
            doc_id = data.get("id")
            if not doc_id:
                count_q = _format_query("SELECT COUNT(*) as count FROM documents")
                if IS_POSTGRES:
                    c = conn.cursor(cursor_factory=RealDictCursor)
                    c.execute(count_q)
                    r = c.fetchone()
                    total = r["count"] if isinstance(r, dict) else r[0]
                    c.close()
                else:
                    c = conn.cursor()
                    c.execute(count_q)
                    total = c.fetchone()[0]
                    c.close()
                doc_id = f"DOC-{801 + total}"

            import hashlib
            title = data["title"]
            checksum = f"SHA256:{hashlib.sha256(title.encode()).hexdigest()[:24]}"
            query = _format_query("""
                INSERT INTO documents (
                    id, title, category, uploaded_by, date, size, verified, checksum, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            params = (
                doc_id,
                title if title.endswith(".pdf") else f"{title}.pdf",
                data.get("category", "Invoices & Bills"),
                data.get("uploadedBy") or data.get("uploaded_by") or "Shalya Gaonkar",
                datetime.now().strftime("%d %b %Y"),
                data.get("size", "1.4 MB"),
                1 if data.get("verified", True) else 0,
                checksum,
                data.get("notes") or "Document verified & stored in audit vault",
            )

            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, params)
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                cursor.close()

            return get_document_by_id(doc_id)
        finally:
            conn.close()


# ==================== PAYROLL OPERATIONS ====================
def _payroll_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "designation": row["designation"],
        "department": row["department"],
        "gross": float(row["gross"]),
        "deductions": float(row["deductions"]),
        "net": float(row["net"]),
        "bankAcc": row["bank_acc"],
        "pan": row["pan"],
        "uan": row["uan"],
        "status": row["status"],
        "lastPayDate": row["last_pay_date"],
    }


def get_all_payroll_employees() -> List[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM payroll_employees ORDER BY id ASC")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query)
                rows = cursor.fetchall()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query)
                cols = [d[0] for d in cursor.description]
                rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
                cursor.close()
            return [_payroll_row_to_dict(r) for r in rows]
        finally:
            conn.close()


def get_payroll_employee_by_id(emp_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            query = _format_query("SELECT * FROM payroll_employees WHERE id = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (emp_id,))
                row = cursor.fetchone()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, (emp_id,))
                res = cursor.fetchone()
                if not res:
                    return None
                cols = [d[0] for d in cursor.description]
                row = dict(zip(cols, res))
                cursor.close()
            return _payroll_row_to_dict(row) if row else None
        finally:
            conn.close()


def create_payroll_employee(data: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        conn = get_connection()
        try:
            emp_id = data.get("id")
            if not emp_id:
                count_q = _format_query("SELECT COUNT(*) as count FROM payroll_employees")
                if IS_POSTGRES:
                    c = conn.cursor(cursor_factory=RealDictCursor)
                    c.execute(count_q)
                    r = c.fetchone()
                    total = r["count"] if isinstance(r, dict) else r[0]
                    c.close()
                else:
                    c = conn.cursor()
                    c.execute(count_q)
                    total = c.fetchone()[0]
                    c.close()
                emp_id = f"EMP-{101 + total}"

            gross = float(data["gross"])
            deductions = round(gross * 0.12)
            net = gross - deductions

            query = _format_query("""
                INSERT INTO payroll_employees (
                    id, name, designation, department, gross, deductions, net, bank_acc, pan, uan, status, last_pay_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)
            params = (
                emp_id,
                data["name"],
                data.get("designation") or "Software Specialist",
                data.get("department") or "Engineering",
                gross,
                deductions,
                net,
                data.get("bankAcc") or data.get("bank_acc") or "••••••••5812",
                data.get("pan") or "ABCDE1234F",
                data.get("uan") or "101294819201",
                data.get("status", "Processing"),
                datetime.now().strftime("%d %b %Y"),
            )

            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, params)
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                cursor.close()

            return get_payroll_employee_by_id(emp_id)
        finally:
            conn.close()


def disburse_all_payroll() -> List[Dict[str, Any]]:
    with _lock:
        conn = get_connection()
        try:
            today = datetime.now().strftime("%d %b %Y")
            query = _format_query("UPDATE payroll_employees SET status = 'Paid', last_pay_date = ?")
            if IS_POSTGRES:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(query, (today,))
                conn.commit()
                cursor.close()
            else:
                cursor = conn.cursor()
                cursor.execute(query, (today,))
                conn.commit()
                cursor.close()
            return get_all_payroll_employees()
        finally:
            conn.close()


def generate_employee_payslip(emp_id: str, month: str = "August 2026") -> Optional[Dict[str, Any]]:
    emp = get_payroll_employee_by_id(emp_id)
    if not emp:
        return None

    gross = emp["gross"]
    basic = round(gross * 0.50, 2)
    hra = round(gross * 0.25, 2)
    special_allowance = round(gross - basic - hra, 2)

    pf = round(basic * 0.12, 2)
    pt = 200.0
    tds = round(gross * 0.05, 2) if gross > 100000 else 0.0
    total_deductions = round(pf + pt + tds, 2)
    net = round(gross - total_deductions, 2)

    return {
        "id": f"PS-{emp_id}-{month.replace(' ', '')}",
        "employeeId": emp["id"],
        "name": emp["name"],
        "designation": emp["designation"],
        "department": emp["department"],
        "month": month,
        "gross": gross,
        "basic": basic,
        "hra": hra,
        "specialAllowance": special_allowance,
        "pf": pf,
        "pt": pt,
        "tds": tds,
        "totalDeductions": total_deductions,
        "net": net,
        "netInWords": number_to_indian_words(net),
        "bankAcc": emp["bankAcc"],
        "pan": emp["pan"],
        "uan": emp["uan"],
        "status": emp["status"],
    }

