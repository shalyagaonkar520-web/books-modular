# Zoho Books Clone - Python FastAPI + React Tech Stack

A high-fidelity Zoho Books clone featuring a **Python FastAPI** backend with persistent **SQLite** database storage, OpenAPI / Swagger documentation, dynamic business analytics, and a modern **React + Vite** frontend.

---

## Tech Stack Overview

- **Backend**: [Python 3.10+](https://python.org) + [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/)
- **Data Persistence**: SQLite (`backend/zoho_books.db`) via thread-safe Python engine
- **Data Validation & Modeling**: [Pydantic v2](https://docs.pydantic.dev/)
- **Frontend**: React 18 + TypeScript + Vite + Vanilla CSS design system
- **API Documentation**: Interactive Swagger UI (`/docs`) and ReDoc (`/redoc`)

---

## Quick Start

### 1. Install Dependencies

**Python Backend:**
```bash
python -m pip install -r requirements.txt
```

**Frontend:**
```bash
npm install
```

### 2. Run the Application

#### Option A: One-Click Windows Launcher
Double-click or run:
```cmd
start.bat
```

#### Option B: Terminal Commands
Run the backend and frontend in separate terminals:

**Terminal 1 (FastAPI Server):**
```bash
python run_server.py
# Or with auto-reload:
uvicorn backend.main:app --reload --port 8000
```

**Terminal 2 (React Vite Client):**
```bash
npm run dev
```

The frontend will be live at `http://localhost:3000` and communicate through the Vite proxy to the FastAPI backend at `http://127.0.0.1:8000`.

---

## API Documentation & Endpoints

Interactive Swagger documentation is available at:
👉 **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)**

### Available Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health & SQLite connection status |
| `GET` | `/api/items` | List items with search, type filter, inventory filter & sort |
| `GET` | `/api/items/{id}` | Retrieve item details by ID |
| `POST` | `/api/items` | Create a new item (with duplicate SKU validation) |
| `PUT` | `/api/items/{id}` | Update an existing item |
| `DELETE` | `/api/items/{id}` | Delete an item by ID |
| `POST` | `/api/items/reset` | Reset database to default accounting sample items |
| `GET` | `/api/dashboard/summary` | Get aggregated receivables, payables, cash flow & inventory metrics |

---

## Running Backend Tests

Run the automated integration test suite:
```bash
python -m unittest tests.test_api
# or via npm script:
npm run test:server
```
