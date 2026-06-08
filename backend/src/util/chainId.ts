/// Coerce a query/body value to a positive EVM chain id. Accepts a number or a
/// digits-only string; returns null for anything else (negative, fractional,
/// non-numeric, NaN, unsafe-large, arrays/objects) so callers can reject with a
/// 400. Kept dependency-free so both the routes and the unit tests can import it.
export function coerceChainId(value: unknown): number | null {
  const n = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
