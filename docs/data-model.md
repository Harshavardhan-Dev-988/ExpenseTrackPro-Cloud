# Data model (schema v2)

ExpenseTrack Pro stores everything in one DynamoDB table,
`expense-track-pro-v2-<stage>`, with two secondary indexes. This page explains
how the table is laid out, why, and how to change it safely. The key builders
live in [`backend/api/keys.py`](../backend/api/keys.py); nothing else in the
backend writes a raw key string.

## The idea: data belongs to a household

In schema v1 every item lived under `USER#<sub>`, so data could never be
shared. In v2 the unit of ownership is a **ledger** (shown in the app as a
*household*). A user's own data is simply their first, personal ledger.
Inviting a family member adds a `MEMBER` item to the ledger; nothing moves.

```
LEDGER#<lid>
 ├─ META              name, owner, created               (GSI1: LEDGERS / <lid>)
 ├─ MEMBER#<sub>      role: owner | editor | viewer      (GSI1: USER#<sub> / LEDGER#<lid>)
 ├─ INVITE#<email>    pending invite, 14-day ttl         (GSI1: INVITE#<email> / LEDGER#<lid>)
 ├─ SETTINGS          currency, yearStart
 ├─ EXP#<id>          expense                            (GSI2: LEDGER#<lid>#EXP / <date>#<id>)
 │                                                       (GSI1: LEDGER#<lid>#SPLIT / <date>#<id>, only if split)
 ├─ BUDGET#<key>      category id or group:<groupId>
 ├─ SAVE#<id>         savings entry                      (GSI2: LEDGER#<lid>#SAVE / <date>#<id>)
 ├─ GOAL#<id>         savings goal
 ├─ CATGROUP#<id>     custom category group
 ├─ CATEGORY#<id>     custom category
 ├─ RECUR#<id>        recurring rule                     (GSI1: DUE#<yyyy-mm> / <nextDue>#<lid>#<id>, while active)
 ├─ SETTLE#<id>       split settlement
 ├─ SENT#<marker>     "already emailed", 400-day ttl
 └─ OUTBOX#<ts>#<id>  email built while sending is off, 30-day ttl

USER#<sub>
 ├─ PROFILE           email, name, theme, date format, default household, email preferences
 └─ WHATSAPP          linked phone number
PHONE#<+e164> / LINK  which user a WhatsApp number belongs to
LINKCODE#<code> / PENDING   one-time WhatsApp link code, 15-minute ttl
SYSTEM / MIGRATION#<nnn>    data migrations already applied
```

Every item also carries `type` (the entity, e.g. `Expense`) and `v` (the
schema version it was written with), so a migration can find exactly what it
needs to upgrade.

## Access patterns

| Need | How | Cost |
|---|---|---|
| A household's expenses (all) | `Query PK=LEDGER#<lid>, SK begins_with EXP#` | one partition |
| Expenses in a date range | `Query GSI2 PK=LEDGER#<lid>#EXP, SK between <from> and <to>#￿` | only that range |
| Budgets / goals / categories / rules | `Query PK=LEDGER#<lid>, SK begins_with <prefix>` | one partition |
| Am I a member, with which role? | `GetItem LEDGER#<lid> / MEMBER#<sub>` | 1 read per request |
| Which households am I in? | `Query GSI1 PK=USER#<sub>` | one partition |
| Invites for my email | `Query GSI1 PK=INVITE#<email>` | one partition |
| Recurring rules due today (all households) | `Query GSI1 PK=DUE#<this month>, SK <= <today>#￿` (+ last month) | only what's due |
| Split balances | `Query GSI1 PK=LEDGER#<lid>#SPLIT` + `SETTLE#` items | only shared bills |
| Every household (scheduled jobs) | `Query GSI1 PK=LEDGERS` | one partition |
| Who sent this WhatsApp message? | `GetItem PHONE#<number> / LINK` | 1 read |

There are no scans anywhere in request paths. The only scan is the one-off
v1 → v2 migration.

### Why these choices

- **Base key `EXP#<id>`, date in GSI2.** Edits and deletes address an expense
  by id alone, and changing its date is an in-place update; the date index
  still gives cheap range reads. Putting the date in the base sort key would
  make every date change a delete-plus-insert.
- **Two overloaded GSIs instead of one per pattern.** DynamoDB charges per
  index write; overloading keeps it to at most two extra writes per item, and
  only items that need a lookup set the index attributes (sparse indexes).
- **Monthly `DUE#` partitions.** The daily job reads only rules due now, and no
  single partition grows forever.
- **A member check on every request.** One `GetItem` (well under a
  millisecond, fractions of a paisa) is what makes sharing safe: the ledger id
  comes from the client (`X-Ledger-Id`) and is never trusted on its own.

## Roles

| | viewer | editor | owner |
|---|:-:|:-:|:-:|
| See everything in the household | ✓ | ✓ | ✓ |
| Own theme, date format, email preferences | ✓ | ✓ | ✓ |
| Add, edit, delete expenses, budgets, savings, categories, recurring rules, settlements | | ✓ | ✓ |
| Change currency / financial year | | ✓ | ✓ |
| Invite, change roles, remove members, rename, delete the household | | | ✓ |

Every route declares the access it needs (`Depends(reader | editor | owner)`
in [`dependencies/ledger.py`](../backend/api/dependencies/ledger.py)).

## Changing the schema: migrations

Data migrations live in [`backend/api/migrations/`](../backend/api/migrations/),
one module per change (`m001_user_to_ledger.py`, `m002_…`). Each has an `ID`, a
`DESCRIPTION` and a `run(options)` function returning counts.

- After every deploy of the Api stack, a CDK **Trigger** runs
  `migrate_handler.py`, which applies any migration not yet recorded under
  `SYSTEM / MIGRATION#<id>` — exactly once per table, in order.
- Write migrations to be safe to re-run: a failed run isn't recorded, so it
  runs again in full next time — possibly after users changed data in v2. So
  write conditionally (only if absent), never overwrite. A migration that
  can't run (e.g. no source table configured) raises instead of being
  recorded as done.
- Change single attributes with `db.update_fields` rather than re-putting a
  whole item read earlier, so concurrent edits aren't lost.
- Prefer additive changes: new attributes with defaults in the Pydantic
  models need no migration at all. Use `type`/`v` to find items to rewrite.
- A change to key design (like v1 → v2) gets a **new table**: the old one is
  kept read-only and retained, so rolling back is pointing `TABLE_NAME` back.

### v1 → v2 (migration 001)

Copies every `USER#<sub>` item into that user's personal ledger
(deterministic id, `uuid5` of the sub, the same one first sign-in creates),
splits settings into ledger settings and the personal profile, and moves the
WhatsApp link items. Receipts keep their old S3 keys
(`receipts/<sub>/…`); the ledger's META remembers that prefix
(`legacyReceiptPrefix`) so household members can still view them. New
receipts go under `receipts/<lid>/`.

The v1 table `expense-track-pro-<stage>` stays (retained, no longer written)
until v2 has been verified in every stage; remove it in a later release.

## Is one table the right call?

Yes, for this app's access patterns — with a clear trade-off.

- **Scaling:** DynamoDB scales per partition key, not per table; more tables
  would add no capacity. Households are small, independent partitions. One
  table keeps transactions across entity types (ownership handover), IAM,
  backups and alarms simple.
- **Querying:** every pattern the app needs is designed into the keys and
  costs one partition read. Unplanned questions (cross-household analytics,
  "spend by city") need a new GSI or a scan, and there is no server-side
  aggregation; totals are computed in the browser.
- **If that changes:** for analytics, add DynamoDB export to S3 and query it
  with Athena (no load on the live table). Move to PostgreSQL only if
  server-side reporting, rich filtering or full-text search becomes a core
  feature.

### Known limits and their fixes

| Limit | When it matters | Fix |
|---|---|---|
| `GSI1PK = LEDGERS` lists every household under one key; scheduled jobs walk it sequentially | ~100k+ households | Write `LEDGERS#<0..N>` (hash of lid) and fan the jobs out per shard; migrate existing META items |
| App loads a household's whole expense list | ~10k+ entries in one household | Page by period with `GET /expenses?start=&end=` (GSI2 exists) |
| `DUE#<yyyy-mm>` holds every active rule due that month | very large rule counts | Suffix by day or shard |

## Scale notes

- On-demand capacity: no sizing; idle stages cost nothing.
- A household's expenses are one partition. DynamoDB partitions handle
  ~1,000 writes/s and 3,000 reads/s; a family writes a few a day.
- The app still loads a household's whole expense list (simple, fast at
  personal-finance volumes). The date-range API (`GET /expenses?start=&end=`)
  is ready for paging by period when a household grows to tens of thousands
  of entries.
- Bulk writes (`POST /expenses/batch`, 100 per call; `batch-delete`, 500)
  use `BatchWriteItem`: a 1,500-entry restore is ~15 calls instead of 1,500.
- Point-in-time recovery is on for the v2 table in every stage.
