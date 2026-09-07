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
