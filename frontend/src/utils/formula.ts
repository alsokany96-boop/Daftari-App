// Safe arithmetic formula evaluator for the amount input.
// Accepts digits, `.`, `+`, `-`, `*`, `/`, `(`, `)`, and whitespace only.
// Rejects any expression containing anything else — no identifiers, no strings, no code injection possible.

const SAFE_RE = /^[\d+\-*/.()\s]+$/;

export function isFormula(expr: string): boolean {
  if (!expr) return false;
  return /[+\-*/]/.test(expr) && /\d/.test(expr);
}

/**
 * Safely evaluate an arithmetic expression. Returns null if the expression
 * is invalid, unsafe, produces NaN/Infinity, or fails to parse.
 */
export function evaluateFormula(expr: string): number | null {
  if (!expr) return null;
  const trimmed = expr.replace(/\s+/g, "").replace(/,/g, ".");
  if (!trimmed) return null;
  if (!SAFE_RE.test(trimmed)) return null;
  // Reject dangling operators (e.g. "12+" while typing) — return null so we can show partial.
  if (/[+\-*/.]$/.test(trimmed)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${trimmed});`)();
    if (typeof value !== "number" || !isFinite(value)) return null;
    return Math.round(value * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Returns the final numeric value from the input string.
 * If it's a plain number, returns it directly. If it's a formula, evaluates.
 * Returns null if invalid.
 */
export function resolveAmount(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/,/g, ".");
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return evaluateFormula(trimmed);
}
