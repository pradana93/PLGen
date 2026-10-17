// Dashboard v2 (Phase 3) — document quantity → packing quantity.
//
// The rule below is Dashboard v1's, verified per SKU against delivered v1 packing
// lists generated from the same documents (PL/BBB|BBT/16102026/001…006):
//   • the multiplier table matches the resolved SKU name EXACTLY — the four plain
//     names below. "(BBT)"-named SKUs (what the IT file resolves to by kode) keep
//     the document quantity, exactly as v1 printed them.
//   • "DUS-20" is a Satuan, not a multiplier — v1 applies no DUS-n conversion.
//   • "Dus …" lines that are NOT Master Data SKUs are packaging material and are
//     ignored, while a real SKU such as "Dus Hampers" is kept
//
// Pure functions only. NOT imported by Dashboard v1, scanner.ts, packing.ts or the
// exporters — the core packing math is untouched.

import type { GroupItem, MergedGroup } from "./groupScan";
import type { Order } from "./packing";

// Exactly the names Dashboard v1 multiplies after a scan (packages → pieces).
// No "(BBT)" wording on purpose: v1's PLs leave every BBT line at ×1.
const MULTIPLIERS: Record<string, number> = {
  "BEEF PATTY SMALL": 18,
  "BEEF PATTY LARGE": 18,
  "THOUSAND ISLAND MAYONAISE": 20,
  "BUTTER": 40,
};

export function itemMultiplier(sku: string): number {
  return MULTIPLIERS[String(sku || "").trim().toUpperCase()] ?? 1;
}

export type QtyBreakdown = { sku: string; raw: number; packMult: number; qty: number };

/** Effective packing quantity for one document line, or null when it has no SKU. */
export function breakdownFor(it: GroupItem): QtyBreakdown | null {
  if (!it.sku) return null;
  const raw = it.qty ?? 0;
  const packMult = itemMultiplier(it.sku);
  return { sku: it.sku, raw, packMult, qty: raw * packMult };
}

export type GroupPlan = {
  order: Order;
  lines: QtyBreakdown[];
  skipped: GroupItem[];     // unresolved packaging lines — ignored (Phase 3 decision)
  unresolved: GroupItem[];  // unresolved non-packaging lines — cannot be packed
  missingQty: GroupItem[];  // resolvable lines with no quantity (PDF exports)
};

export function planForGroup(g: MergedGroup): GroupPlan {
  const order: Order = {};
  const lines: QtyBreakdown[] = [];
  const skipped: GroupItem[] = [];
  const unresolved: GroupItem[] = [];
  const missingQty: GroupItem[] = [];

  for (const it of g.items) {
    if (!it.sku) {
      if (it.packaging) skipped.push(it);
      else unresolved.push(it);
      continue;
    }
    if (it.qty === null) { missingQty.push(it); continue; }
    const b = breakdownFor(it)!;
    lines.push(b);
    const prev = order[b.sku];
    order[b.sku] = { qty: (prev?.qty || 0) + b.qty, note: prev?.note || "" };
  }

  return { order, lines, skipped, unresolved, missingQty };
}

export type Blocker = "needMatch" | "pdf" | "missingQty" | "unresolved" | "empty";

/** Why a group cannot be generated, or null when it is ready. */
export function blockerFor(g: MergedGroup, plan: GroupPlan): Blocker | null {
  if (!g.match.key) return "needMatch";
  if (plan.lines.length === 0 && plan.missingQty.length > 0) return "pdf";
  if (plan.missingQty.length > 0) return "missingQty";
  if (plan.unresolved.length > 0) return "unresolved";
  if (plan.lines.length === 0) return "empty";
  return null;
}
