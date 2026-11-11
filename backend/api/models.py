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
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


# ---- Expenses ---------------------------------------------------------
# People in a split are referenced as "m:<userId>" (a ledger member) or
# "n:<name>" (anyone else, e.g. a friend on a trip).

class SplitShare(BaseModel):
    person: str
    amount: float


class Split(BaseModel):
    shares: List[SplitShare]


class ExpenseCreate(BaseModel):
    date: datetime
    amount: float
    category: str
    description: str
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    receiptUrl: Optional[str] = None
    paidBy: Optional[str] = None
    split: Optional[Split] = None
    # Set only by the recurring-expense machinery.
    recurringId: Optional[str] = None


class ExpenseBatchCreate(BaseModel):
    items: List[ExpenseCreate]


class IdList(BaseModel):
    ids: List[str]


class ExpenseUpdate(BaseModel):
    """Every field optional — PUT sends only what changed."""
    date: Optional[datetime] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    receiptUrl: Optional[str] = None
    paidBy: Optional[str] = None
    split: Optional[Split] = None


class Expense(BaseModel):
    id: str
    date: datetime
    amount: float
    category: str
    description: str
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    receiptUrl: Optional[str] = None
    paidBy: Optional[str] = None
    split: Optional[Split] = None
    recurringId: Optional[str] = None
    createdBy: Optional[str] = None
    createdByName: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


# ---- Settings -----------------------------------------------------------

class Settings(BaseModel):
    """What the app calls settings is two records merged: ledger-wide
    (currency, yearStart — shared by the household) and personal (theme,
    dateFormat, locale — each member's own)."""
    currency: str = "INR"
    dateFormat: str = "DD/MM/YYYY"
    theme: str = "system"
    locale: str = "en-IN"
    # "jan" = calendar year, "apr" = Indian financial year (Apr–Mar).
    yearStart: str = "jan"


LEDGER_SETTING_FIELDS = ("currency", "yearStart")
PERSONAL_SETTING_FIELDS = ("dateFormat", "theme", "locale")


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

# WhatsApp linking (phase 4) request/response models live in
# routers/whatsapp.py itself, next to the routes that use them - same
# convention as receipts.py's UploadUrlRequest/Response, since nothing else
# needs to import them.


# ---- Custom categories ------------------------------------------------
# Built-in categories and groups live in the frontend (utils/constants.ts).
# These are the ones a user adds on top: extra sub-categories (under a
# built-in or custom group) and whole new parent groups. Ids are generated
# by the client ("cg_…" for groups, "custom_…" for categories) so an expense
# can reference a custom category before the next full reload.

class CustomCategoryGroup(BaseModel):
    id: str
    name: str
    color: str = "#8C9A8C"
    icon: str = "🏷️"


class CustomCategory(BaseModel):
    id: str
    label: str
    groupId: str


class CustomCategories(BaseModel):
    groups: List[CustomCategoryGroup] = []
    categories: List[CustomCategory] = []


# ---- Ledgers, members, invites ----------------------------------------

ROLES = ("owner", "editor", "viewer")


class LedgerSummary(BaseModel):
    id: str
    name: str
    role: str
    ownerId: str
    isPersonal: bool = False
    memberCount: int = 1


class LedgerCreate(BaseModel):
    name: str


class LedgerUpdate(BaseModel):
    name: str


class Member(BaseModel):
    userId: str
    email: Optional[str] = None
    name: Optional[str] = None
    role: str
    joinedAt: Optional[datetime] = None


class MemberUpdate(BaseModel):
    role: str


class InviteCreate(BaseModel):
    email: str
    role: str = "editor"


class Invite(BaseModel):
    ledgerId: str
    ledgerName: Optional[str] = None
    email: str
    role: str
    invitedBy: str
    invitedByName: Optional[str] = None
    createdAt: datetime
    expiresAt: datetime


class Preferences(BaseModel):
    notifyBudgetAlerts: bool = True
    notifyMonthlySummary: bool = True
    defaultLedgerId: Optional[str] = None


class PreferencesUpdate(BaseModel):
    notifyBudgetAlerts: Optional[bool] = None
    notifyMonthlySummary: Optional[bool] = None
    defaultLedgerId: Optional[str] = None


class Me(BaseModel):
    userId: str
    email: Optional[str] = None
    name: Optional[str] = None
    defaultLedgerId: str
    ledgers: List[LedgerSummary]
    invites: List[Invite]
    preferences: Preferences
    emailSendingEnabled: bool = False


# ---- Recurring expenses -------------------------------------------------

FREQUENCIES = ("weekly", "monthly", "quarterly", "yearly")


class RecurringBase(BaseModel):
    description: str
    amount: float
    category: str
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    frequency: str = "monthly"
    # Monthly/quarterly/yearly: day of month (31 = last day of shorter months).
    dayOfMonth: Optional[int] = None
    # Weekly: 0 = Monday … 6 = Sunday.
    weekday: Optional[int] = None
    startDate: date
    endDate: Optional[date] = None
    # Log automatically on the due date, or wait for someone to confirm.
    autoLog: bool = True
    active: bool = True
    paidBy: Optional[str] = None


class RecurringCreate(RecurringBase):
    pass


class RecurringUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    paymentMethod: Optional[str] = None
    tags: Optional[List[str]] = None
    frequency: Optional[str] = None
    dayOfMonth: Optional[int] = None
    weekday: Optional[int] = None
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    autoLog: Optional[bool] = None
    active: Optional[bool] = None
    paidBy: Optional[str] = None


class Recurring(RecurringBase):
    id: str
    nextDue: Optional[date] = None
    lastLoggedDue: Optional[date] = None
    createdBy: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


class RecurringRunResult(BaseModel):
    logged: int
    due: List[dict]


# ---- Split settlements ---------------------------------------------------

class SettlementCreate(BaseModel):
    fromPerson: str
    toPerson: str
    amount: float
    date: datetime
    note: Optional[str] = None


class Settlement(SettlementCreate):
    id: str
    createdBy: Optional[str] = None
    createdAt: datetime


class BalancePerson(BaseModel):
    ref: str
    name: str
    isMember: bool
    net: float


class Transfer(BaseModel):
    fromPerson: str
    toPerson: str
    amount: float


class Balances(BaseModel):
    people: List[BalancePerson]
    transfers: List[Transfer]
    splitExpenses: int
    settlements: List[Settlement]
