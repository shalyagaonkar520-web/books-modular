from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db
from backend.routes.items import router as items_router
from backend.routes.dashboard import router as dashboard_router
from backend.routes.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and seed initial data if empty
    init_db()
    yield


app = FastAPI(
    title="Zoho Books API",
    description="Python FastAPI backend for Zoho Books Clone with SQLite persistence and business analytics",
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


@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "Zoho Books FastAPI Backend",
        "version": "1.0.0",
        "database": "SQLite connected",
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
