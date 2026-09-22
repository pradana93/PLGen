// PLGen Copilot — Smart Summary Modules
// Pre-built analytical summaries: daily brief, weekly report, anomaly alerts, stock health, team pulse.

import type { CopilotContext, PLEntry, Timeframe } from "./types";
import {
  byChecker, byOutlet, filterByPeriod, fmt, formatKg, L, parseDate, plStats, tfLabel, timeGreeting,
} from "./brain";

function b(ctx: CopilotContext, en: string, id: string): string {
  return ctx.lang === "id" ? id : en;
}

// Simple markdown-lite: **bold** segments → render nice
function bold(s: string): string { return `**${s}**`; }

// ── Top-level dispatch: any question → response ──
export function resolveIntent(intent: any, ctx: CopilotContext): string {
  switch (intent.type) {
    case "greeting": return greeting(ctx);
    case "help": return help(ctx);
    case "summary": return summary(ctx, intent.period);
    case "checker": return checkerReport(ctx, intent.checker, intent.period);
    case "outlet": return outletReport(ctx, intent.outlet, intent.period);
    case "sku": return skuReport(ctx);
    case "stock": return stockReport(ctx);
    case "anomaly": return anomalyReport(ctx);
    case "team": return teamReport(ctx);
    case "trend": return trendReport(ctx);
    default: return fallback(ctx);
  }
}

// ── Greeting ──
export function greeting(ctx: CopilotContext): string {
  const name = ctx.userLabel || ctx.role || "there";
  const out = [
    `${timeGreeting(ctx)}, ${name}! ${ctx.lang === "id" ? "👋" : "👋"}`,
    "",
    b(ctx, "I'm your PLGen Copilot — your logistics command center. I'm watching the live packing data, stock levels, and checker performance.", "Saya PLGen Copilot — pusat komando logistik Anda. Saya memantau data packing live, level stok, dan performa checker."),
    "",
    b(ctx, "Try asking:", "Coba tanyakan:"),
    `• ${b(ctx, "\"How are we doing today?\"", "\"Bagaimana kabar hari ini?\"")}`,
    `• ${b(ctx, "\"Weekly summary\"", "\"Ringkasan mingguan\"")}`,
    `• ${b(ctx, "\"Any issues right now?\"", "\"Ada masalah sekarang?\"")}`,
    `• ${b(ctx, "\"Check stock\"", "\"Cek stok\"")}`,
    `• ${b(ctx, "\"Team leaderboard\"", "\"Papan peringkat tim\"")}`,
  ];
  return out.join("\n");
}

// ── Help ──
export function help(ctx: CopilotContext): string {
  return [
    bold(b(ctx, "🤖 PLGen Copilot — what I can do", "🤖 PLGen Copilot — yang bisa saya lakukan")),
    "",
    `📊 ${bold(b(ctx, "Summaries:", "Ringkasan:"))} ${b(ctx, "\"daily summary\"", "\"ringkasan hari ini\"")}, ${b(ctx, "\"weekly report\"", "\"laporan mingguan\"")}`,
    `🧑‍🔧 ${bold(b(ctx, "Checkers:", "Checker:"))} ${b(ctx, "\"how many PLs did Aji pack this week?\"", "\"berapa PL yang dikerjakan Aji minggu ini?\"")}`,
    `🏪 ${bold(b(ctx, "Outlets:", "Outlet:"))} ${b(ctx, "\"how is [outlet] doing?\"", "\"bagaimana [outlet]?\"")}`,
    `📦 ${bold(b(ctx, "Stock:", "Stok:"))} ${b(ctx, "\"what's low on stock?\"", "\"apa yang stoknya menipis?\"")}`,
    `⚠️ ${bold(b(ctx, "Issues:", "Masalah:"))} ${b(ctx, "\"any anomalies?\"", "\"ada anomali?\"")}`,
    `🏆 ${bold(b(ctx, "Team:", "Tim:"))} ${b(ctx, "\"checker leaderboard\"", "\"papan peringkat checker\"")}`,
    `📈 ${bold(b(ctx, "Trends:", "Tren:"))} ${b(ctx, "\"monthly trend\"", "\"tren bulanan\"")}`,
  ].join("\n");
}

// ── Core summary ──
export function summary(ctx: CopilotContext, tf: Timeframe): string {
  const rows = filterByPeriod(ctx.data, tf);
  const stats = plStats(rows);
  const byC = byChecker(rows);
  const byO = byOutlet(rows);
  const topC = Object.entries(byC).sort((a, b) => plStats(b[1]).tonnage - plStats(a[1]).tonnage)[0];
  const topO = Object.entries(byO).sort((a, b) => plStats(b[1]).tonnage - plStats(a[1]).tonnage)[0];

  const lines = [
    bold(b(ctx, `📊 Summary — ${tfLabel(tf, ctx)}`, `📊 Ringkasan — ${tfLabel(tf, ctx)}`)),
    "",
    `📋 ${bold(fmt(stats.count))} ${L(ctx, "pl")} ${b(ctx, "exported", "diekspor")}`,
    `⚖️ ${bold(formatKg(stats.tonnage))} ${L(ctx, "tonnage")}`,
    `📏 ${bold(stats.avg.toFixed(1))} kg ${b(ctx, "avg per PL", "rata-rata per PL")}`,
    `✅ ${bold(fmt(stats.ready))} ${L(ctx, "ready")} / ${fmt(stats.count)}`,
  ];

  if (topC) {
    const cStats = plStats(topC[1]);
    lines.push(`🥇 ${bold(String(topC[0]))} — ${fmt(cStats.count)} ${L(ctx, "pl")}, ${formatKg(cStats.tonnage)}`);
  }
  if (topO) {
    const oStats = plStats(topO[1]);
    lines.push(`🏪 ${bold(String(topO[0]))} — ${fmt(oStats.count)} ${L(ctx, "pl")}, ${formatKg(oStats.tonnage)}`);
  }
  if (stats.count === 0) {
    lines.push("", b(ctx, "No packing activity in this period yet.", "Belum ada aktivitas packing di periode ini."));
  }
  return lines.join("\n");
}

// ── Checker report (with previous-period comparison) ──
export function checkerReport(ctx: CopilotContext, checker: string, tf: Timeframe): string {
  const rows = filterByPeriod(ctx.data, tf).filter((r) => String(r.checker || "").trim().toLowerCase() === String(checker).trim().toLowerCase());
  const stats = plStats(rows);
  const all = filterByPeriod(ctx.data, tf);
  const allStats = plStats(all);
  const share = allStats.count ? Math.round((stats.count / allStats.count) * 100) : 0;

  // Compare to previous period
  const prevTf = prevPeriod(tf);
  const prevRows = filterByPeriod(ctx.data, prevTf).filter((r) => String(r.checker || "").trim().toLowerCase() === String(checker).trim().toLowerCase());
  const prevStats = plStats(prevRows);
  const delta = stats.count - prevStats.count;
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";

  const last = rows.map((r) => parseDate(r.created_at)).filter(Boolean).sort((a: Date | null, b: Date | null) => (b?.getTime() || 0) - (a?.getTime() || 0))[0];

  return [
    bold(b(ctx, `🧑‍🔧 Checker Report — ${checker}`, `🧑‍🔧 Laporan Checker — ${checker}`)),
    `📋 ${bold(fmt(stats.count))} ${L(ctx, "pl")} ${b(ctx, `(${tfLabel(tf, ctx)})`, `(${tfLabel(tf, ctx)})`)} · ${share}% ${b(ctx, "of total", "dari total")}`,
    `⚖️ ${bold(formatKg(stats.tonnage))} ${L(ctx, "tonnage")} · ${bold(stats.avg.toFixed(1))} kg ${b(ctx, "avg/PL", "rata/PL")}`,
    `📈 ${b(ctx, "vs", "vs")} ${tfLabel(prevTf, ctx)}: ${delta >= 0 ? "+" : ""}${delta} PL ${arrow}`,
    last ? `🕒 ${L(ctx, "lastActive")}: ${last.toLocaleString(ctx.lang === "id" ? "id-ID" : "en-US", { timeZone: "Asia/Jakarta" })} WIB` : b(ctx, "🕒 No activity in period", "🕒 Tidak ada aktivitas di periode ini"),
  ].join("\n");
}

// ── Outlet report ──
export function outletReport(ctx: CopilotContext, outlet: string, tf: Timeframe): string {
  const rows = filterByPeriod(ctx.data, tf).filter((r) => String(r.outlet || "").trim().toLowerCase() === String(outlet).trim().toLowerCase());
  const stats = plStats(rows);
  const last = rows.map((r) => parseDate(r.created_at)).filter(Boolean).sort((a: Date | null, b: Date | null) => (b?.getTime() || 0) - (a?.getTime() || 0))[0];
  const info = ctx.master?.OUTLET_INFO?.[String(outlet).toUpperCase()];

  return [
    bold(b(ctx, `🏪 Outlet Report — ${outlet}`, `🏪 Laporan Outlet — ${outlet}`)),
    info?.name && info.name !== outlet ? `${bold(b(ctx, "Name:", "Nama:"))} ${info.name}` : "",
    `📋 ${bold(fmt(stats.count))} ${L(ctx, "pl")} ${b(ctx, `(${tfLabel(tf, ctx)})`, `(${tfLabel(tf, ctx)})`)}`,
    `⚖️ ${bold(formatKg(stats.tonnage))} ${L(ctx, "tonnage")} · ${bold(stats.avg.toFixed(1))} kg ${b(ctx, "avg/PL", "rata/PL")}`,
    last ? `🕒 ${b(ctx, "Last delivery:", "Kiriman terakhir:")} ${last.toLocaleString(ctx.lang === "id" ? "id-ID" : "en-US", { timeZone: "Asia/Jakarta" })} WIB` : b(ctx, "🕒 No deliveries in period", "🕒 Tidak ada kiriman di periode ini"),
    info?.phone ? `📞 ${info.phone}` : "",
    info?.address ? `📍 ${info.address}` : "",
  ].filter(Boolean).join("\n");
}

// ── SKU report ──
export function skuReport(ctx: CopilotContext): string {
  const top = ctx.summary?.topSku?.slice(0, 10) as any[] | undefined;
  if (!top || !top.length) {
    return bold(b(ctx, "No SKU data yet — export a Packing List to start tracking.", "Belum ada data SKU — ekspor Packing List untuk mulai melacak."));
  }
  const lines = [
    bold(b(ctx, "🏆 Top 10 SKU Exported", "🏆 10 SKU Teratas yang Diekspor")),
    "",
  ];
  top.forEach((r, i) => {
    lines.push(`${i + 1}. ${bold(r.sku)} — ${fmt(r.qty)} ${r.uom || "pack"} · ${formatKg(r.kg)}`);
  });
  return lines.join("\n");
}

// ── Stock health ──
export function stockReport(ctx: CopilotContext): string {
  if (!ctx.stock || Object.keys(ctx.stock).length === 0) {
    return bold(b(ctx, "Stock data is not available right now.", "Data stok tidak tersedia saat ini."));
  }
  const entries = Object.entries(ctx.stock).sort((a, b) => Number(a[1]) - Number(b[1]));
  const low = entries.filter(([, v]) => Number(v) <= 20);
  const out = entries.filter(([, v]) => Number(v) <= 0);
  const lines = [
    bold(b(ctx, "📦 Stock Health Check", "📦 Cek Kesehatan Stok")),
    `🧮 ${bold(fmt(entries.length))} ${b(ctx, "items tracked", "item terpantau")}`,
  ];
  if (out.length) {
    lines.push(`❌ ${bold(b(ctx, "OUT OF STOCK:", "STOK HABIS:"))}`);
    out.slice(0, 8).forEach(([sku, v]) => lines.push(`  • ${sku} — ${fmt(Number(v))}`));
  }
  if (low.length) {
    lines.push(`⚠️ ${bold(b(ctx, "RUNNING LOW (≤20):", "MENIPIS (≤20):"))}`);
    low.slice(0, 10).forEach(([sku, v]) => lines.push(`  • ${sku} — ${fmt(Number(v))}`));
  }
  if (!out.length && !low.length) {
    lines.push(b(ctx, "✅ All stock levels look healthy.", "✅ Semua level stok terlihat sehat."));
  }
  // Top stock items
  const topStock = [...entries].sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);
  if (topStock.length) {
    lines.push("", bold(b(ctx, "Top stock:", "Stok terbesar:")));
    topStock.forEach(([sku, v]) => lines.push(`  • ${sku} — ${fmt(Number(v))}`));
  }
  return lines.join("\n");
}

// ── Anomaly alerts ──
export function anomalyReport(ctx: CopilotContext): string {
  const now = new Date();
  const all = ctx.data;
  const stalled = all.filter((r) => {
    const status = String(r.status || "").toUpperCase();
    if (status === "READY" || status === "CANCELLED") return false;
    const d = parseDate(r.created_at);
    if (!d) return false;
    return now.getTime() - d.getTime() > 60 * 60 * 1000; // >1h in PACKING
  });
  const lines = [bold(b(ctx, "⚠️ Anomaly / Issue Scan", "⚠️ Pindai Anomali / Masalah"))];
  if (stalled.length) {
    lines.push(`🕓 ${bold(fmt(stalled.length))} ${b(ctx, "PLs stuck in PACKING >1h:", "PL macet di PACKING >1 jam:")}`);
    stalled.slice(0, 6).forEach((r) => {
      lines.push(`  • ${r.delivery_no} — ${r.outlet} (${r.checker || "no checker"})`);
    });
  } else {
    lines.push(b(ctx, "✅ No stalled packing lists detected.", "✅ Tidak ada packing list yang macet."));
  }
  // Checkers with zero activity in the last 2 days
  const twoDays = now.getTime() - 2 * 24 * 60 * 60 * 1000;
  const activeCheckers = new Set(
    all.filter((r) => { const d = parseDate(r.created_at); return d && d.getTime() >= twoDays; })
      .map((r) => String(r.checker || "").trim().toLowerCase()).filter(Boolean)
  );
  const inactive = ctx.checkers.filter((c) => !activeCheckers.has(c.toLowerCase()));
  if (inactive.length) {
    lines.push(`😴 ${bold(b(ctx, "Checkers inactive 48h+:", "Checker tidak aktif 48 jam+:"))} ${inactive.join(", ")}`);
  }
  // Low stock hint
  if (ctx.stock) {
    const out = Object.entries(ctx.stock).filter(([, v]) => Number(v) <= 0);
    if (out.length) lines.push(`❌ ${bold(b(ctx, "Out of stock items:", "Item stok habis:"))} ${out.slice(0, 5).map(([s]) => s).join(", ")}`);
  }
  return lines.join("\n");
}

// ── Team pulse / leaderboard ──
export function teamReport(ctx: CopilotContext): string {
  const rows = ctx.data;
  if (!rows.length) return bold(b(ctx, "No packing data yet — leaderboard empty.", "Belum ada data packing — papan peringkat kosong."));
  const byC = byChecker(rows);
  const ranked = Object.entries(byC)
    .map(([c, r]) => ({ checker: c, ...plStats(r) }))
    .sort((a, b) => b.tonnage - a.tonnage || b.count - a.count)
    .slice(0, 10);
  const medals = ["🥇", "🥈", "🥉"];
  return [
    bold(b(ctx, "🏅 Checker Leaderboard (All Time)", "🏅 Papan Peringkat Checker (Sepanjang Waktu)")),
    "",
    ...ranked.map((r, i) => `${medals[i] || `${i + 1}.`} ${bold(r.checker)} — ${fmt(r.count)} ${L(ctx, "pl")} · ${formatKg(r.tonnage)} · ${r.avg.toFixed(1)} kg/PL`),
  ].join("\n");
}

// ── Trend report ──
export function trendReport(ctx: CopilotContext): string {
  const monthly = ctx.summary?.monthly as any[] | undefined;
  if (!monthly || !monthly.length) return bold(b(ctx, "No monthly trend data yet.", "Belum ada data tren bulanan."));
  const last = monthly.slice(-6);
  const lines = [
    bold(b(ctx, "📈 Monthly Trend (last 6 months)", "📈 Tren Bulanan (6 bulan terakhir)")),
    "",
  ];
  let prevTonnage: number | null = null;
  for (const m of last) {
    const arrow = prevTonnage === null ? "" : m.tonnage > prevTonnage ? " ↑" : m.tonnage < prevTonnage ? " ↓" : " →";
    lines.push(`  ${m.month} — ${fmt(m.pl)} PL · ${formatKg(m.tonnage)}${arrow}`);
    prevTonnage = m.tonnage;
  }
  return lines.join("\n");
}

// ── Fallback ──
export function fallback(ctx: CopilotContext): string {
  return [
    bold(b(ctx, "🤔 I'm not sure I understood that.", "🤔 Saya kurang paham pertanyaan itu.")),
    "",
    b(ctx, "I'm a local AI — I know PLGen's data deeply, but I can only answer about:", "Saya AI lokal — saya paham data PLGen, tapi saya hanya bisa menjawab tentang:"),
    `• ${b(ctx, "Summaries", "Ringkasan")} — ${b(ctx, "\"daily summary\"", "\"ringkasan hari ini\"")}`,
    `• ${b(ctx, "Checker performance", "Performa checker")} — ${b(ctx, "\"Aji's PLs this week\"", "\"PL Aji minggu ini\"")}`,
    `• ${b(ctx, "Outlet activity", "Aktivitas outlet")} — ${b(ctx, "\"how is [outlet]?\"", "\"bagaimana [outlet]?\"")}`,
    `• ${b(ctx, "Stock levels", "Level stok")} — ${b(ctx, "\"running low?\"", "\"stok menipis?\"")}`,
    `• ${b(ctx, "Issues", "Masalah")} — ${b(ctx, "\"any anomalies?\"", "\"ada anomali?\"")}`,
    "",
    b(ctx, "Try rephrasing, or tap a suggestion below. 👇", "Coba tulis ulang, atau ketuk saran di bawah. 👇"),
  ].join("\n");
}

// Previous-period helper (for checker comparisons)
export function prevPeriod(tf: Timeframe): Timeframe {
  switch (tf) {
    case "today": return "yesterday";
    case "week": return "last_week";
    case "month": return "last_month";
    default: return tf;
  }
}
