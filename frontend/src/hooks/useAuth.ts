/**
 * Auth state for the app, backed by Cognito via Amplify's Auth client.
 *
 * Signing in happens either in-app (components/auth/AuthCard — email and
 * password over SRP, sign-up, verification and password reset) or by a
 * redirect straight to Google / Facebook (`signInWithRedirect({ provider })`),
 * which Cognito brokers and then sends back here (see `redirectSignIn` in
 * `config/amplify.ts`).
 *
 * `getCurrentUser()` throws when nobody's signed in, so "check auth on load"
 * is a try/catch, not a truthy check. The `Hub` listener picks up both an
 * in-app sign-in and the moment a redirect completes (or fails), so we don't
 * have to poll.
 */
import { useCallback, useEffect, useState } from 'react';
import { getCurrentUser, signOut as amplifySignOut, type AuthUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Set when a Google/Facebook redirect comes back with an error. */
  authError: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    authError: null,
  });

  const refresh = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      setState({ user, isLoading: false, isAuthenticated: true, authError: null });
    } catch {
      setState((s) => ({ ...s, user: null, isLoading: false, isAuthenticated: false }));
    }
  }, []);

  useEffect(() => {
    refresh();

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
        case 'signedIn':
          refresh();
          break;
        case 'signInWithRedirect_failure': {
          const data = (payload as { data?: { error?: { message?: string } } }).data;
          const message = data?.error?.message;
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            authError: message
              ? `Sign-in with that account didn't complete: ${message}`
              : "Sign-in with that account didn't complete — please try again.",
          });
          break;
        }
        case 'signedOut':
          setState({ user: null, isLoading: false, isAuthenticated: false, authError: null });
          break;
      }
    });

    return unsubscribe;
  }, [refresh]);

  const signOut = useCallback(() => amplifySignOut(), []);

  return { ...state, signOut };
}
