# ExpenseTrack Pro — frontend

React 19 + TypeScript + Vite single-page app, hosted on S3 + CloudFront, talking to the API on AWS Lambda and to Cognito via Amplify.

See the **[root README](../README.md)** for the full picture, in particular:

- [Tech stack](../README.md#1-tech-stack) and [frontend architecture](../README.md#9-frontend-architecture) (boot sequence, hooks, services, period logic, design system)
- [Authentication](../README.md#5-authentication--authorization) (in-app sign-in, Google/Facebook)
- [Local development](../README.md#a-frontend-against-the-deployed-dev-backend-most-common) and [testing](../README.md#12-testing)
- [Deployment](../README.md#13-deployment)

Quick start:

```bash
npm install
npm run dev:aws      # http://localhost:5173/ against the deployed dev API
npm run build:aws    # production build into dist-aws/ (what CloudFront serves)
```

Sample data: `sample-backup-2-years.json` (import via ☰ → Backup & restore) and `sample-expenses*.csv` / `sample-expenses.json` (import via ☰ → Import expenses).
