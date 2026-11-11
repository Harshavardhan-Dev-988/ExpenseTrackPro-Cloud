"""Versioned data migrations.

Each migration is a module here with an ID (three digits, run in order), a
DESCRIPTION and a run(ctx) function that returns counts for the record. The
runner records every applied migration as SYSTEM / MIGRATION#<id> in the
table, so a migration runs exactly once per table, however often the
runner is invoked. migrate_handler.py runs this after every deploy (a CDK
Trigger), so adding a migration means adding a module and deploying.

Write migrations to be safe to re-run anyway: if one fails half-way it
isn't recorded and runs again in full next time, possibly after users have
changed data in the meantime — so write conditionally (only if absent, or
only if older) rather than overwriting.
"""
import importlib
import logging
import pkgutil
from datetime import datetime, timezone
from typing import Dict, List

import db
import keys as K

log = logging.getLogger(__name__)


def available() -> List:
    mods = []
    for info in pkgutil.iter_modules(__path__):
        if info.name.startswith("m") and info.name[1:4].isdigit():
            mods.append(importlib.import_module(f"{__name__}.{info.name}"))
    return sorted(mods, key=lambda m: m.ID)


def applied() -> Dict[str, dict]:
    return {i["SK"].split("#", 1)[1]: i for i in db.query("SYSTEM", "MIGRATION#")}


def run_pending(options: dict | None = None) -> List[dict]:
    done = applied()
    results = []
    for mod in available():
        if mod.ID in done:
            continue
        log.info("running migration %s: %s", mod.ID, mod.DESCRIPTION)
        counts = mod.run(options or {})
        record = db.stamp({
            "PK": "SYSTEM",
            "SK": f"MIGRATION#{mod.ID}",
            "id": mod.ID,
            "description": mod.DESCRIPTION,
            "appliedAt": datetime.now(timezone.utc).isoformat(),
            "counts": counts,
        }, K.T_MIGRATION)
        db.put_item(record)
        results.append({"id": mod.ID, **counts})
    return results
