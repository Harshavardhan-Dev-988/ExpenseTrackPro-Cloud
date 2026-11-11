"""v1 -> v2: copy every user's data from the old per-user table into the
new ledger-scoped table.

v1 (table expense-track-pro-<stage>)        v2 (expense-track-pro-v2-<stage>)
USER#<sub> / EXPENSE#<id>              ->   LEDGER#<lid> / EXP#<id>   (+ GSI2 by date)
USER#<sub> / BUDGET#<key>              ->   LEDGER#<lid> / BUDGET#<key>
USER#<sub> / SAVINGS_ENTRY#<id>        ->   LEDGER#<lid> / SAVE#<id>  (+ GSI2 by date)
USER#<sub> / SAVINGS_GOAL#<id>         ->   LEDGER#<lid> / GOAL#<id>
USER#<sub> / CATGROUP#, CATEGORY#      ->   LEDGER#<lid> / same
USER#<sub> / SETTINGS                  ->   LEDGER#<lid> / SETTINGS (currency)
                                            + USER#<sub> / PROFILE (theme, date format, locale)
USER#<sub> / WHATSAPP_LINK             ->   USER#<sub> / WHATSAPP
WHATSAPP#<phone> / LINK                ->   PHONE#<phone> / LINK
LINKCODE#…                             ->   dropped (15-minute codes)

<lid> is the user's personal ledger id (deterministic from their sub, the
same one first sign-in would create), owned by them. The old table is left
untouched, so rolling back is pointing the API at it again.

Every write is "only if not there yet": the API is already serving v2
while this runs (it's triggered after the Lambda update), so anything a
user does in v2 in the meantime — or before a re-run — wins over the v1
copy. A profile created by a first sign-in during the copy keeps its
values and only gains the migrated preferences it lacks.
"""
import os
from collections import defaultdict

import db
import keys as K
from routers.budgets import budget_item
from routers.expenses import expense_item
from routers.savings import entry_item, goal_item
from services import ledgers as L

ID = "001"
DESCRIPTION = "Move per-user data (schema v1) into personal ledgers (schema v2)"

PERSONAL = ("theme", "dateFormat", "locale")


def _clean(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in ("PK", "SK")}


def run(options: dict) -> dict:
    legacy = options.get("legacy_table") or os.environ.get("LEGACY_TABLE_NAME")
    if not legacy:
        # Fail (and stay unrecorded) rather than mark the copy as done.
        raise RuntimeError("LEGACY_TABLE_NAME isn't set: nothing to migrate from")

    by_user = defaultdict(list)
    phone_links = []
    for item in db.scan_all(legacy):
        pk = item["PK"]
        if pk.startswith("USER#"):
            by_user[pk[5:]].append(item)
        elif pk.startswith("WHATSAPP#") and item["SK"] == "LINK":
            phone_links.append(item)

    counts = defaultdict(int)
    for sub, items in by_user.items():
        lid = L.personal_ledger_id(sub)
        created = min((str(i.get("createdAt")) for i in items if i.get("createdAt")), default=L.now_iso())
        puts = [
            L.meta_item(lid, "My household", sub, personal=True, created=created,
                        legacyReceiptPrefix=f"receipts/{sub}/"),
            L.member_item(lid, sub, "owner", joined=created),
        ]
        profile = {"defaultLedgerId": lid}
        for item in items:
            sk, body = item["SK"], _clean(db.public(item))
            if sk.startswith("EXPENSE#"):
                puts.append(expense_item(lid, {**body, "createdBy": sub}))
                counts["expenses"] += 1
            elif sk.startswith("BUDGET#"):
                puts.append(budget_item(lid, body))
                counts["budgets"] += 1
            elif sk.startswith("SAVINGS_ENTRY#"):
                puts.append(entry_item(lid, body))
                counts["savingsEntries"] += 1
            elif sk.startswith("SAVINGS_GOAL#"):
                puts.append(goal_item(lid, body))
                counts["savingsGoals"] += 1
            elif sk.startswith("CATGROUP#"):
                puts.append(db.stamp({"PK": K.ledger_pk(lid), "SK": sk, **body}, K.T_CATEGORY_GROUP))
                counts["customGroups"] += 1
            elif sk.startswith("CATEGORY#"):
                puts.append(db.stamp({"PK": K.ledger_pk(lid), "SK": sk, **body}, K.T_CATEGORY))
                counts["customCategories"] += 1
            elif sk == "SETTINGS":
                if body.get("currency"):
                    puts.append(db.stamp({"PK": K.ledger_pk(lid), "SK": K.SETTINGS,
                                          "currency": body["currency"], "yearStart": "jan"}, K.T_LEDGER_SETTINGS))
                profile.update({k: body[k] for k in PERSONAL if k in body})
            elif sk == "WHATSAPP_LINK":
                puts.append(db.stamp({"PK": K.user_pk(sub), "SK": K.WHATSAPP, **body}, K.T_WHATSAPP))
        for item in puts:
            db.put_item(item, if_absent=True)
        existing = L.get_profile(sub)
        if existing:
            db.update_fields(existing["PK"], existing["SK"], {k: v for k, v in profile.items() if k not in existing})
        else:
            db.put_item(L.profile_item(sub, **profile), if_absent=True)
        counts["users"] += 1

    if phone_links:
        for p in phone_links:
            db.put_item(db.stamp({"PK": K.phone_pk(p["PK"].split("#", 1)[1]), "SK": "LINK", "userId": p["userId"]},
                                 K.T_PHONE), if_absent=True)
        counts["phoneLinks"] = len(phone_links)
    return dict(counts)
