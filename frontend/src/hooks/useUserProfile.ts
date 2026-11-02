/**
 * Who's signed in, read from the Cognito ID token's claims.
 *
 * The ID token already carries everything the account panel shows (email,
 * name, which provider they came through, when they signed in), and reading
 * it works the same for email, Google and Facebook users. Asking Cognito's
 * GetUser API instead would fail for Google/Facebook sign-ins, whose access
 * token doesn't carry the `aws.cognito.signin.user.admin` scope.
 */
import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

export type SignInMethod = 'email' | 'google' | 'facebook' | 'other';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  /** Name if Cognito has one, otherwise the email's local part, title-cased. */
  displayName: string;
  initials: string;
  emailVerified: boolean;
  method: SignInMethod;
  /** When this session's sign-in happened. */
  signedInAt?: Date;
  /** When a Google/Facebook identity was first linked (not known for email accounts). */
  linkedAt?: Date;
}

interface IdentityClaim {
  providerName?: string;
  dateCreated?: string | number;
}

function titleCase(s: string) {
  return s
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function profileFromClaims(claims: Record<string, unknown>): UserProfile {
  const email = String(claims.email ?? '');
  const name = String(claims.name ?? '').trim();
  const displayName = name || titleCase(email.split('@')[0] || 'You') || 'You';
  const parts = displayName.split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '₹';

  let method: SignInMethod = 'email';
  let linkedAt: Date | undefined;
  let identities: unknown = claims.identities;
  if (typeof identities === 'string') {
    try {
      identities = JSON.parse(identities);
    } catch {
      identities = undefined;
    }
  }
  if (Array.isArray(identities) && identities.length) {
    const first = identities[0] as IdentityClaim;
    const provider = (first.providerName ?? '').toLowerCase();
    method = provider === 'google' ? 'google' : provider === 'facebook' ? 'facebook' : 'other';
    if (first.dateCreated) linkedAt = new Date(Number(first.dateCreated));
  }

  const authTime = Number(claims.auth_time ?? claims.iat);
  return {
    userId: String(claims.sub ?? ''),
    email,
    name,
    displayName,
    initials,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true' || method !== 'email',
    method,
    signedInAt: Number.isFinite(authTime) && authTime > 0 ? new Date(authTime * 1000) : undefined,
    linkedAt: linkedAt && !Number.isNaN(linkedAt.getTime()) ? linkedAt : undefined,
  };
}

export function useUserProfile(): UserProfile | null {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAuthSession()
      .then((session) => {
        const claims = session.tokens?.idToken?.payload as Record<string, unknown> | undefined;
        if (!cancelled && claims) setProfile(profileFromClaims(claims));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return profile;
}
