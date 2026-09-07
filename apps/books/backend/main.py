from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db
from backend.routes.items import router as items_router
from backend.routes.dashboard import router as dashboard_router
from backend.routes.auth import router as auth_router
from backend.routes.invoices import router as invoices_router
from backend.routes.documents import router as documents_router
from backend.routes.payroll import router as payroll_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database and seed initial data if empty
    init_db()
    yield


app = FastAPI(
    title="Zoho Books API",
    description="Python FastAPI backend for Zoho Books Clone with persistence and business analytics",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(items_router)
app.include_router(dashboard_router)
app.include_router(auth_router)
app.include_router(invoices_router)
app.include_router(documents_router)
app.include_router(payroll_router)


@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "Zoho Books Cloud Ledger Engine",
        "version": "1.0.0",
        "database": "Connected",
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to Zoho Books Clone API",
        "docs": "/docs",
        "health": "/api/health",
        "items": "/api/items",
        "dashboard": "/api/dashboard/summary",
    }
