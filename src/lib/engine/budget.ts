import type { BudgetCategory, BudgetLine, Participant } from "../domain/types";

/**
 * Money is summed in integer cents (minor units × 100) to avoid floating-point drift,
 * then converted back. Currency conversion uses an explicit rate table with a source
 * and retrieval time; lines whose currency has no rate are excluded from totals and
 * reported, never silently converted 1:1.
 */

export interface RateTable {
  base: string; // e.g. "EUR"
  rates: Record<string, number>; // units of currency per 1 base
  source: string;
  retrievedAt: string; // ISO
  /** Date the provider says the rates are for. */
  asOf?: string;
}

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

/** Convert `amount` from one currency to another. Returns null if a rate is missing. */
export function convert(amount: number, from: string, to: string, table?: RateTable | null): number | null {
  if (from === to) return amount;
  if (!table) return null;
  const rFrom = from === table.base ? 1 : table.rates[from];
  const rTo = to === table.base ? 1 : table.rates[to];
  if (!rFrom || !rTo) return null;
  return (amount / rFrom) * rTo;
}

export interface BudgetSummary {
  currency: string;
  people: number;
  estimatedTotal: number;
  actualTotal: number;
  estimatedPerPerson: number;
  actualPerPerson: number;
  estimatedPerDay: number | null;
  byCategory: { category: BudgetCategory; estimated: number; actual: number }[];
  /** Portion of the estimate backed by user/official/provider figures vs AI/estimates. */
  verifiedEstimate: number;
  unverifiedEstimate: number;
  unestimatedLines: string[];
  unconvertibleLines: string[];
  budgetMaxGroup: number | null;
  remainingAgainstEstimate: number | null;
  remainingAgainstActual: number | null;
  overBudget: boolean;
  /** Positive = is owed money, negative = owes money (actual spend, equal split). */
  balances: { participantId: string; name: string; paid: number; share: number; balance: number }[];
  settlements: { from: string; to: string; amount: number }[];
  conversionNote: string | null;
}

export function summariseBudget(params: {
  lines: BudgetLine[];
  participants: Participant[];
  days: number;
  currency: string;
  budgetMax?: number | null;
  budgetBasis: "group" | "per_person";
  rates?: RateTable | null;
}): BudgetSummary {
  const { lines, participants, days, currency, budgetMax, budgetBasis, rates } = params;
  const people = Math.max(1, participants.length);
  let estC = 0,
    actC = 0,
    verC = 0,
    unverC = 0;
  const cat = new Map<BudgetCategory, { e: number; a: number }>();
  const unestimated: string[] = [];
  const unconvertible: string[] = [];
  const paid = new Map<string, number>();
  let usedConversion = false;

  for (const line of lines) {
    const mult = line.basis === "per_person" ? people : 1;
    const conv = (n: number) => {
      const c = convert(n, line.currency, currency, rates);
      if (c != null && line.currency !== currency) usedConversion = true;
      return c;
    };
    const entry = cat.get(line.category) ?? { e: 0, a: 0 };

    if (line.estimate == null) {
      unestimated.push(line.label);
    } else {
      const v = conv(line.estimate);
      if (v == null) unconvertible.push(line.label);
      else {
        const c = toCents(v) * mult;
        estC += c;
        entry.e += c;
        const k = line.provenance.kind;
        if (k === "user" || k === "official" || k === "third_party") verC += c;
        else unverC += c;
      }
    }
    if (line.actual != null) {
      const v = conv(line.actual);
      if (v == null) {
        if (!unconvertible.includes(line.label)) unconvertible.push(line.label);
      } else {
        const c = toCents(v) * mult;
        actC += c;
        entry.a += c;
        if (line.paidBy) paid.set(line.paidBy, (paid.get(line.paidBy) ?? 0) + c);
      }
    }
    cat.set(line.category, entry);
  }

  const maxGroup = budgetMax == null ? null : budgetBasis === "per_person" ? budgetMax * people : budgetMax;
  const maxC = maxGroup == null ? null : toCents(maxGroup);

  // Equal-share balances on actual spend. Distribute remainder cents deterministically.
  const shareBase = Math.floor(actC / people);
  let remainder = actC - shareBase * people;
  const balances = participants.map((p) => {
    const share = shareBase + (remainder-- > 0 ? 1 : 0);
    const pd = paid.get(p.id) ?? 0;
    return { participantId: p.id, name: p.name, paid: fromCents(pd), share: fromCents(share), balanceC: pd - share };
  });

  // Greedy settlement: debtors pay creditors.
  const creditors = balances.filter((b) => b.balanceC > 0).map((b) => ({ id: b.participantId, c: b.balanceC }));
  const debtors = balances.filter((b) => b.balanceC < 0).map((b) => ({ id: b.participantId, c: -b.balanceC }));
  const settlements: { from: string; to: string; amount: number }[] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].c, creditors[j].c);
    if (amt > 0) settlements.push({ from: debtors[i].id, to: creditors[j].id, amount: fromCents(amt) });
    debtors[i].c -= amt;
    creditors[j].c -= amt;
    if (debtors[i].c === 0) i++;
    if (creditors[j].c === 0) j++;
  }

  return {
    currency,
    people,
    estimatedTotal: fromCents(estC),
    actualTotal: fromCents(actC),
    estimatedPerPerson: fromCents(Math.round(estC / people)),
    actualPerPerson: fromCents(Math.round(actC / people)),
    estimatedPerDay: days > 0 ? fromCents(Math.round(estC / days)) : null,
    byCategory: [...cat.entries()]
      .map(([category, v]) => ({ category, estimated: fromCents(v.e), actual: fromCents(v.a) }))
      .filter((c) => c.estimated !== 0 || c.actual !== 0)
      .sort((a, b) => b.estimated - a.estimated),
    verifiedEstimate: fromCents(verC),
    unverifiedEstimate: fromCents(unverC),
    unestimatedLines: unestimated,
    unconvertibleLines: unconvertible,
    budgetMaxGroup: maxGroup,
    remainingAgainstEstimate: maxC == null ? null : fromCents(maxC - estC),
    remainingAgainstActual: maxC == null ? null : fromCents(maxC - actC),
    overBudget: maxC != null && estC > maxC,
    balances: balances.map(({ balanceC, ...b }) => ({ ...b, balance: fromCents(balanceC) })),
    settlements,
    conversionNote:
      usedConversion && rates
        ? `Converted using ${rates.source} rates${rates.asOf ? ` for ${rates.asOf}` : ""}, retrieved ${rates.retrievedAt}.`
        : null,
  };
}

export function formatMoney(amount: number | null | undefined, currency: string, locale?: string): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
