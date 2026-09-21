"""Open (no-auth) route so uptime checks don't need a Cognito token."""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {"status": "ok"}
