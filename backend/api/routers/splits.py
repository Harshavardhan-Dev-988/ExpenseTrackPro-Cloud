"""Split expenses: who owes whom, and settling up.

A split expense says who paid (paidBy) and each person's share. Balances are
computed from the sparse GSI1 index LEDGER#<lid>#SPLIT, which holds only
split expenses, plus settlement records (SETTLE#<id>) — so the cost grows
with the number of shared bills, not with the whole ledger.

net(person) = paid for others − owed to others ± settlements.
Positive: others owe them. Negative: they owe others.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException

import db
import keys as K
from dependencies.ledger import LedgerCtx, editor, reader
from models import BalancePerson, Balances, Settlement, SettlementCreate, Transfer
from services import ledgers as L

router = APIRouter(prefix="/splits", tags=["splits"])


def _valid_ref(ref: str) -> bool:
    return (ref.startswith("m:") or ref.startswith("n:")) and len(ref) > 2


def compute(ledger_id: str):
    expenses = db.query_index(db.GSI1, K.splits_gsi(ledger_id))
    settlements = [db.public(s) for s in db.query(K.ledger_pk(ledger_id), K.SETTLEMENT)]
    net: Dict[str, float] = defaultdict(float)
    for e in expenses:
        split = e.get("split") or {}
        payer = e.get("paidBy")
        if not payer:
            continue
        for share in split.get("shares", []):
            amount = float(share["amount"])
            if share["person"] == payer:
                continue
            net[payer] += amount
            net[share["person"]] -= amount
    for s in settlements:
        amount = float(s["amount"])
        net[s["fromPerson"]] += amount
        net[s["toPerson"]] -= amount
    return {k: round(v, 2) for k, v in net.items()}, len(expenses), settlements


def simplify(net: Dict[str, float]) -> List[Transfer]:
    """Fewest-ish transfers: repeatedly match the biggest debtor with the
    biggest creditor."""
    debtors = sorted(([p, -v] for p, v in net.items() if v < -0.009), key=lambda x: -x[1])
    creditors = sorted(([p, v] for p, v in net.items() if v > 0.009), key=lambda x: -x[1])
    out: List[Transfer] = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        pay = min(debtors[i][1], creditors[j][1])
        out.append(Transfer(fromPerson=debtors[i][0], toPerson=creditors[j][0], amount=round(pay, 2)))
        debtors[i][1] -= pay
        creditors[j][1] -= pay
        if debtors[i][1] < 0.01:
            i += 1
        if creditors[j][1] < 0.01:
            j += 1
    return out


def person_name(ref: str, names: Dict[str, str]) -> str:
    if ref.startswith("m:"):
        return names.get(ref[2:], "Former member")
    return ref[2:]


@router.get("/balances", response_model=Balances)
def balances(ctx: LedgerCtx = Depends(reader)):
    net, count, settlements = compute(ctx.ledger_id)
    names = L.member_names(ctx.ledger_id)
    people = [
        BalancePerson(ref=ref, name=person_name(ref, names), isMember=ref.startswith("m:"), net=amount)
        for ref, amount in sorted(net.items(), key=lambda kv: -kv[1])
        if abs(amount) >= 0.01
    ]
    settlements.sort(key=lambda s: str(s.get("date")), reverse=True)
    return Balances(
        people=people,
        transfers=simplify(net),
        splitExpenses=count,
        settlements=[Settlement(**s) for s in settlements[:50]],
    )


@router.post("/settlements", response_model=Settlement, status_code=201)
def settle(payload: SettlementCreate, ctx: LedgerCtx = Depends(editor)):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    if payload.fromPerson == payload.toPerson or not (_valid_ref(payload.fromPerson) and _valid_ref(payload.toPerson)):
        raise HTTPException(status_code=400, detail="Pick two different people")
    record = {
        "id": uuid.uuid4().hex[:12],
        **payload.model_dump(mode="json"),
        "createdBy": ctx.user_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    record = {k: v for k, v in record.items() if v is not None}
    db.put_item(db.stamp({"PK": ctx.pk, "SK": f"{K.SETTLEMENT}{record['id']}", **record}, K.T_SETTLEMENT))
    return Settlement(**record)


@router.delete("/settlements/{settlement_id}", status_code=204)
def undo_settlement(settlement_id: str, ctx: LedgerCtx = Depends(editor)):
    if not db.get_item(ctx.pk, f"{K.SETTLEMENT}{settlement_id}"):
        raise HTTPException(status_code=404, detail="Settlement not found")
    db.delete_item(ctx.pk, f"{K.SETTLEMENT}{settlement_id}")
