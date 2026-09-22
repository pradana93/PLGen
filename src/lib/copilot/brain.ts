// PLGen Copilot — Local Brain
// Classifies user intent, extracts entities & timeframes, resolves from live app data.

import type { CopilotContext, CopilotIntent, IntentMatch, PLEntry, Timeframe } from "./types";
import {
  ANOMALY_PATTERNS, CHECKER_PATTERNS, GREETING_PATTERNS, HELP_PATTERNS, OUTLET_PATTERNS,
  SKU_PATTERNS, STOCK_PATTERNS, SUMMARY_PATTERNS, TEAM_PATTERNS, TIMEFRAME_PATTERNS,
  TREND_PATTERNS, DEFAULT_TIMEFRAME, findChecker, findOutlet, findSku, normalize,
} from "./knowledge";

// ── Timeframe helpers ──
export function timeframeFromText(text: string): Timeframe | null {
  const q = normalize(text);
  for (const { pattern, tf } of TIMEFRAME_PATTERNS) {
    if (pattern.test(q)) return tf;
  }
  return null;
}

export function periodRange(tf: Timeframe, now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  const end = new Date(now);
  const day = 24 * 60 * 60 * 1000;
  switch (tf) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      start.setTime(now.getTime() - day);
      start.setHours(0, 0, 0, 0);
      end.setTime(now.getTime() - day);
      end.setHours(23, 59, 59, 999);
      break;
    case "week": {
      const dow = (now.getDay() + 6) % 7; // Monday=0
      start.setDate(now.getDate() - dow);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "last_week": {
      const dow = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - dow - 7);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - dow - 1);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "last_month":
      start.setMonth(now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0); // last day of prev month
      end.setHours(23, 59, 59, 999);
      break;
    case "7d":
      start.setTime(now.getTime() - 7 * day);
      break;
    case "30d":
      start.setTime(now.getTime() - 30 * day);
      break;
    case "all":
      start.setFullYear(2020, 0, 1);
      break;
  }
  return { start, end };
}

// Created-at may be "YYYY-MM-DD HH:MM:SS" (WIB) or ISO. Parse robustly.
export function parseDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

export function inPeriod(d: Date | null, start: Date, end: Date): boolean {
  if (!d) return false;
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

// ── Intent classification ──
export function classify(text: string, ctx: CopilotContext): IntentMatch {
  const q = normalize(text);
  if (!q) return { intent: { type: "fallback" }, confidence: 0 };

  const score = (patterns: string[]) => patterns.reduce((acc, p) => acc + (q.includes(p) ? 1 : 0), 0);

  // Entity extraction first
  const checker = findChecker(text, ctx.checkers);
  const outletNames = [
    ...(ctx.summary?.topOutlet?.map((o: any) => o.outlet) || []),
    ...(ctx.master?.OUTLET_INFO ? Object.keys(ctx.master.OUTLET_INFO) : []),
  ];
  const outlet = findOutlet(text, outletNames);
  const skus = ctx.master?.BOX_CAPACITY ? Object.keys(ctx.master.BOX_CAPACITY) : [];
  const sku = findSku(text, skus);
  const tf = timeframeFromText(text);

  // Quick wins: pure greeting / help
  if (GREETING_PATTERNS.some(p => q === p || q.startsWith(p + " ")) && score(SUMMARY_PATTERNS) === 0) {
    return { intent: { type: "greeting" }, confidence: 0.95 };
  }
  if (HELP_PATTERNS.some(p => q.includes(p)) && score(CHECKER_PATTERNS) === 0 && score(OUTLET_PATTERNS) === 0) {
    return { intent: { type: "help" }, confidence: 0.9 };
  }

  const s = {
    summary: score(SUMMARY_PATTERNS),
    checker: score(CHECKER_PATTERNS),
    outlet: score(OUTLET_PATTERNS),
    sku: score(SKU_PATTERNS),
    stock: score(STOCK_PATTERNS),
    anomaly: score(ANOMALY_PATTERNS),
    team: score(TEAM_PATTERNS),
    trend: score(TREND_PATTERNS),
  };

  // Checker has entity → checker intent regardless of pattern score
  if (checker && s.checker + s.summary >= 1) {
    return { intent: { type: "checker", checker, period: tf || DEFAULT_TIMEFRAME.checker }, confidence: 0.9 };
  }
  if (checker && (s.team >= 1 || s.summary >= 0)) {
    return { intent: { type: "checker", checker, period: tf || DEFAULT_TIMEFRAME.checker }, confidence: 0.8 };
  }
  // Outlet has entity → outlet intent
  if (outlet && (s.outlet >= 1 || s.summary >= 1 || true)) {
    return { intent: { type: "outlet", outlet, period: tf || DEFAULT_TIMEFRAME.outlet }, confidence: 0.85 };
  }
  // SKU has entity + sku intent
  if (sku && s.sku >= 1) {
    return { intent: { type: "sku" }, confidence: 0.8 };
  }

  const max = Math.max(s.summary, s.checker, s.outlet, s.sku, s.stock, s.anomaly, s.team, s.trend);
  if (max === 0) return { intent: { type: "fallback" }, confidence: 0.1 };

  // Pick highest; tie-break order matters (summary before trends)
  const pick = (name: keyof typeof s, intent: CopilotIntent) => (s[name] === max ? { intent, confidence: 0.5 + s[name] * 0.15 } : null);
  return (
    pick("anomaly", { type: "anomaly" }) ||
    pick("stock", { type: "stock" }) ||
    pick("team", { type: "team" }) ||
    pick("sku", { type: "sku" }) ||
    pick("trend", { type: "trend" }) ||
    pick("checker", { type: "checker", checker: checker || "Unknown", period: tf || DEFAULT_TIMEFRAME.checker }) ||
    pick("outlet", { type: "outlet", outlet: outlet || "Unknown", period: tf || DEFAULT_TIMEFRAME.outlet }) ||
    pick("summary", { type: "summary", period: tf || DEFAULT_TIMEFRAME.summary }) ||
    { intent: { type: "fallback" }, confidence: 0.2 }
  );
}

// ── Data query helpers ──
export function filterByPeriod(data: PLEntry[], tf: Timeframe, now?: Date): PLEntry[] {
  const { start, end } = periodRange(tf, now);
  return data.filter((e) => {
    const d = parseDate(e.created_at || e.scanned_at);
    return inPeriod(d, start, end);
  });
}

export function plStats(rows: PLEntry[]): { count: number; tonnage: number; avg: number; ready: number } {
  const count = rows.length;
  const tonnage = rows.reduce((a, b) => a + Number(b.total_weight_kg || 0), 0);
  const ready = rows.filter((r) => String(r.status || "").toUpperCase() === "READY").length;
  return { count, tonnage, avg: count ? tonnage / count : 0, ready };
}

export function byChecker(rows: PLEntry[]): Record<string, PLEntry[]> {
  const map: Record<string, PLEntry[]> = {};
  for (const r of rows) {
    const c = String(r.checker || "Unknown").trim() || "Unknown";
    (map[c] = map[c] || []).push(r);
  }
  return map;
}

export function byOutlet(rows: PLEntry[]): Record<string, PLEntry[]> {
  const map: Record<string, PLEntry[]> = {};
  for (const r of rows) {
    const o = String(r.outlet || "Unknown").trim() || "Unknown";
    (map[o] = map[o] || []).push(r);
  }
  return map;
}

export function formatKg(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return `${rounded.toLocaleString()} kg`;
}

export function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

// ── Localized labels ──
export function L(ctx: CopilotContext, key: string): string {
  const dict: Record<string, { en: string; id: string }> = {
    pl: { en: "PLs", id: "PL" },
    tonnage: { en: "Tonnage", id: "Tonase" },
    avg: { en: "Avg/PL", id: "Rata/PL" },
    ready: { en: "Ready", id: "Siap" },
    active: { en: "Active", id: "Aktif" },
    stalled: { en: "Stalled", id: "Tertahan" },
    lowStock: { en: "Low stock", id: "Stok menipis" },
    outOfStock: { en: "Out of stock", id: "Stok habis" },
    topChecker: { en: "Top checker", id: "Checker terbaik" },
    topOutlet: { en: "Top outlet", id: "Outlet teratas" },
    lastActive: { en: "Last active", id: "Aktif terakhir" },
    period: { en: "Period", id: "Periode" },
    week: { en: "this week", id: "minggu ini" },
    today: { en: "today", id: "hari ini" },
    yesterday: { en: "yesterday", id: "kemarin" },
    month: { en: "this month", id: "bulan ini" },
    lastWeek: { en: "last week", id: "minggu lalu" },
    lastMonth: { en: "last month", id: "bulan lalu" },
    last7: { en: "last 7 days", id: "7 hari terakhir" },
    last30: { en: "last 30 days", id: "30 hari terakhir" },
    all: { en: "all time", id: "sepanjang waktu" },
  };
  const entry = dict[key];
  if (!entry) return key;
  return ctx.lang === "id" ? entry.id : entry.en;
}

export function tfLabel(tf: Timeframe, ctx: CopilotContext): string {
  switch (tf) {
    case "today": return L(ctx, "today");
    case "yesterday": return L(ctx, "yesterday");
    case "week": return L(ctx, "week");
    case "last_week": return L(ctx, "lastWeek");
    case "month": return L(ctx, "month");
    case "last_month": return L(ctx, "lastMonth");
    case "7d": return L(ctx, "last7");
    case "30d": return L(ctx, "last30");
    case "all": return L(ctx, "all");
  }
}

// ── Time-of-day aware greeting ──
export function timeGreeting(ctx: CopilotContext): string {
  const h = new Date().getHours();
  if (ctx.lang === "id") {
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 19) return "Selamat sore";
    return "Selamat malam";
  }
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
