// Households (ledgers), members, recurring rules, splits and notifications —
// mirrors backend/api/models.py.

export type Role = 'owner' | 'editor' | 'viewer';

export interface LedgerSummary {
  id: string;
  name: string;
  role: Role;
  ownerId: string;
  isPersonal: boolean;
  memberCount: number;
}

export interface Member {
  userId: string;
  email?: string;
  name?: string;
  role: Role;
  joinedAt?: string;
}

export interface Invite {
  ledgerId: string;
  ledgerName?: string;
  email: string;
  role: Role;
  invitedBy: string;
  invitedByName?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Preferences {
  notifyBudgetAlerts: boolean;
  notifyMonthlySummary: boolean;
  defaultLedgerId?: string;
}

export interface Me {
  userId: string;
  email?: string;
  name?: string;
  defaultLedgerId: string;
  ledgers: LedgerSummary[];
  invites: Invite[];
  preferences: Preferences;
  emailSendingEnabled: boolean;
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringInput {
  description: string;
  amount: number;
  category: string;
  paymentMethod?: string;
  tags?: string[];
  frequency: Frequency;
  dayOfMonth?: number;
  weekday?: number;
  startDate: string; // yyyy-MM-dd
  endDate?: string;
  autoLog: boolean;
  active: boolean;
  paidBy?: string;
}

export interface RecurringRule extends RecurringInput {
  id: string;
  nextDue?: string;
  lastLoggedDue?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DueItem {
  ruleId: string;
  description: string;
  amount: number;
  dates: string[];
}

export interface RecurringRunResult {
  logged: number;
  due: DueItem[];
}

export interface Settlement {
  id: string;
  fromPerson: string;
  toPerson: string;
  amount: number;
  date: string;
  note?: string;
  createdBy?: string;
  createdAt: string;
}

export interface BalancePerson {
  ref: string;
  name: string;
  isMember: boolean;
  net: number;
}

export interface Balances {
  people: BalancePerson[];
  transfers: { fromPerson: string; toPerson: string; amount: number }[];
  splitExpenses: number;
  settlements: Settlement[];
}

export interface EmailPreview {
  kind: string;
  subject: string;
  html: string;
  to?: string[];
  createdAt?: string;
}
