"""Pydantic models for the API's request/response bodies.

Field names are kept in camelCase to match the frontend's `types/index.ts`
exactly (Expense, Settings, SavingsEntry, SavingsGoal) — the browser can send
and receive these bodies with no field-renaming layer in between.

`category` and `paymentMethod` are plain strings here rather than a mirrored
enum of every value in the frontend's `CategoryType`. That union has ~80
values today and will keep growing; hard-coding it a second time in Python is
exactly the kind of thing that quietly drifts out of sync (a category added
in the frontend would get rejected by the API until someone remembers to
update this file too). The frontend's own `<select>` is still the real
guardrail against typos; the API just checks "is this a non-empty string".
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---- Expenses ---------------------------------------------------------

class ExpenseCreate(BaseModel):
    date: datetime
    amount: float
    category: str
    description: str
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    receiptUrl: Optional[str] = None


class ExpenseUpdate(BaseModel):
    """Every field optional — PUT sends only what changed."""
    date: Optional[datetime] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    receiptUrl: Optional[str] = None


class Expense(BaseModel):
    id: str
    date: datetime
    amount: float
    category: str
    description: str
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    receiptUrl: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


# ---- Settings -----------------------------------------------------------

class Settings(BaseModel):
    currency: str = "INR"
    dateFormat: str = "DD/MM/YYYY"
    theme: str = "system"
    locale: str = "en-IN"


# ---- Savings --------------------------------------------------------------

class SavingsEntryCreate(BaseModel):
    date: datetime
    amount: float
    category: str
    description: str
    account: Optional[str] = None
    interestRate: Optional[float] = None
    maturityDate: Optional[datetime] = None
    isRecurring: Optional[bool] = None
    tags: Optional[List[str]] = None


class SavingsEntryUpdate(BaseModel):
    date: Optional[datetime] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    account: Optional[str] = None
    interestRate: Optional[float] = None
    maturityDate: Optional[datetime] = None
    isRecurring: Optional[bool] = None
    tags: Optional[List[str]] = None


class SavingsEntry(BaseModel):
    id: str
    date: datetime
    amount: float
    category: str
    description: str
    account: Optional[str] = None
    interestRate: Optional[float] = None
    maturityDate: Optional[datetime] = None
    isRecurring: Optional[bool] = None
    tags: Optional[List[str]] = None
    createdAt: datetime
    updatedAt: datetime


class SavingsGoalCreate(BaseModel):
    name: str
    targetAmount: float
    currentAmount: float = 0
    deadline: Optional[datetime] = None
    category: str
    priority: str = "medium"
    isActive: bool = True


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    targetAmount: Optional[float] = None
    currentAmount: Optional[float] = None
    deadline: Optional[datetime] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    isActive: Optional[bool] = None


class SavingsGoal(BaseModel):
    id: str
    name: str
    targetAmount: float
    currentAmount: float
    deadline: Optional[datetime] = None
    category: str
    priority: str
    isActive: bool
    createdAt: datetime


# ---- Budgets --------------------------------------------------------------

# One budget per category, keyed by `category` itself (not a generated id) -
# there's only ever one active budget per category, so "create" and "update"
# are the same operation: an upsert at PUT /budgets/{category}.

class Budget(BaseModel):
    category: str
    monthlyLimit: Optional[float] = None
    yearlyLimit: Optional[float] = None
    budgetType: str = "monthly"
    alertThreshold: float = 80
    isActive: bool = True


# ---- WhatsApp linking (phase 4) -----------------------------------------

class WhatsAppLinkCreate(BaseModel):
    phoneNumber: str = Field(..., description="E.164 format, e.g. +919812345678")
