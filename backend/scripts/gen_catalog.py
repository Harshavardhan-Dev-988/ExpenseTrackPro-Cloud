"""Regenerate backend/api/catalog.json from the frontend's category list.

The built-in categories and groups are defined once, in
frontend/src/utils/constants.ts. The scheduled jobs (budget alerts, monthly
summary emails) need the same groups and labels, so this script copies them
into a JSON file the API ships with. tests/test_catalog.py fails if the two
drift apart; rerun this script after changing the categories:

    python3 backend/scripts/gen_catalog.py
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONSTANTS = ROOT / "frontend" / "src" / "utils" / "constants.ts"
OUT = ROOT / "backend" / "api" / "catalog.json"


def build() -> dict:
    src = CONSTANTS.read_text(encoding="utf-8")
    groups_src = src[src.index("export const CATEGORY_GROUPS"):]
    groups_src = groups_src[: groups_src.index("];")]
    groups = []
    for block in re.findall(r"\{(.*?)\n  \}", groups_src, re.S):
        gid = re.search(r"id:\s*'([^']+)'", block)
        name = re.search(r"name:\s*'([^']+)'", block)
        cats = re.search(r"categories:\s*\[([^\]]*)\]", block)
        if gid and name and cats:
            groups.append({"id": gid.group(1), "name": name.group(1),
                           "categories": re.findall(r"'([^']+)'", cats.group(1))})
    labels_src = src[src.index("export const CATEGORY_LABELS"):]
    labels_src = labels_src[: labels_src.index("};")]
    labels = dict(re.findall(r"^\s*([a-z0-9_]+):\s*'([^']*)'", labels_src, re.M))
    return {"groups": groups, "labels": labels}


if __name__ == "__main__":
    data = build()
    if "--check" in sys.argv:
        current = json.loads(OUT.read_text(encoding="utf-8"))
        sys.exit(0 if current == data else 1)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(data['groups'])} groups, {len(data['labels'])} labels -> {OUT}")
