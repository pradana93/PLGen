// Dashboard v2 (Phase 3) — document quantity → packing quantity.
//
// Per the Phase 3 decisions:
//   • multipliers follow Dashboard v1's scan logic (Beef Patty ×18,
//     Thousand Island Mayonaise ×20, Butter ×40)
//   • a "DUS-20" Satuan means the Kuantitas is expressed in dus of 20 → ×20
//   • "Dus …" lines that are NOT Master Data SKUs are packaging material and are
//     ignored, while a real SKU such as "Dus Hampers" is kept
//
// Pure functions only. NOT imported by Dashboard v1, scanner.ts, packing.ts or the
// exporters — the core packing math is untouched.

import { dusMultiplier } from "./groupScan";
import type { GroupItem, MergedGroup } from "./groupScan";
import type { Order } from "./packing";

// Same products Dashboard v1 multiplies after a scan (packages → pieces).
const MULTIPLIERS: Record<string, number> = {
  "BEEF PATTY SMALL": 18,
  "BEEF PATTY LARGE": 18,
  "THOUSAND ISLAND MAYONAISE": 20,
  "BUTTER": 40,
  // BBT wording of the same product — the IT file resolves kode 100008 to this SKU.
  "THOUSAND ISLAND": 20,
};

export function baseSkuName(sku: string): string {
  return String(sku || "")
    .toUpperCase()
    .replace(/\((BBT|FREE|FREE ITEM)\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function itemMultiplier(sku: string): number {
  return MULTIPLIERS[baseSkuName(sku)] ?? 1;
}

export type QtyBreakdown = { sku: string; raw: number; packMult: number; dusMult: number; qty: number };

/** Effective packing quantity for one document line, or null when it has no SKU. */
export function breakdownFor(it: GroupItem): QtyBreakdown | null {
  if (!it.sku) return null;
  const raw = it.qty ?? 0;
  const packMult = itemMultiplier(it.sku);
  const dusMult = dusMultiplier(it.uom) ?? 1;
  return { sku: it.sku, raw, packMult, dusMult, qty: raw * packMult * dusMult };
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
