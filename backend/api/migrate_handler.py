"""Runs pending data migrations (migrations/). Invoked by a CDK Trigger
after each deploy of the Api stack, and runnable by hand:

    TABLE_NAME=... LEGACY_TABLE_NAME=... python3 migrate_handler.py
"""
import json
import logging

import migrations

logging.getLogger().setLevel(logging.INFO)


def handler(event=None, _context=None):
    results = migrations.run_pending((event or {}).get("options"))
    logging.info("migrations applied: %s", results)
    return {"applied": results}


if __name__ == "__main__":
    print(json.dumps(handler(), indent=2, default=str))
