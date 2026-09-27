/**
 * Configures the Amplify Auth client to talk to our existing, CDK-provisioned
 * Cognito User Pool (NOT an Amplify Gen2 backend — there is no `amplify/`
 * folder and nothing here is managed by `ampx`).
 *
 * Sign-in happens entirely through the Cognito Hosted UI (managed login) via
 * the OAuth authorization-code + PKCE flow — see `hooks/useAuth.ts`.
 *
 * Values below match what's actually deployed (see `backend/cdk/stacks/
 * auth_stack.py`). If the User Pool, app client, or Hosted UI domain are ever
 * recreated (not just updated) by CDK, these need to be updated to match.
 */
import { Amplify } from 'aws-amplify';

const CLOUDFRONT_URL = 'https://d3bttra9tv41h7.cloudfront.net/';
const LOCAL_DEV_URLS = ['http://localhost:5173/', 'http://localhost:5193/'];

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'ap-southeast-2_f6zD79Um0',
      userPoolClientId: '4m6v1tcrennnmftkvvhvkbilnv',
      loginWith: {
        oauth: {
          domain: 'expense-track-pro-dev.auth.ap-southeast-2.amazoncognito.com',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [CLOUDFRONT_URL, ...LOCAL_DEV_URLS],
          redirectSignOut: [CLOUDFRONT_URL, ...LOCAL_DEV_URLS],
          responseType: 'code',
        },
      },
    },
  },
});
