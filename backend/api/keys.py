"""Every DynamoDB key in the app, built in one place.

Schema v2 (see docs/data-model.md for the full picture). Data belongs to a
*ledger* — a household's shared book — not to a user. A user's own data is
simply their first ledger; inviting family members adds MEMBER items to it.

Base table (PK, SK):
    LEDGER#<lid>   META                ledger name, owner, created
    LEDGER#<lid>   MEMBER#<sub>        role: owner | editor | viewer
    LEDGER#<lid>   INVITE#<email>      pending invite (ttl)
    LEDGER#<lid>   SETTINGS            ledger-wide settings (currency, year start)
    LEDGER#<lid>   EXP#<id>            expense
    LEDGER#<lid>   BUDGET#<key>        budget (category id or group:<id>)
    LEDGER#<lid>   SAVE#<id>           savings entry
    LEDGER#<lid>   GOAL#<id>           savings goal
    LEDGER#<lid>   CATGROUP#<id>       custom category group
    LEDGER#<lid>   CATEGORY#<id>       custom category
    LEDGER#<lid>   RECUR#<id>          recurring expense rule
    LEDGER#<lid>   SETTLE#<id>         split settlement ("A paid B back")
    LEDGER#<lid>   SENT#<kind>#<key>   notification already sent (ttl)
    LEDGER#<lid>   OUTBOX#<ts>#<id>    email built while sending is off (ttl)
    USER#<sub>     PROFILE             email, name, personal prefs, default ledger
    USER#<sub>     WHATSAPP            linked phone number
    PHONE#<e164>   LINK                which user a WhatsApp number belongs to
    LINKCODE#<c>   PENDING             one-time WhatsApp link code (ttl)
    SYSTEM         MIGRATION#<nnn>     a data migration that has been applied

GSI1 (GSI1PK, GSI1SK) — "lookups", overloaded:
    USER#<sub>         LEDGER#<lid>              ledgers a user belongs to (MEMBER items)
    INVITE#<email>     LEDGER#<lid>              invites waiting for an email (INVITE items)
    LEDGERS            <lid>                     every ledger, for scheduled jobs (META items)
    DUE#<yyyy-mm>      <date>#<lid>#<rid>        active recurring rules by next due date
    LEDGER#<lid>#SPLIT <date>#<id>               only expenses that are split (sparse)

GSI2 (GSI2PK, GSI2SK) — "by date":
    LEDGER#<lid>#EXP   <yyyy-mm-dd>#<id>         expenses in date order (range queries)
    LEDGER#<lid>#SAVE  <yyyy-mm-dd>#<id>         savings entries in date order

Every item also carries `type` (entity name) and `v` (its schema version),
so a future migration can find and upgrade exactly the items it needs.
"""
from datetime import date, datetime

SCHEMA_VERSION = 2

# Entity type names written to each item's `type` attribute.
T_LEDGER = "Ledger"
T_MEMBER = "Member"
T_INVITE = "Invite"
T_LEDGER_SETTINGS = "LedgerSettings"
T_EXPENSE = "Expense"
T_BUDGET = "Budget"
T_SAVINGS_ENTRY = "SavingsEntry"
T_SAVINGS_GOAL = "SavingsGoal"
T_CATEGORY_GROUP = "CategoryGroup"
T_CATEGORY = "Category"
T_RECURRING = "Recurring"
T_SETTLEMENT = "Settlement"
T_SENT = "NotificationSent"
T_OUTBOX = "Outbox"
T_PROFILE = "Profile"
T_WHATSAPP = "WhatsAppLink"
T_PHONE = "PhoneLink"
T_LINK_CODE = "LinkCode"
T_MIGRATION = "Migration"

# Sort-key prefixes inside a ledger partition.
META = "META"
SETTINGS = "SETTINGS"
MEMBER = "MEMBER#"
INVITE = "INVITE#"
EXPENSE = "EXP#"
BUDGET = "BUDGET#"
SAVINGS_ENTRY = "SAVE#"
SAVINGS_GOAL = "GOAL#"
CATEGORY_GROUP = "CATGROUP#"
CATEGORY = "CATEGORY#"
RECURRING = "RECUR#"
SETTLEMENT = "SETTLE#"
SENT = "SENT#"
OUTBOX = "OUTBOX#"

PROFILE = "PROFILE"
WHATSAPP = "WHATSAPP"

ALL_LEDGERS = "LEDGERS"


def ledger_pk(ledger_id: str) -> str:
    return f"LEDGER#{ledger_id}"


def user_pk(user_id: str) -> str:
    return f"USER#{user_id}"


def phone_pk(e164: str) -> str:
    return f"PHONE#{e164}"


def link_code_pk(code: str) -> str:
    return f"LINKCODE#{code}"


def invite_gsi(email: str) -> str:
    return f"INVITE#{email.strip().lower()}"


def day(value) -> str:
    """yyyy-mm-dd for a date, datetime or ISO string (the first 10 chars)."""
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    return str(value)[:10]


def by_date(ledger_id: str, kind: str) -> str:
    """GSI2 partition for a ledger's dated items; kind is EXP or SAVE."""
    return f"LEDGER#{ledger_id}#{kind}"


def splits_gsi(ledger_id: str) -> str:
    return f"LEDGER#{ledger_id}#SPLIT"


def due_gsi(due_day: str) -> str:
    """GSI1 partition for recurring rules due in a month (yyyy-mm)."""
    return f"DUE#{due_day[:7]}"
