/**
 * Top-level gate: nothing that talks to the cloud API mounts until the user
 * is signed in, and the one-time local-data migration has been resolved.
 * Composes `useAuth` (Cognito via Amplify — in-app sign-in, or a Google /
 * Facebook redirect) with `MigrationGate`.
 */
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import SignInScreen from './SignInScreen';
import MigrationGate from './MigrationGate';

interface Props {
  children: ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { user, isLoading, isAuthenticated, authError } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-line border-t-pine animate-spin" />
          <p className="mt-4 text-sm text-slate font-mono">checking your session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <SignInScreen authError={authError} />;
  }

  return <MigrationGate userId={user.userId}>{children}</MigrationGate>;
}
