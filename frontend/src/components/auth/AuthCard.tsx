/**
 * In-app sign in / create account / verify email / reset password.
 *
 * Replaces the redirect to Cognito's generic hosted page. Cognito still does
 * all the security work — passwords go straight to it over SRP via Amplify
 * (the app never stores them), and Google / Facebook buttons redirect
 * straight to those providers (skipping Cognito's own page entirely).
 *
 * On success Amplify fires a Hub "signedIn" event, which useAuth listens
 * for, and AuthGate swaps this screen for the app.
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  autoSignIn,
  confirmResetPassword,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth';
import Spinner from '../ui/Spinner';

type Mode = 'signIn' | 'signUp' | 'confirm' | 'forgot' | 'reset';

const PASSWORD_RULES: { test: (p: string) => boolean; label: string }[] = [
  { test: (p) => p.length >= 8, label: '8+ characters' },
  { test: (p) => /[a-z]/.test(p), label: 'a lowercase letter' },
  { test: (p) => /[A-Z]/.test(p), label: 'an uppercase letter' },
  { test: (p) => /\d/.test(p), label: 'a number' },
];

function friendlyError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  const message = (err as { message?: string })?.message ?? '';
  switch (name) {
    case 'NotAuthorizedException':
      if (/disabled/i.test(message)) return 'This account has been disabled.';
      if (/attempts exceeded/i.test(message)) return 'Too many attempts — please wait a few minutes and try again.';
      return "That email and password don't match. Check them and try again.";
    case 'UserNotFoundException':
      return "That email and password don't match. Check them and try again.";
    case 'UsernameExistsException':
      return 'An account with this email already exists — sign in instead.';
    case 'InvalidPasswordException':
      return 'That password is too weak — it needs 8+ characters with upper- and lowercase letters and a number.';
    case 'CodeMismatchException':
      return "That code isn't right — check the email and try again.";
    case 'ExpiredCodeException':
      return 'That code has expired — we can send you a new one.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts — please wait a few minutes and try again.';
    case 'InvalidParameterException':
      return /email/i.test(message) ? "That doesn't look like a valid email address." : message || 'Please check the details and try again.';
    case 'NetworkError':
      return "Couldn't reach the server — check your connection.";
    default:
      if (/network|fetch/i.test(message)) return "Couldn't reach the server — check your connection.";
      return message || 'Something went wrong — please try again.';
  }
}

const inputCls =
  'w-full h-12 px-3.5 rounded-xl border border-[#D9DDD6] bg-white text-[15px] text-[#17211D] placeholder:text-[#9AA59F] focus:outline-none focus:border-[#2F4D3F] focus:ring-4 focus:ring-[#2F4D3F]/10 transition';

// A plain <div> with an explicit <label htmlFor>, not a wrapping <label>:
// the "Forgot password?" button sits in the label row, and a wrapping label
// would make it the labelled control (clicking "Password" would open reset).
function Field({
  id,
  label,
  children,
  aside,
}: {
  id: string;
  label: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-[#3D4A44]">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className={`${inputCls} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[#5C6B64] hover:text-[#17211D] hover:bg-[#EEF1EE] transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          {show ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.3 6.3C4.3 7.7 2.7 9.7 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" />
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
              <circle cx="12" cy="12" r="3" strokeWidth={1.8} />
            </>
          )}
        </svg>
      </button>
    </span>
  );
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.label} className={`flex items-center gap-1.5 text-[12px] transition-colors ${ok ? 'text-[#2F4D3F]' : 'text-[#8A958F]'}`}>
            <span
              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] transition-colors ${
                ok ? 'bg-[#2F4D3F] text-white' : 'border border-[#C5CCC6]'
              }`}
              aria-hidden="true"
            >
              {ok ? '✓' : ''}
            </span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 01-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0012 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 010-4.6V6.6h-4a12 12 0 000 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 001.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path fill="#1877F2" d="M24 12a12 12 0 10-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0024 12z" />
      <path fill="#fff" d="M16.7 15.5l.5-3.5h-3.4V9.8c0-1 .5-1.9 2-1.9h1.5v-3s-1.4-.2-2.7-.2c-2.7 0-4.5 1.6-4.5 4.7V12h-3v3.5h3v8.4a12 12 0 003.7 0v-8.4h2.9z" />
    </svg>
  );
}

const HEADINGS: Record<Mode, { title: string; subtitle: string }> = {
  signIn: { title: 'Welcome back', subtitle: 'Sign in to open your ledger.' },
  signUp: { title: 'Create your ledger', subtitle: 'Free, private, and ready in a minute.' },
  confirm: { title: 'Check your email', subtitle: '' },
  forgot: { title: 'Reset your password', subtitle: "Enter your email and we'll send you a reset code." },
  reset: { title: 'Choose a new password', subtitle: '' },
};

interface AuthCardProps {
  initialMode?: 'signIn' | 'signUp';
  /** e.g. a failed Google/Facebook redirect, reported by useAuth. */
  initialError?: string | null;
}

export default function AuthCard({ initialMode = 'signIn', initialError = null }: AuthCardProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'form' | 'google' | 'facebook' | 'resend'>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cameFromSignUp = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const username = email.trim().toLowerCase();
  const passwordOk = PASSWORD_RULES.every((r) => r.test(password));

  const go = (next: Mode, opts: { info?: string | null; keepError?: boolean } = {}) => {
    setMode(next);
    setInfo(opts.info ?? null);
    if (!opts.keepError) setError(null);
    if (next === 'confirm' || next === 'reset') setCode('');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy('form');
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error('Auth error:', err);
      if ((err as { name?: string })?.name === 'UserNotConfirmedException') {
        await resendSignUpCode({ username }).catch(() => undefined);
        go('confirm', { info: `Your email isn't verified yet — we've sent a new code to ${username}.` });
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const doSignIn = async (pw = password) => {
    const out = await signIn({ username, password: pw });
    if (out.isSignedIn) return; // Hub "signedIn" takes it from here.
    switch (out.nextStep.signInStep) {
      case 'CONFIRM_SIGN_UP':
        await resendSignUpCode({ username }).catch(() => undefined);
        go('confirm', { info: `Your email isn't verified yet — we've sent a new code to ${username}.` });
        return;
      case 'RESET_PASSWORD':
        await resetPassword({ username });
        go('reset', { info: `You need to set a new password — we've sent a code to ${username}.` });
        return;
      default:
        throw new Error('This sign-in step isn’t supported here yet. Please contact support.');
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    switch (mode) {
      case 'signIn':
        run(() => doSignIn());
        break;
      case 'signUp':
        if (!passwordOk) {
          setError('Your password needs 8+ characters with upper- and lowercase letters and a number.');
          return;
        }
        run(async () => {
          const out = await signUp({
            username,
            password,
            options: {
              userAttributes: { email: username, ...(name.trim() ? { name: name.trim() } : {}) },
              autoSignIn: true,
            },
          });
          cameFromSignUp.current = true;
          if (out.nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
            await autoSignIn();
            return;
          }
          const dest =
            out.nextStep.signUpStep === 'CONFIRM_SIGN_UP' ? out.nextStep.codeDeliveryDetails?.destination : undefined;
          setCooldown(30);
          go('confirm', { info: `We've sent a 6-digit code to ${dest || username}.` });
        });
        break;
      case 'confirm':
        run(async () => {
          const out = await confirmSignUp({ username, confirmationCode: code.trim() });
          if (out.nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN' && cameFromSignUp.current) {
            await autoSignIn();
            return;
          }
          if (password) {
            await doSignIn();
            return;
          }
          go('signIn', { info: 'Email verified — sign in to continue.' });
        });
        break;
      case 'forgot':
        run(async () => {
          const out = await resetPassword({ username });
          const dest =
            out.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE'
              ? out.nextStep.codeDeliveryDetails?.destination
              : undefined;
          setPassword('');
          setCooldown(30);
          go('reset', { info: `If there's an account for ${username}, a reset code is on its way${dest ? ` to ${dest}` : ''}.` });
        });
        break;
      case 'reset':
        if (!passwordOk) {
          setError('Your new password needs 8+ characters with upper- and lowercase letters and a number.');
          return;
        }
        run(async () => {
          await confirmResetPassword({ username, confirmationCode: code.trim(), newPassword: password });
          await doSignIn();
        });
        break;
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy('resend');
    setError(null);
    try {
      if (mode === 'confirm') await resendSignUpCode({ username });
      else await resetPassword({ username });
      setInfo(`A new code is on its way to ${username}.`);
      setCooldown(30);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const social = async (provider: 'Google' | 'Facebook') => {
    setBusy(provider === 'Google' ? 'google' : 'facebook');
    setError(null);
    try {
      await signInWithRedirect({ provider });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  };

  const heading = HEADINGS[mode];
  const isEntry = mode === 'signIn' || mode === 'signUp';
  const submitLabel: Record<Mode, [string, string]> = {
    signIn: ['Sign in', 'Signing in…'],
    signUp: ['Create account', 'Creating account…'],
    confirm: ['Verify & continue', 'Verifying…'],
    forgot: ['Send reset code', 'Sending…'],
    reset: ['Set password & sign in', 'Saving…'],
  };

  return (
    <div className="relative w-full max-w-[440px] rounded-[22px] bg-[#FBFCFA] text-[#17211D] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.6)_inset] ring-1 ring-black/5 overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-[#2F4D3F] via-[#7AA891] to-[#D6A55C]" aria-hidden="true" />
      <div className="p-6 sm:p-8">
        {isEntry && (
          <div className="relative grid grid-cols-2 p-1 mb-6 rounded-xl bg-[#EEF1EE]" role="tablist" aria-label="Sign in or create account">
            {(['signIn', 'signUp'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => go(m)}
                className={`relative h-10 rounded-[10px] text-sm font-semibold transition-colors ${
                  mode === m ? 'text-[#17211D]' : 'text-[#5C6B64] hover:text-[#17211D]'
                }`}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab"
                    className="absolute inset-0 rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_-4px_rgba(0,0,0,0.12)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{m === 'signIn' ? 'Sign in' : 'Create account'}</span>
              </button>
            ))}
          </div>
        )}

        {!isEntry && (
          <button
            type="button"
            onClick={() => go('signIn')}
            className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#5C6B64] hover:text-[#17211D] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to sign in
          </button>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="font-display text-[26px] leading-tight font-semibold text-[#17211D]">{heading.title}</h2>
            {(heading.subtitle || info) && (
              <p className="mt-1.5 text-[14px] text-[#5C6B64]">{info || heading.subtitle}</p>
            )}

            {isEntry && (
              <>
                <div className="grid grid-cols-2 gap-2.5 mt-6">
                  <button
                    type="button"
                    onClick={() => social('Google')}
                    disabled={!!busy}
                    className="h-12 inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#D9DDD6] bg-white text-[14px] font-semibold text-[#17211D] hover:border-[#9AA59F] hover:shadow-sm active:scale-[0.98] transition disabled:opacity-60"
                  >
                    {busy === 'google' ? <Spinner size="sm" /> : <GoogleIcon />}
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => social('Facebook')}
                    disabled={!!busy}
                    className="h-12 inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#D9DDD6] bg-white text-[14px] font-semibold text-[#17211D] hover:border-[#9AA59F] hover:shadow-sm active:scale-[0.98] transition disabled:opacity-60"
                  >
                    {busy === 'facebook' ? <Spinner size="sm" /> : <FacebookIcon />}
                    Facebook
                  </button>
                </div>
                <div className="flex items-center gap-3 my-5" aria-hidden="true">
                  <span className="flex-1 h-px bg-[#E2E6E0]" />
                  <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#8A958F]">or with email</span>
                  <span className="flex-1 h-px bg-[#E2E6E0]" />
                </div>
              </>
            )}

            <form onSubmit={onSubmit} className={`space-y-4 ${isEntry ? '' : 'mt-6'}`} noValidate={false}>
              {mode === 'signUp' && (
                <Field id="auth-name" label="Your name" aside={<span className="text-[12px] text-[#8A958F]">optional</span>}>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Priya Kumar"
                    className={inputCls}
                  />
                </Field>
              )}

              {(isEntry || mode === 'forgot') && (
                <Field id="auth-email" label="Email">
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    required
                    autoFocus={mode === 'forgot'}
                    className={inputCls}
                  />
                </Field>
              )}

              {(mode === 'confirm' || mode === 'reset') && (
                <Field id="auth-code" label={mode === 'confirm' ? 'Verification code' : 'Reset code'}>
                  <input
                    id="auth-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="••••••"
                    required
                    autoFocus
                    className={`${inputCls} font-mono text-center text-[22px] tracking-[0.5em]`}
                  />
                </Field>
              )}

              {(mode === 'signIn' || mode === 'signUp' || mode === 'reset') && (
                <Field
                  id="auth-password"
                  label={mode === 'reset' ? 'New password' : 'Password'}
                  aside={
                    mode === 'signIn' ? (
                      <button
                        type="button"
                        onClick={() => go('forgot')}
                        className="text-[12.5px] font-medium text-[#2F4D3F] hover:text-[#17211D] transition-colors"
                      >
                        Forgot password?
                      </button>
                    ) : undefined
                  }
                >
                  <PasswordInput
                    id="auth-password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'signIn' ? 'Your password' : 'Create a strong password'}
                  />
                  {mode !== 'signIn' && <PasswordChecklist password={password} />}
                </Field>
              )}

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    role="alert"
                    className="text-[13px] text-[#97381F] bg-[#B3492F]/[0.08] border border-[#B3492F]/20 rounded-xl px-3.5 py-2.5"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={!!busy}
                className="group relative w-full h-12 rounded-xl bg-[#2F4D3F] text-white text-[15px] font-semibold shadow-[0_10px_24px_-10px_rgba(47,77,63,0.8)] hover:bg-[#243C31] active:scale-[0.99] transition disabled:opacity-75 disabled:cursor-wait overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" aria-hidden="true" />
                <span className="relative inline-flex items-center justify-center gap-2">
                  {busy === 'form' && <Spinner size="sm" tone="paper" />}
                  {busy === 'form' ? submitLabel[mode][1] : submitLabel[mode][0]}
                  {busy !== 'form' && isEntry && (
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 7l5 5-5 5M18 12H6" />
                    </svg>
                  )}
                </span>
              </button>

              {(mode === 'confirm' || mode === 'reset') && (
                <p className="text-center text-[13px] text-[#5C6B64]">
                  Didn't get it?{' '}
                  <button
                    type="button"
                    onClick={resend}
                    disabled={cooldown > 0 || !!busy}
                    className="font-semibold text-[#2F4D3F] hover:text-[#17211D] disabled:text-[#8A958F] disabled:cursor-not-allowed transition-colors"
                  >
                    {busy === 'resend' ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                  <span className="block text-[12px] text-[#8A958F] mt-1">Check your spam folder too.</span>
                </p>
              )}
            </form>

            {isEntry && (
              <p className="mt-5 text-center text-[13px] text-[#5C6B64]">
                {mode === 'signIn' ? 'New here? ' : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => go(mode === 'signIn' ? 'signUp' : 'signIn')}
                  className="font-semibold text-[#2F4D3F] hover:text-[#17211D] transition-colors"
                >
                  {mode === 'signIn' ? 'Create a free account' : 'Sign in'}
                </button>
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="px-6 sm:px-8 py-3.5 bg-[#F3F5F2] border-t border-[#E6EAE4] flex items-center justify-center gap-2 text-[12px] text-[#6B7872]">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Sign-in secured by AWS Cognito
      </div>
    </div>
  );
}
