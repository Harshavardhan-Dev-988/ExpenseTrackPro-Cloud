# ExpenseTrack Pro — backend

The FastAPI app (`api/`) and the AWS CDK infrastructure (`cdk/`).

Everything a developer needs — architecture, the five CDK stacks, auth, the full API reference, the DynamoDB key design, WhatsApp/Twilio, local development, testing and deployment — is in the **[root README](../README.md)**:

- [AWS infrastructure (CDK stacks)](../README.md#4-aws-infrastructure-cdk-stacks)
- [Authentication & authorization](../README.md#5-authentication--authorization)
- [API reference](../README.md#6-api-reference)
- [Data model (DynamoDB & S3)](../README.md#7-data-model-dynamodb--s3)
- [WhatsApp logging (Twilio)](../README.md#8-whatsapp-logging-twilio)
- [Run the API locally](../README.md#b-backend-api-locally-no-aws-account-needed)
- [Deployment](../README.md#13-deployment)

Quick start:

```bash
# API locally (needs a local DynamoDB — see the root README)
cd api && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt uvicorn
TABLE_NAME=expense-track-pro-local STAGE=dev uvicorn main:app --reload --port 8000

# Deploy (from cdk/, after `npm i -g aws-cdk` and building ../frontend with `npm run build:aws`)
cd cdk && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cdk diff && cdk deploy --all
```
