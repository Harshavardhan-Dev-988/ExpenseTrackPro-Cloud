/**
 * The current household (ledger): who's in it, your role, and switching.
 * Provided by HouseholdProvider, which wraps the whole signed-in app and
 * remounts it whenever the household changes, so every data hook reloads
 * for the new one.
 */
import { createContext, useContext } from 'react';
import type { DueItem, LedgerSummary, Me, Member, Preferences, Role } from '../../types';

export interface HouseholdContextValue {
  me: Me;
  ledger: LedgerSummary;
  ledgers: LedgerSummary[];
  role: Role;
  /** Editors and owners can add and change data; viewers only read. */
  canEdit: boolean;
  isOwner: boolean;
  /** Household members (loaded once per household). */
  members: Member[];
  /** More than one member: show who did what, offer splits. */
  isShared: boolean;
  /** Recurring expenses waiting for someone to confirm them. */
  due: DueItem[];
  /** How many recurring expenses were logged automatically on opening. */
  autoLogged: number;
  switchLedger: (id: string) => void;
  refresh: () => Promise<void>;
  reloadMembers: () => Promise<void>;
  refreshDue: () => Promise<void>;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  /** Display name for a split person ref ("m:<userId>" / "n:<name>") or a userId. */
  personName: (refOrUserId: string) => string;
}

export const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used inside <HouseholdProvider>');
  return ctx;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'View only',
};

export const ROLE_HINT: Record<Role, string> = {
  owner: 'Manages members and the household',
  editor: 'Adds, edits and deletes entries',
  viewer: 'Sees everything, changes nothing',
};

export function memberLabel(m: Pick<Member, 'name' | 'email'>): string {
  return m.name || (m.email ? m.email.split('@')[0] : 'Member');
}
