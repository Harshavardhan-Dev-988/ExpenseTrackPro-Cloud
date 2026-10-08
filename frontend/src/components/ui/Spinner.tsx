/** The one spinner used across the app — buttons, toasts, panels. */
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** `paper` for use on filled (pine/ember) buttons. */
  tone?: 'pine' | 'paper';
  className?: string;
  label?: string;
}

const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-8 w-8 border-[3px]' };

export default function Spinner({ size = 'md', tone = 'pine', className = '', label }: SpinnerProps) {
  const colors = tone === 'paper' ? 'border-paper/35 border-t-paper' : 'border-line border-t-pine';
  return (
    <span
      className={`inline-block rounded-full animate-spin shrink-0 ${SIZES[size]} ${colors} ${className}`}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
