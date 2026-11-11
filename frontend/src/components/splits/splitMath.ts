import type { Split } from '../../types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Equal shares that add up exactly (the paisa remainder goes to the first people). */
export function equalShares(amount: number, people: string[]): Split {
  if (!people.length) return { shares: [] };
  const paise = Math.round(amount * 100);
  const base = Math.floor(paise / people.length);
  const extra = paise - base * people.length;
  return { shares: people.map((person, i) => ({ person, amount: (base + (i < extra ? 1 : 0)) / 100 })) };
}

export function splitTotal(split?: Split): number {
  return round2((split?.shares ?? []).reduce((s, x) => s + x.amount, 0));
}
