// PLGen Copilot — Knowledge Base
// Everything the Local Brain "knows" about the app: terminology, patterns, entities.

import type { CopilotLang, Timeframe } from "./types";

// ── App terminology (EN + ID) ──
export const TERMINOLOGY: Record<CopilotLang, Record<string, string>> = {
  en: {
    pl: "Packing List",
    do: "Delivery Order",
    pls: "Packing Lists",
    tonnage: "total weight (kg)",
    checker: "assigned packer",
    outlet: "delivery destination",
    wib: "Western Indonesia Time",
    sku: "product item",
    usage: "tracked item usage",
    stock: "current warehouse stock",
    leaderboard: "checker performance ranking",
  },
  id: {
    pl: "Packing List",
    do: "Delivery Order",
    pls: "Packing List",
    tonnage: "total berat (kg)",
    checker: "packer yang ditugaskan",
    outlet: "tujuan pengiriman",
    wib: "Waktu Indonesia Barat",
    sku: "item produk",
    usage: "penggunaan item terlacak",
    stock: "stok gudang saat ini",
    leaderboard: "peringkat performa checker",
  },
};

// ── Greetings ──
export const GREETING_PATTERNS = [
  "hi", "hello", "hey", "hai", "halo", "helo", "good morning", "good afternoon", "good evening",
  "selamat pagi", "selamat siang", "selamat sore", "selamat malam", "pagi", "siang", "sore", "malam",
  "halo copilot", "hai copilot", "hi copilot", "hello copilot", "assalamualaikum", "assalamu alaikum",
];

// ── Help ──
export const HELP_PATTERNS = [
  "help", "bantuan", "what can you do", "apa yang bisa", "how to use", "cara pakai", "fitur",
  "commands", "perintah", "capabilities", "kemampuan", "help me", "tolong",
];

// ── Summary / overview ──
export const SUMMARY_PATTERNS = [
  "summary", "overview", "recap", "ringkasan", "rekap", "laporan", "report", "status", "how are we",
  "how's it going", "bagaimana kabar", "gimana kabar", "update", "kabar", "situasi", "situation",
  "today's summary", "daily summary", "ringkasan hari ini", "dashboard", "kpi", "kpi report",
];

// ── Checker queries ──
export const CHECKER_PATTERNS = [
  "checker", "packed", "packing", "did pack", "how many pl", "pl count", "best checker", "top checker",
  "checker performance", "who packed", "performa checker", "berapa pl", "berapa packing", "kerjain",
  "kerjakan", "kerja", "mengerjakan", "handle", "handling", "ditangani", "menangani",
];

// ── Outlet queries ──
export const OUTLET_PATTERNS = [
  "outlet", "store", "cabang", "toko", "destination", "tujuan", "kiriman", "delivery to", "kirim ke",
  "customer", "pelanggan", "how is", "gimana", "bagaimana", "pengiriman ke",
];

// ── SKU queries ──
export const SKU_PATTERNS = [
  "sku", "item", "product", "best seller", "best selling", "top item", "laku", "terlaris", "barang",
  "produk", "what's selling", "apa yang laku", "sering dipakai", "most used", "paling banyak",
];

// ── Stock queries ──
export const STOCK_PATTERNS = [
  "stock", "stok", "inventory", "availability", "available", "left", "remaining", "tersisa", "habis",
  "menipis", "low stock", "stok menipis", "out of stock", "kehabisan", "persediaan", "gudang",
  "warehouse", "running low", "berapa stok", "berapa sisa",
];

// ── Anomaly / issues ──
export const ANOMALY_PATTERNS = [
  "anomaly", "anomalies", "issue", "issues", "problem", "problems", "warning", "alert", "stalled",
  "stuck", "pending", "unfinished", "masalah", "kendala", "ganjalan", "hambatan", "warning", "peringatan",
  "macet", "tertahan", "belum selesai", "any issue", "ada masalah", "ada kendala", "any problem",
  "bermasalah", "tidak selesai", "leftover", "sisa",
];

// ── Team / leaderboard ──
export const TEAM_PATTERNS = [
  "team", "leaderboard", "ranking", "performa", "performance", "tim", "peringkat", "siapa terbaik",
  "who's best", "best performer", "top performer", "rating checkers", "checker list", "daftar checker",
];

// ── Trend / monthly ──
export const TREND_PATTERNS = [
  "trend", "trends", "monthly", "per month", "month", "bulan", "bulanan", "per bulan", "grafik",
  "chart", "growth", "pertumbuhan", "naik", "turun", "increase", "decrease", "compare", "perbandingan",
  "week over week", "month over month", "moo", "wow", "latest trend",
];

// ── Timeframe patterns (EN + ID) → Timeframe ──
export const TIMEFRAME_PATTERNS: { pattern: RegExp; tf: Timeframe }[] = [
  { pattern: /today|hari ini|sekarang|saat ini|tdy|daily|harian/, tf: "today" },
  { pattern: /yesterday|kemarin|kemaren/, tf: "yesterday" },
  { pattern: /this week|minggu ini|pekan ini|week so far|weekly|mingguan|pekanan|this week so far/, tf: "week" },
  { pattern: /last week|minggu lalu|pekan lalu|minggu kemarin/, tf: "last_week" },
  { pattern: /this month|bulan ini|month so far|monthly|bulanan/, tf: "month" },
  { pattern: /last month|bulan lalu|bulan kemarin|bulan sebelumnya/, tf: "last_month" },
  { pattern: /7 days?|7 hari|seven days|seminggu terakhir|last 7|last7/, tf: "7d" },
  { pattern: /30 days?|30 hari|thirty days|sebulan terakhir|last 30|last30/, tf: "30d" },
  { pattern: /all time|all|semua|selamanya|keseluruhan|entire|ever|sepanjang masa/, tf: "all" },
];

// Default timeframe per intent when user doesn't specify
export const DEFAULT_TIMEFRAME: Record<string, Timeframe> = {
  greeting: "today",
  help: "all",
  summary: "today",
  checker: "week",
  outlet: "all",
  sku: "all",
  stock: "all",
  anomaly: "week",
  team: "all",
  trend: "all",
  fallback: "all",
};

// ── Entity fuzzy matching helpers ──
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Find closest checker name inside query text (case-insensitive)
export function findChecker(query: string, checkers: string[]): string | null {
  const q = normalize(query);
  for (const c of checkers) {
    const cn = normalize(c);
    if (cn.length < 2) continue;
    if (q.includes(cn) || cn.includes(q)) return c;
  }
  // Also match first-name tokens against known aliases
  const tokens = q.split(" ");
  for (const tok of tokens) {
    for (const c of checkers) {
      if (normalize(c) === tok) return c;
    }
  }
  return null;
}

// Find closest outlet name inside query text
export function findOutlet(query: string, outlets: string[]): string | null {
  const q = normalize(query);
  const sorted = [...outlets].sort((a, b) => b.length - a.length);
  for (const o of sorted) {
    const on = normalize(o);
    if (q.includes(on)) return o;
  }
  return null;
}

// Detect SKU inside query (longer SKUs matched first)
export function findSku(query: string, skus: string[]): string | null {
  const q = normalize(query);
  const sorted = [...skus].sort((a, b) => b.length - a.length);
  for (const s of sorted) {
    const sn = normalize(s);
    if (q.includes(sn)) return s;
  }
  return null;
}

// Score how "checker-like" a query is (used to decide checker intent)
export function isCheckerQuery(query: string): boolean {
  const q = normalize(query);
  return CHECKER_PATTERNS.some(p => q.includes(p)) || /\bberapa\b|\bhow many\b|\bhow much\b/.test(q);
}
