// Dashboard v2 — learned outlet matches (Phase 2).
//
// Once a human confirms that a piece of vendor wording ("Cicadas Gunung Putri")
// means a Master Data outlet ("BBT - CICADAS GN PUTRI"), that mapping is
// remembered per browser so the same wording auto-matches on later drops.
//
// Local only: localStorage, no backend call, no schema change.
// NOT imported by Dashboard v1, scanner.ts, packing.ts or the exporters.

import { normalizeOutletName } from "./fuzzyOutlet";

const STORAGE_KEY = "plgen_v2_outlet_aliases_v1";

export type AliasEntry = {
  key: string;   // canonical Master Data outlet key
  raw: string;   // original wording as first confirmed (shown in the review panel)
  at: string;    // ISO timestamp
};

export type AliasMap = Record<string, AliasEntry>; // normalizeOutletName(raw) → entry

export function loadAliases(): AliasMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const out: AliasMap = {};
    for (const [norm, v] of Object.entries(parsed as Record<string, any>)) {
      if (v && typeof v.key === "string" && v.key) {
        out[norm] = { key: v.key, raw: String(v.raw || ""), at: String(v.at || "") };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(map: AliasMap): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

/** Remember one spelling → outlet key. Returns the updated map (and persists it). */
export function learnAlias(raw: string, key: string, map: AliasMap): AliasMap {
  const norm = normalizeOutletName(raw);
  if (!norm || !key) return map;
  const next: AliasMap = { ...map, [norm]: { key, raw: String(raw || "").trim(), at: new Date().toISOString() } };
  persist(next);
  return next;
}

/** Remember every spelling a group appeared under (DO and IT can word it differently). */
export function learnAliases(raws: string[], key: string, map: AliasMap): AliasMap {
  let next = map;
  for (const r of raws) next = learnAlias(r, key, next);
  return next;
}

export function forgetAlias(raw: string, map: AliasMap): AliasMap {
  const norm = normalizeOutletName(raw);
  const next: AliasMap = { ...map };
  delete next[norm];
  persist(next);
  return next;
}

export function clearAliases(): AliasMap {
  persist({});
  return {};
}

/** Flat normalized→key map, the shape matchOutlet() expects. */
export function flatAliases(map: AliasMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [norm, e] of Object.entries(map)) if (e.key) out[norm] = e.key;
  return out;
}

/** Newest first, for the review panel. */
export function learnedEntries(map: AliasMap): (AliasEntry & { norm: string })[] {
  return Object.entries(map)
    .map(([norm, e]) => ({ ...e, norm }))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}
