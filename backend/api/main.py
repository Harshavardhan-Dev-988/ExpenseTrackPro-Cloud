"""ExpenseTrack Pro API — a FastAPI app that runs two ways:

  - Locally:  uvicorn main:app --reload      (see ../README.md)
  - Deployed: wrapped by Mangum in lambda_handler.py, behind API Gateway

Every route except /health requires a signed-in user (enforced by API
Gateway's Cognito authorizer once deployed; see dependencies/auth.py).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import budgets, expenses, health, savings, settings

app = FastAPI(title="ExpenseTrack Pro API", version="0.1.0")

# Redundant with the HTTP API's own CORS config once deployed, but needed
# for local `uvicorn` development, where nothing else sets these headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5193",
        "https://d3bttra9tv41h7.cloudfront.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(expenses.router)
app.include_router(settings.router)
app.include_router(savings.router)
app.include_router(budgets.router)
