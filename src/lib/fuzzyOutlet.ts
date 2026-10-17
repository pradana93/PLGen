// Dashboard v2 — outlet name fuzzy matcher against Master Data OUTLET_INFO keys.
// Pure functions only: no state, no fetching, no side effects.
// NOT imported by Dashboard v1, scanner.ts, packing.ts or the exporters —
// the main scan lane and every core calculation stay untouched.

export type OutletCandidate = { key: string; score: number };
export type OutletConfidence = "high" | "review" | "low";

export type OutletMatch = {
  raw: string;
  normalized: string;
  key: string | null;          // canonical Master Data outlet key when confident
  score: number;               // 0..1
  confidence: OutletConfidence;
  candidates: OutletCandidate[];
};

// Word abbreviations seen on warehouse paperwork (left) → Master Data wording (right).
// Deliberately small and explicit — anything not listed still scores via similarity.
const ABBREV: Record<string, string> = {
  GN: "GUNUNG",
  GMTI: "GUNUNG PUTRI",
  TJ: "TANJUNG",
  TG: "TANJUNG",
  KEL: "KELAPA",
  PDK: "PONDOK",
  PSR: "PASAR",
  BKT: "BUKIT",
  KMP: "KAMPUNG",
  KP: "KAMPUNG",
  BGR: "BOGOR",
  BDG: "BANDUNG",
  BKS: "BEKASI",
  JKT: "JAKARTA",
  SLT: "SELATAN",
  UTR: "UTARA",
  TMR: "TIMUR",
  BR: "BARAT",
  TGH: "TENGAH",
  RAYA: "RAYA",
  JLN: "JALAN",
};

// Brand / entity noise that must not influence matching (same treatment on both sides).
const NOISE = new Set(["PT", "BBT", "BBB", "BANGOR", "TBK", "CV"]);

export function normalizeOutletName(raw: string): string {
  let s = String(raw || "").toUpperCase();
  s = s.replace(/\(.*?\)/g, " ");
  s = s.replace(/[^A-Z0-9\s]/g, " ");
  const tokens = s
    .split(/\s+/)
    .filter(Boolean)
    .filter((tk) => !NOISE.has(tk))
    .map((tk) => ABBREV[tk] ?? tk);
  // re-expand multi-word abbreviations after mapping
  const out: string[] = [];
  for (const tk of tokens) for (const part of tk.split(/\s+/)) if (part) out.push(part);
  return out.join(" ").trim();
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  const t = s.replace(/\s+/g, "");
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  if (!out.length && t) out.push(t);
  return out;
}

// Sørensen–Dice on character bigrams — robust to word order and small typos.
function diceBigram(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of A) pool.set(g, (pool.get(g) || 0) + 1);
  let hits = 0;
  for (const g of B) {
    const n = pool.get(g) || 0;
    if (n > 0) { hits++; pool.set(g, n - 1); }
  }
  return (2 * hits) / (A.length + B.length);
}

// Token level: subset hits weigh heavily (e.g. "SUKAPURA CAKUNG" ⊂ "... SUKAPURA CAKUNG ...")
function tokenScore(a: string, b: string): number {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  const setA = new Set(A);
  let inA = 0;
  for (const t of A) if (setB.has(t)) inA++;
  let inB = 0;
  for (const t of B) if (setA.has(t)) inB++;
  const jaccard = inA / new Set([...A, ...B]).size;
  const containment = Math.max(inA / A.length, inB / B.length);
  // Longest common prefix on the joined strings helps "CICADAS GN PUTRI" vs "CICADAS GUNUNG PUTRI"
  const [short, long] = A.length <= B.length ? [A.join(" "), B.join(" ")] : [B.join(" "), A.join(" ")];
  const subseq = short && long.includes(short) ? 1 : 0;
  return Math.max(jaccard * 0.85, containment, subseq);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev; prev = cur; cur = swap;
  }
  return prev[n];
}

export function outletSimilarity(aNorm: string, bNorm: string): number {
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;
  const tok = tokenScore(aNorm, bNorm);
  const big = diceBigram(aNorm, bNorm);
  const lev = 1 - levenshtein(aNorm, bNorm) / Math.max(aNorm.length, bNorm.length);
  let score = 0.5 * tok + 0.3 * big + 0.2 * lev;
  // Exact containment of a multi-token name is a very strong signal.
  const aT = aNorm.split(" ").length, bT = bNorm.split(" ").length;
  if (Math.min(aT, bT) >= 2 && (aNorm.includes(bNorm) || bNorm.includes(aNorm))) score = Math.max(score, 0.92);
  return Math.min(1, score);
}

export function confidenceFor(score: number): OutletConfidence {
  if (score >= 0.86) return "high";
  if (score >= 0.62) return "review";
  return "low";
}

/**
 * Match one raw outlet string from a document against the Master Data outlet keys.
 * `aliases` maps a normalized raw name → canonical outlet key, used by the
 * learned-match store (Phase 2); pass an empty/absent map for pure fuzzy behaviour.
 */
export function matchOutlet(raw: string, outletKeys: string[], aliases?: Record<string, string>): OutletMatch {
  const normalized = normalizeOutletName(raw);
  const normIndex = outletKeys.map((k) => ({ key: k, norm: normalizeOutletName(k) }));

  const learned = aliases?.[normalized];
  if (learned && outletKeys.includes(learned)) {
    return { raw, normalized, key: learned, score: 1, confidence: "high", candidates: [{ key: learned, score: 1 }] };
  }

  const scored: OutletCandidate[] = normIndex
    .map((o) => ({ key: o.key, score: outletSimilarity(normalized, o.norm) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const best = scored[0];
  const confidence: OutletConfidence = best ? confidenceFor(best.score) : "low";
  return {
    raw,
    normalized,
    key: best && confidence !== "low" ? best.key : null,
    score: best ? best.score : 0,
    confidence,
    candidates: scored.slice(0, 3),
  };
}

export function matchOutlets(raws: string[], outletKeys: string[], aliases?: Record<string, string>): OutletMatch[] {
  return raws.map((r) => matchOutlet(r, outletKeys, aliases));
}
