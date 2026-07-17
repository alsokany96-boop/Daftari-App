// Western-numeral formatters used across the app.
// Never uses locale "ar" so numbers always render as 1,234.56 style.

export function fmtAmount(n: number, options?: { fraction?: number }): string {
  const fraction = options?.fraction ?? 2;
  const rounded = Math.round(n * Math.pow(10, fraction)) / Math.pow(10, fraction);
  return rounded.toLocaleString("en-US", {
    maximumFractionDigits: fraction,
    minimumFractionDigits: 0,
    useGrouping: true,
  });
}

export function fmtInt(n: number): string {
  return Math.trunc(n).toLocaleString("en-US", { useGrouping: true });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return "";
  }
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch {
    return "";
  }
}
