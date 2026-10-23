"""ExpenseTrack Pro API — a FastAPI app that runs two ways:

  - Locally:  uvicorn main:app --reload      (see ../README.md)
  - Deployed: wrapped by Mangum in lambda_handler.py, behind API Gateway

Every route except /health requires a signed-in user (enforced by API
Gateway's Cognito authorizer once deployed; see dependencies/auth.py).
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import budgets, expenses, health, receipts, savings, settings, whatsapp


def _allowed_origins() -> list[str]:
    """The browser origins allowed to call the API.

    On Lambda, APP_ORIGINS is set by api_stack.py from the same list as the
    HTTP API's own CORS (backend/cdk/stacks/site_config.py). Locally it's
    unset, so fall back to the dev servers and the CloudFront URL.
    """
    configured = [o.strip() for o in os.environ.get("APP_ORIGINS", "").split(",") if o.strip()]
    return configured or [
        "http://localhost:5173",
        "http://localhost:5193",
        "https://d3bttra9tv41h7.cloudfront.net",
    ]


app = FastAPI(title="ExpenseTrack Pro API", version="0.1.0")

# Redundant with the HTTP API's own CORS config once deployed, but needed
# for local `uvicorn` development, where nothing else sets these headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(expenses.router)
app.include_router(settings.router)
app.include_router(savings.router)
app.include_router(budgets.router)
app.include_router(receipts.router)
app.include_router(whatsapp.router)
