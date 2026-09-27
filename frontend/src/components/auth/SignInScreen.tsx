/**
 * Shown when nobody's signed in. There's no in-app email/password form by
 * design (see the phase-2 decision) — the only action is a redirect to the
 * Cognito Hosted UI, which handles sign-up, sign-in and "forgot password"
 * itself.
 */
const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200';

interface Props {
  onSignIn: () => void;
}

export default function SignInScreen({ onSignIn }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="text-center p-8 card-surface max-w-md">
        <h1 className="text-2xl font-display font-semibold text-ink mb-2">ExpenseTrack Pro</h1>
        <p className="text-slate mb-6">
          Sign in to sync your ledger across devices. You'll be taken to a secure sign-in page and
          brought right back.
        </p>
        <button onClick={onSignIn} className={btnPrimary}>
          Sign in / Create account
        </button>
      </div>
    </div>
  );
}
