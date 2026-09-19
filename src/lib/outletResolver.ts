// Remastered Dashboard helpers — ADDITIVE ONLY. No packing/scanner/store logic touched.
// Outlet fuzzy-resolve vs master OUTLET_INFO (PythonAnywhere snapshot) + per-outlet company vote.
import type { MasterDB } from "./packing";

export function normalizeOutlet(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/^(BANGOR\s*-\s*|BBT\s*-\s*|GUDANG\s+VITTORIA\s+)/, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type OutletMatch =
  | { kind: "exact"; canonical: string }
  | { kind: "fuzzy"; canonical: string }
  | { kind: "unmatched"; canonical: null };

export function resolveOutlet(raw: string, master: MasterDB): OutletMatch {
  const info = (master as any).OUTLET_INFO || {};
  const keys = Object.keys(info);
  const norm = normalizeOutlet(raw);
  if (!norm) return { kind: "unmatched", canonical: null };
  // 1) exact on normalized canonical (strip BBT - / Bangor - prefixes the same way)
  for (const k of keys) {
    if (normalizeOutlet(k) === norm) return { kind: "exact", canonical: k };
  }
  // also direct case-insensitive exact (covers already-canonical input)
  const direct = keys.find(k => k.toUpperCase() === String(raw || "").toUpperCase().trim());
  if (direct) return { kind: "exact", canonical: direct };
  // 2) contains either way, longest canonical wins (mirrors Dashboard outlet-guard spirit)
  let best: string | null = null;
  for (const k of keys) {
    const nk = normalizeOutlet(k);
    if (!nk) continue;
    if (nk.includes(norm) || norm.includes(nk)) {
      if (!best || k.length > best.length) best = k;
    }
  }
  if (best) return { kind: "fuzzy", canonical: best };
  return { kind: "unmatched", canonical: null };
}

// Company vote per resolved outlet: canonical "BBT - X" => BBT, else BBB.
export function companyForOutlet(canonical: string | null, raw: string): "BBB" | "BBT" {
  const c = String(canonical || "").toUpperCase().trim();
  if (c.startsWith("BBT -") || c.startsWith("BBT ")) return "BBT";
  const r = String(raw || "").toUpperCase().trim();
  if (/^BBT[\s-]/.test(r)) return "BBT";
  return "BBB";
}

// Majority company across outlets (weighted by line count), header company breaks ties.
export function detectBatchCompany(
  outlets: { company: "BBB" | "BBT"; lines: number }[],
  headerCompany: "BBB" | "BBT"
): "BBB" | "BBT" {
  let bbb = 0, bbt = 0;
  for (const o of outlets) {
    if (o.company === "BBT") bbt += Math.max(1, o.lines);
    else bbb += Math.max(1, o.lines);
  }
  if (bbt === bbb) return headerCompany;
  return bbt > bbb ? "BBT" : "BBB";
}

// Excel sheet-name sanitize (31 chars, no []:*?/\), dedupe with (2), (3)…
export function sheetNameFor(base: string, used: Set<string>): string {
  let s = String(base || "PL").replace(/[\[\]:*?\\/]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28);
  if (!s) s = "PL";
  let name = s, i = 2;
  while (used.has(name.toUpperCase())) {
    const suffix = ` (${i})`;
    name = s.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(name.toUpperCase());
  return name;
}
