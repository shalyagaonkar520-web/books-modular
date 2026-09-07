import sqlite3
import json
import os
import threading
from typing import List, Optional, Dict, Any
from datetime import datetime
from backend.seed_data import get_initial_seed_items

DB_PATH = os.path.join(os.path.dirname(__file__), "zoho_books.db")
_lock = threading.RLock()


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _lock:
        with get_connection() as conn:
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
            conn.commit()

            # Seed if empty
            cursor.execute("SELECT COUNT(*) FROM items")
            count = cursor.fetchone()[0]
            if count == 0:
                _seed_items(cursor, get_initial_seed_items())
                conn.commit()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    sales_info = json.loads(row["sales_info"]) if row["sales_info"] else {}
    purchase_info = json.loads(row["purchase_info"]) if row["purchase_info"] else {}
    inventory_info = json.loads(row["inventory_info"]) if row["inventory_info"] else None

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


def _seed_items(cursor: sqlite3.Cursor, items: List[Dict[str, Any]]):
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


def reset_seed_data() -> List[Dict[str, Any]]:
    with _lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM items")
            seed_items = get_initial_seed_items()
            _seed_items(cursor, seed_items)
            conn.commit()
            return get_all_items()


def get_all_items() -> List[Dict[str, Any]]:
    with _lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM items ORDER BY created_at DESC")
            rows = cursor.fetchall()
            return [_row_to_dict(row) for row in rows]


def get_item_by_id(item_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM items WHERE id = ?", (item_id,))
            row = cursor.fetchone()
            if row:
                return _row_to_dict(row)
            return None


def get_item_by_sku(sku: str) -> Optional[Dict[str, Any]]:
    with _lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM items WHERE sku = ?", (sku,))
            row = cursor.fetchone()
            if row:
                return _row_to_dict(row)
            return None


def create_item(item_data: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.utcnow().isoformat() + "Z"
            item_id = item_data.get("id") or f"item-{int(datetime.utcnow().timestamp() * 1000)}"

            cursor.execute("""
                INSERT INTO items (
                    id, name, type, sku, unit, description, image_url,
                    sales_info, purchase_info, inventory_info, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
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
            ))
            conn.commit()
            return get_item_by_id(item_id)


def update_item(item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    existing = get_item_by_id(item_id)
    if not existing:
        return None

    # Merge updates
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
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
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
            """, (
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
            ))
            conn.commit()
            return get_item_by_id(item_id)


def delete_item(item_id: str) -> bool:
    with _lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM items WHERE id = ?", (item_id,))
            conn.commit()
            return cursor.rowcount > 0
