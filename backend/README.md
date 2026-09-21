# ExpenseTrack Pro — cloud backend (phase 1)

This is the AWS backend from the [Cloud & WhatsApp Roadmap](https://claude.ai/code/artifact/b396d696-66e3-46c5-b2be-a974275e81b5) doc, phase 1: the foundations — Cognito, DynamoDB, S3, API Gateway, and a FastAPI app that runs on Lambda. The existing React frontend (`../src`) doesn't call this yet — that wiring is phase 2. Right now this is a backend you can stand up and test on its own.

```
backend/
  api/            FastAPI app — the code that actually runs
    main.py         app + routers
    models.py        request/response shapes (mirrors types/index.ts)
    db.py             DynamoDB access
    lambda_handler.py   Lambda entrypoint (Mangum-wrapped FastAPI)
    dependencies/auth.py  pulls the signed-in userId off the verified request
    routers/          expenses, settings, savings, health
  cdk/            Infrastructure — what to build on AWS
    app.py            entrypoint, wires the 3 stacks together
    stacks/
      auth_stack.py     Cognito User Pool
      data_stack.py     DynamoDB table + S3 receipts bucket
      api_stack.py      Lambda + HTTP API + Cognito authorizer
```

## 1. AWS account

If you don't have an AWS account yet:

1. Go to [aws.amazon.com](https://aws.amazon.com) and click **Create an AWS account**. You'll need an email, a card for billing (this stack runs well within the free tier — see the roadmap doc's "Costs" section), and phone verification.
2. Once you're in, turn on MFA on the **root** account (IAM → Security credentials) and then stop using the root login day-to-day.
3. Create an IAM user for yourself (IAM → Users → Create user) with **AdministratorAccess** attached for now — tightening this to a least-privilege policy is worth doing later, not before the first deploy.
4. Generate an access key for that user (IAM → Users → your user → Security credentials → Create access key → "Command Line Interface (CLI)").
5. Install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), then run `aws configure` and paste in that access key, secret key, and a default region (`ap-south-1` is what the code here defaults to — Mumbai; change it in `cdk/app.py` if you'd rather use a different region).

## 2. Install the CDK CLI

```bash
npm install -g aws-cdk
cdk --version
```

This only needs to happen once per machine. The CDK app itself (`cdk/`) is Python; the `cdk` command is a thin Node wrapper that shells out to it.

## 3. Run the API locally (no AWS needed yet)

```bash
cd backend/api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

There's no Cognito in front of it locally, so `dependencies/auth.py` accepts a stand-in header instead — every request needs `X-Local-User-Id: <anything>` to act as a signed-in user:

```bash
curl http://localhost:8000/health
curl -H "X-Local-User-Id: test-user" http://localhost:8000/expenses
curl -X POST -H "X-Local-User-Id: test-user" -H "Content-Type: application/json" \
  -d '{"date":"2026-09-21T00:00:00Z","amount":250,"category":"grocery","description":"Weekly groceries"}' \
  http://localhost:8000/expenses
```

Interactive API docs are at `http://localhost:8000/docs` once it's running.

## 4. Deploy to AWS

```bash
cd backend/cdk
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cdk bootstrap        # once per AWS account/region
cdk deploy --all
```

`PythonFunction` (the construct that packages the FastAPI Lambda) uses Docker to install dependencies in a Lambda-compatible environment by default. If Docker Desktop isn't running, either start it or add `bundling: { forceDockerBundling: false }`-equivalent local bundling — ask me if you hit this and I'll wire up local bundling instead.

`cdk deploy` prints outputs when it finishes: `UserPoolId`, `UserPoolClientId`, `HostedUiDomainUrl`, `TableName`, `ReceiptsBucketName`, `ApiUrl`. Save those — phase 2 wires the frontend up to them.

## What's deliberately not here yet

- The frontend doesn't call this API at all yet (`useExpenses`/`useSettings` still talk to IndexedDB) — that's phase 2.
- Google/Facebook sign-in — phase 3. The Cognito User Pool and hosted UI domain are already in place for it; adding a provider is additive, no redeploy-breaking changes needed.
- The WhatsApp webhook route — phase 4. The DynamoDB table already has a key pattern reserved for phone-number → user lookups (see the comment atop `cdk/stacks/data_stack.py`).
- Receipt upload endpoints (presigned S3 URLs) — the "Hardening" phase. The bucket exists; the routes that hand out upload URLs don't yet.
