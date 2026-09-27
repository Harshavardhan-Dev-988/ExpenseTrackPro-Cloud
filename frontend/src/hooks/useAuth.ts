/**
 * Auth state for the app, backed by Cognito's Hosted UI (managed login) via
 * Amplify's Auth client. There's no in-app login form — `signIn()` below
 * just redirects to the Hosted UI, and Cognito redirects back to us once
 * the user's done (see `redirectSignIn` in `config/amplify.ts`).
 *
 * `getCurrentUser()` throws when nobody's signed in, so "check auth on load"
 * is a try/catch, not a truthy check. The `Hub` listener picks up the
 * moment the Hosted UI redirect completes (or fails) so we don't have to
 * poll — `signInWithRedirect` resolves before the actual redirect/callback
 * round-trip finishes, so relying on it alone would miss the real state
 * change.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUser,
  signInWithRedirect,
  signOut as amplifySignOut,
  type AuthUser,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refresh = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      setState({ user, isLoading: false, isAuthenticated: true });
    } catch {
      setState({ user: null, isLoading: false, isAuthenticated: false });
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
        case 'signInWithRedirect_failure':
        case 'signedOut':
          setState({ user: null, isLoading: false, isAuthenticated: false });
          break;
      }
    });

    return unsubscribe;
  }, [refresh]);

  const signIn = useCallback(() => signInWithRedirect(), []);

  const signOut = useCallback(() => amplifySignOut(), []);

  return { ...state, signIn, signOut };
}
