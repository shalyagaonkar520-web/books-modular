import base64
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Header, status
from backend.models import UserLoginRequest, UserRegisterRequest, UserProfile, AuthResponse
from backend import database

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def generate_token(user_id: str, email: str) -> str:
    raw = f"{user_id}:{email}:zoho_token"
    return base64.b64encode(raw.encode()).decode()


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLoginRequest):
    user = database.authenticate_user(payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Use 'admin@zylkerbooks.com' / 'password123' for demo access.",
        )

    token = generate_token(user["id"], user["email"])
    return AuthResponse(
        user=UserProfile(**user),
        token=token,
        message="Login successful",
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest):
    existing = database.get_user_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{payload.email}' already exists. Please sign in instead.",
        )

    new_user = database.create_user(
        name=payload.name,
        email=payload.email,
        password=payload.password,
        organization=payload.organization or "Zylker Electronics India Pvt Ltd",
        role=payload.role or "Administrator",
    )

    token = generate_token(new_user["id"], new_user["email"])
    return AuthResponse(
        user=UserProfile(**new_user),
        token=token,
        message="Account created successfully",
    )


@router.get("/me", response_model=UserProfile)
def get_current_user(authorization: Optional[str] = Header(None)):
    # Default to demo admin user if no header or for demo experience
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        try:
            decoded = base64.b64decode(token).decode()
            user_id = decoded.split(":")[0]
            user = database.get_user_by_id(user_id)
            if user:
                return UserProfile(**user)
        except Exception:
            pass

    # Default fallback: return primary admin user
    admin_user = database.get_user_by_email("admin@zylkerbooks.com")
    if admin_user:
        return UserProfile(
            id=admin_user["id"],
            name=admin_user["name"],
            email=admin_user["email"],
            role=admin_user["role"],
            organization=admin_user["organization"],
            avatar=admin_user["avatar"],
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


@router.get("/demo-users")
def get_demo_users():
    return [
        {
            "name": "Shaly Gaonkar",
            "email": "admin@zylkerbooks.com",
            "password": "password123",
            "role": "Administrator",
            "organization": "Zylker Electronics India Pvt Ltd",
            "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80",
            "description": "Full access to settings, inventory, accounting & banking",
        },
        {
            "name": "Priya Sharma",
            "email": "accountant@rooman.com",
            "password": "password123",
            "role": "Chief Accountant",
            "organization": "Zylker Electronics India Pvt Ltd",
            "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80",
            "description": "Audit, tax filing, journals, balance sheet & payroll access",
        },
    ]
