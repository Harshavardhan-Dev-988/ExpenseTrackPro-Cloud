import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

interface CountUpProps {
  value: number;
  formatter?: (n: number) => string;
  duration?: number;
  className?: string;
}

/**
 * A number that settles into place rather than just appearing — the small
 * bit of motion that makes the dashboard's headline figures feel alive
 * without being distracting. Jumps straight to the final value when the
 * viewer has reduced motion switched on.
 */
export default function CountUp({ value, formatter = (n) => n.toLocaleString(), duration = 0.9, className }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const prefersReducedMotion = useReducedMotion();
  const previous = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        setDisplay(v);
      },
      onComplete() {
        previous.current = value;
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{formatter(display)}</span>;
}
