// Audit sampling — deterministic, no backend: the same delivery_no flags AUDIT
// identically on every device (Scan banner, Digital PL picker, LiveBoard).
// Packing math untouched; this only decides which PLs get extra checklist attention.
export const AUDIT_EVERY = 10;

export function isAuditSample(deliveryNo: string): boolean {
  const s = String(deliveryNo || "");
  if (!s) return false;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return h % AUDIT_EVERY === 0;
}
