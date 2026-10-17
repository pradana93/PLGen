// Dashboard v2 — grouped Surat Jalan parser (DO/BBB + IT/BBT).
//
// Returns ONE GROUP PER DESTINATION OUTLET instead of the single flat
// { SKU: qty } map that the main scanner produces.
//
// Scope guard: nothing here is imported by Dashboard v1, scanner.ts, packing.ts
// or the exporters. The main scan lane (smartScanPdf / smartScanExcel) and every
// core packing calculation stay byte-identical.
//
// Format notes (verified against live exports 2026-10-17):
//   • XLSX carries full fidelity — Number/Date/Customer (DO) or
//     No. Pemindahan/Tanggal/Gudang/Gudang Tujuan (IT) + Kode/Nama Barang/Satuan/Kuantitas.
//   • PDF exports from the same ERP DROP the quantity column completely (no text
//     layer for it), so PDFs parse outlets + items only and report qtyColumnPresent=false.

import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorker;

import type { MasterDB } from "./packing";
import { getDualLookupMaps } from "./scanner";
import { matchOutlet, type OutletMatch } from "./fuzzyOutlet";

export type Entity = "BBB" | "BBT";
export type DocKind = "DO" | "IT";

export type GroupItem = {
  sku: string | null;   // canonical Master Data SKU, null when unresolved
  rawName: string;      // name exactly as printed in the document
  kode: string;         // Kode Barang when the document has that column
  qty: number | null;   // null when the document carries no quantity (PDF exports)
  uom: string;          // Satuan — Pck / DUS-20 / Jrg …
  packaging: boolean;   // dus / packaging material line rather than a product
};

export type ScanGroup = {
  id: string;
  kind: DocKind;
  entity: Entity | null;
  ref: string;          // DO.2026.10.02239 / IT.2026.10.02378 (may be blank for PDFs)
  outletRaw: string;    // "Bangor - Bintara" / "Sukapura Cakung"
  warehouse: string;
  items: GroupItem[];
  sourceFile: string;
};

export type ParseWarning = "unsupportedExt" | "noEntity" | "noRows" | "noQtyColumn" | "readError";

export type FileParseResult = {
  fileName: string;
  entity: Entity | null;
  kind: DocKind | null;
  refs: string[];
  groups: ScanGroup[];
  qtyColumnPresent: boolean;
  warnings: ParseWarning[];
  errorText?: string;
  stats: { rows: number; items: number; resolved: number };
};

export type MergedWarning =
  | "mergedFiles"
  | "qtyMissing"
  | "satuanDus"
  | "variantClash"
  | "unknownSku"
  | "packaging";

export type MergedGroup = {
  id: string;
  outletRaws: string[];        // every raw spelling seen across the dropped files
  match: OutletMatch;          // fuzzy match against Master Data OUTLET_INFO keys
  refs: string[];
  kinds: DocKind[];
  entities: Entity[];
  sourceFiles: string[];
  warehouses: string[];
  items: GroupItem[];
  qtyBySku: Record<string, number>;   // summed across files (merge decision)
  qtyTotal: number;
  warnings: MergedWarning[];
};

export type UnknownSku = { rawName: string; kode: string; qtySum: number; outlets: string[]; files: string[] };

export type MultiParseResult = {
  files: FileParseResult[];
  merged: MergedGroup[];
  unknownSkus: UnknownSku[];
  qtyMissing: boolean;
  totalItems: number;
};

// ── small helpers ────────────────────────────────────────────────────────────

export function normName(s: string): string {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Robust numeric read: handles "4.", "1.234", "1,234.50", "1.234,50", "" → null. */
export function parseQty(raw: unknown): number | null {
  let s = String(raw ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let thousands = "";
  let decimal = "";
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) { decimal = "."; thousands = ","; } else { decimal = ","; thousands = "."; }
  } else if (lastDot >= 0) {
    thousands = /^\d{1,3}(\.\d{3})+$/.test(s) ? "." : "";
    decimal = thousands ? "" : ".";
  } else if (lastComma >= 0) {
    thousands = /^\d{1,3}(,\d{3})+$/.test(s) ? "," : "";
    decimal = thousands ? "" : ",";
  }
  let out = s;
  if (thousands) out = out.split(thousands).join("");
  if (decimal) out = out.replace(decimal, ".");
  out = out.replace(/^-/, "");
  const n = parseFloat(out);
  return Number.isFinite(n) ? n : null;
}

const UOM_RE = /^(pck|pcs|pc|bks|pack|dus(?:[-\s]?\d+)?|jrg|jerigen|jerrycan|box|bal|rim|bag|karton|ctn|kg|gr|gram|liter|ltr|botol|sachet|sct|karung|krt|tray|lsn|lusin|set)$/i;
const DUS_MULT_RE = /^dus[-\s]?(\d+)$/i;

export function isDusUom(uom: string): boolean { return DUS_MULT_RE.test(String(uom || "").trim()); }
export function dusMultiplier(uom: string): number | null {
  const m = String(uom || "").trim().match(DUS_MULT_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 1 ? n : null;
}
export function isPackagingName(name: string): boolean { return /^\s*dus\b/i.test(String(name || "")); }

export function detectEntity(textUpper: string): Entity | null {
  const clean = String(textUpper || "").replace(/\s+/g, "");
  if (clean.includes("BANGORBERANITERUKUR")) return "BBT";
  if (clean.includes("BANGORBERKEMBANGBERSAMA")) return "BBB";
  return null;
}

export function detectKind(textUpper: string): DocKind | null {
  const t = String(textUpper || "").toUpperCase();
  if (/RINCIAN\s+PEMINDAHAN|KODE\s*BARANG|GUDANG\s*TUJUAN/.test(t)) return "IT";
  if (/DELIVERY\s+ORDER|ITEM\s+NAME|CUSTOMER/.test(t)) return "DO";
  return null;
}

function kindFromFileName(name: string): DocKind | null {
  const n = String(name || "").toLowerCase();
  if (/rincian|pemindahan|beranit|berani/.test(n)) return "IT";
  if (/delivery|order|berkemb|berkembang/.test(n)) return "DO";
  return null;
}

function entityFromKind(kind: DocKind | null): Entity | null {
  return kind === "IT" ? "BBT" : kind === "DO" ? "BBB" : null;
}

// Header label → field. Order matters: check the most specific patterns first.
const HEADER_FIELDS: { field: string; re: RegExp }[] = [
  { field: "ref", re: /^no\.?\s*pemindahan/i },
  { field: "outlet", re: /^(gudang\s*tujuan\s*\/?\s*dari|gudang\s*tujuan|tujuan\s*\/?\s*dari|customer)/i },
  { field: "kode", re: /^(kode\s*barang|kode|item\s*code|kode\s*item)/i },
  { field: "name", re: /^(nama\s*barang|item\s*name|nama\s*item|item)/i },
  { field: "uom", re: /^(satuan|uom|unit)/i },
  { field: "qty", re: /^(kuantitas|quantity|qty|jumlah)/i },
  { field: "warehouse", re: /^gudang$/i },
  { field: "date", re: /^(tanggal|date)/i },
  { field: "ref", re: /^(number|no\.?|nomor|no\.?\s*dokumen)/i },
];

function headerFieldFor(label: string): string | null {
  const s = String(label || "").trim();
  if (!s) return null;
  for (const h of HEADER_FIELDS) if (h.re.test(s)) return h.field;
  return null;
}

// ── SKU resolution ───────────────────────────────────────────────────────────

type Resolver = {
  byKode: Map<string, string>;
  byName: Map<string, string>;
  resolve: (kode: string, name: string) => string | null;
};

function makeResolver(master: MasterDB): Resolver {
  const { kodeMap } = getDualLookupMaps(master);
  const byKode = new Map<string, string>();
  for (const [k, v] of Object.entries(kodeMap)) byKode.set(String(k).trim().toLowerCase(), String(v));
  const byName = new Map<string, string>();
  for (const sku of Object.keys(master.BOX_CAPACITY || {})) {
    byName.set(normName(sku), sku);
    // also index without a trailing variant marker so "(BBT)" lines still resolve
    byName.set(normName(sku.replace(/\((BBT|FREE|FREE ITEM)\)/gi, "")), sku);
  }
  const resolve = (kode: string, name: string): string | null => {
    const k = String(kode || "").trim().toLowerCase();
    if (k && byKode.has(k)) return byKode.get(k)!;
    const n = normName(name);
    if (n && byName.has(n)) return byName.get(n)!;
    // last resort: whole-word containment on the normalized name
    if (n.length >= 4) {
      for (const [key, sku] of byName) if (key && (key.includes(n) || n.includes(key)) && Math.min(key.length, n.length) >= 4) return sku;
    }
    return null;
  };
  return { byKode, byName, resolve };
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

async function parseExcel(file: File, master: MasterDB): Promise<FileParseResult> {
  const resolver = makeResolver(master);
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as any[][];

  let allText = "";
  for (const r of rows) for (const c of r) allText += String(c ?? "") + " ";
  const upper = allText.toUpperCase();
  const entity = detectEntity(upper) ?? entityFromKind(kindFromFileName(file.name));
  const kind = detectKind(upper) ?? kindFromFileName(file.name);

  // header row = first row with at least two recognised labels
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    let hits = 0;
    for (const c of rows[i]) if (headerFieldFor(String(c))) hits++;
    if (hits >= 2) { headerIdx = i; break; }
  }

  const warnings: ParseWarning[] = [];
  if (headerIdx < 0) {
    warnings.push("noRows");
    return { fileName: file.name, entity, kind, refs: [], groups: [], qtyColumnPresent: false, warnings, stats: { rows: rows.length, items: 0, resolved: 0 } };
  }

  const colField = new Map<number, string>();
  rows[headerIdx].forEach((label, idx) => {
    const f = headerFieldFor(String(label));
    if (f && ![...colField.values()].includes(f)) colField.set(idx, f);
  });
  const headerHasQty = [...colField.values()].includes("qty");

  const get = (row: any[], field: string): string => {
    for (const [idx, f] of colField) if (f === field) return String(row[idx] ?? "").trim();
    return "";
  };

  const groups: ScanGroup[] = [];
  let cur: ScanGroup | null = null;
  let ref = "", outlet = "", warehouse = "";
  let rowsSeen = 0, itemCount = 0, resolvedCount = 0, qtyValues = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!row.some((c) => String(c ?? "").trim())) continue;
    rowsSeen++;

    const vRef = get(row, "ref");
    const vOutlet = get(row, "outlet");
    const vWh = get(row, "warehouse");
    const vKode = get(row, "kode");
    const vName = get(row, "name");
    const vUom = get(row, "uom");
    const vQty = get(row, "qty");

    if (vRef) ref = vRef;
    if (vOutlet) outlet = vOutlet;
    if (vWh) warehouse = vWh;

    if (!vName && !vKode) continue;

    if (!cur || (vOutlet && cur.outletRaw !== outlet) || (vRef && cur.ref !== ref)) {
      cur = { id: `${file.name}#${groups.length + 1}`, kind: kind ?? "DO", entity, ref, outletRaw: outlet, warehouse, items: [], sourceFile: file.name };
      groups.push(cur);
    }
    if (cur.kind !== (kind ?? "DO")) cur.kind = kind ?? cur.kind;

    const sku = resolver.resolve(vKode, vName);
    const item: GroupItem = {
      sku,
      rawName: vName || vKode,
      kode: vKode,
      qty: parseQty(vQty),
      uom: vUom,
      packaging: isPackagingName(vName),
    };
    cur.items.push(item);
    itemCount++;
    if (sku) resolvedCount++;
    if (item.qty !== null) qtyValues++;
  }

  if (!groups.length) warnings.push("noRows");
  if (!entity) warnings.push("noEntity");
  // "has a quantity column" only counts when values were actually read — the ERP
  // PDF export keeps the header but drops every value.
  const qtyColumnPresent = headerHasQty && qtyValues > 0;
  if (!qtyColumnPresent) warnings.push("noQtyColumn");

  return {
    fileName: file.name,
    entity,
    kind,
    refs: [...new Set(groups.map((g) => g.ref).filter(Boolean))],
    groups,
    qtyColumnPresent,
    warnings,
    stats: { rows: rowsSeen, items: itemCount, resolved: resolvedCount },
  };
}

// ── PDF ──────────────────────────────────────────────────────────────────────
// Mirrors scanner.ts style: text items grouped into rows by y, but columns are
// resolved through the header row's x positions (exact for these ERP exports).
//
// The row tolerance is derived from the document's own line pitch instead of a
// hard 3 units: some pdfjs builds return compressed y coordinates, and a fixed
// tolerance would merge several table rows into one there.
function groupItemsIntoRows(items: any[]): { y: number; cells: { x: number; s: string }[] }[] {
  const ys: number[] = [];
  for (const it of items) {
    const s = String(it.str || "").trim();
    if (s) ys.push(it.transform[5]);
  }
  const sorted = [...ys].sort((a, b) => b - a);
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i - 1] - sorted[i];
    if (d > 0.5) diffs.push(d);
  }
  diffs.sort((a, b) => a - b);
  const pitch = diffs.length ? diffs[Math.floor(diffs.length * 0.3)] : 3;
  const yTolerance = Math.max(0.5, Math.min(3, pitch * 0.4));

  const rows: { y: number; cells: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    const x = it.transform[4];
    const y = it.transform[5];
    const s = String(it.str || "").trim();
    if (!s) continue;
    let row = rows.find((r) => Math.abs(r.y - y) < yTolerance);
    if (!row) { row = { y, cells: [] }; rows.push(row); }
    row.cells.push({ x, s });
  }
  rows.sort((a, b) => b.y - a.y);
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  return rows;
}

async function parsePdf(file: File, master: MasterDB): Promise<FileParseResult> {
  const resolver = makeResolver(master);
  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;

  const allRows: { y: number; cells: { x: number; s: string }[] }[] = [];
  let allText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as any[]) allText += String(it.str || "") + " ";
    allRows.push(...groupItemsIntoRows(tc.items as any[]));
  }
  const upper = allText.toUpperCase();
  const entity = detectEntity(upper) ?? entityFromKind(kindFromFileName(file.name));
  const kind = detectKind(upper) ?? kindFromFileName(file.name);

  // header row → x position per field
  let headerRow: { y: number; cells: { x: number; s: string }[] } | null = null;
  for (const r of allRows) {
    let hits = 0;
    for (const c of r.cells) if (headerFieldFor(c.s)) hits++;
    if (hits >= 2) { headerRow = r; break; }
  }

  const warnings: ParseWarning[] = [];
  if (!headerRow) {
    warnings.push("noRows");
    return { fileName: file.name, entity, kind, refs: [], groups: [], qtyColumnPresent: false, warnings, stats: { rows: allRows.length, items: 0, resolved: 0 } };
  }

  const cols: { field: string; x: number }[] = [];
  for (const c of headerRow.cells) {
    const f = headerFieldFor(c.s);
    if (f && !cols.some((x) => x.field === f)) cols.push({ field: f, x: c.x });
  }
  const headerHasQty = cols.some((c) => c.field === "qty");
  const minColX = Math.min(...cols.map((c) => c.x));

  const fieldAt = (x: number): string | null => {
    let best: { field: string; d: number } | null = null;
    for (const c of cols) {
      const d = Math.abs(c.x - x);
      if (!best || d < best.d) best = { field: c.field, d };
    }
    return best && best.d <= 40 ? best.field : null;
  };
  const REF_RE = /^(DO|IT)\.\d{4}\.\d{2}\.\d{5}$/;

  const headerY = headerRow.y;
  const groups: ScanGroup[] = [];
  let cur: ScanGroup | null = null;
  let ref = "", outlet = "", warehouse = "";
  let rowsSeen = 0, itemCount = 0, resolvedCount = 0, qtyValues = 0;

  for (const r of allRows) {
    if (r.y >= headerY) continue; // above the header = titles
    const vals: Record<string, string> = {};
    for (const c of r.cells) {
      const f = fieldAt(c.x);
      if (f && !vals[f]) vals[f] = c.s;
      // DO PDFs keep the order number in an unlabelled left column (x < first header)
      else if (!f && REF_RE.test(c.s.trim().toUpperCase()) && c.x <= minColX) vals.ref = c.s;
    }
    if (!Object.keys(vals).length) continue;
    rowsSeen++;

    if (vals.ref) ref = vals.ref;
    if (vals.outlet) outlet = vals.outlet;
    if (vals.warehouse) warehouse = vals.warehouse;

    const name = vals.name || "";
    const kode = vals.kode || "";
    if (!name && !kode) continue;

    if (!cur || (vals.outlet && cur.outletRaw !== outlet) || (vals.ref && cur.ref !== ref)) {
      cur = { id: `${file.name}#${groups.length + 1}`, kind: kind ?? "DO", entity, ref, outletRaw: outlet, warehouse, items: [], sourceFile: file.name };
      groups.push(cur);
    }

    const sku = resolver.resolve(kode, name);
    const item: GroupItem = {
      sku,
      rawName: name || kode,
      kode,
      qty: parseQty(vals.qty),
      uom: vals.uom || "",
      packaging: isPackagingName(name),
    };
    cur.items.push(item);
    itemCount++;
    if (sku) resolvedCount++;
    if (item.qty !== null) qtyValues++;
  }

  if (!groups.length) warnings.push("noRows");
  if (!entity) warnings.push("noEntity");
  const qtyColumnPresent = headerHasQty && qtyValues > 0;
  if (!qtyColumnPresent) warnings.push("noQtyColumn"); // expected for these ERP PDF exports

  return {
    fileName: file.name,
    entity,
    kind,
    refs: [...new Set(groups.map((g) => g.ref).filter(Boolean))],
    groups,
    qtyColumnPresent,
    warnings,
    stats: { rows: rowsSeen, items: itemCount, resolved: resolvedCount },
  };
}

// ── entry points ─────────────────────────────────────────────────────────────

export async function parseDocument(file: File, master: MasterDB): Promise<FileParseResult> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  try {
    if (ext === "xlsx" || ext === "xls") return await parseExcel(file, master);
    if (ext === "pdf") return await parsePdf(file, master);
    return {
      fileName: file.name, entity: null, kind: null, refs: [], groups: [],
      qtyColumnPresent: false, warnings: ["unsupportedExt"],
      stats: { rows: 0, items: 0, resolved: 0 },
    };
  } catch (e: any) {
    return {
      fileName: file.name, entity: null, kind: null, refs: [], groups: [],
      qtyColumnPresent: false, warnings: ["readError"], errorText: e?.message || String(e),
      stats: { rows: 0, items: 0, resolved: 0 },
    };
  }
}

export async function parseDocuments(files: File[], master: MasterDB): Promise<FileParseResult[]> {
  const out: FileParseResult[] = [];
  for (const f of files) out.push(await parseDocument(f, master));
  return out;
}

/**
 * Merge every parsed group into ONE group per matched outlet (Dashboard v2 decision:
 * an outlet receiving from both entities gets a single PL), then fuzzy-match the
 * outlet name against the Master Data outlet keys.
 */
export function mergeAndMatch(
  parsed: FileParseResult[],
  master: MasterDB,
  aliases?: Record<string, string>
): MultiParseResult {
  const outletKeys = Object.keys(master.OUTLET_INFO || {});
  const buckets = new Map<string, MergedGroup>();
  const unknown = new Map<string, UnknownSku>();
  let totalItems = 0;

  for (const fr of parsed) {
    for (const g of fr.groups) {
      const rawKey = g.outletRaw ? normalizeForBucket(g.outletRaw) : `${fr.fileName}#${g.id}`;
      const m = matchOutlet(g.outletRaw, outletKeys, aliases);
      // Merge decision: one PL per OUTLET, so confidently matched spellings land in the
      // same bucket even when the paperwork spells them differently ("Nagrak Cibubur"
      // vs "BBT - Nagrak Cibubur Pusat"). Unmatched names stay separated by raw text.
      const bucketKey = m.key && m.confidence !== "low" ? `K:${m.key}` : `R:${rawKey}`;

      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          id: bucketKey,
          outletRaws: [],
          match: m,
          refs: [], kinds: [], entities: [], sourceFiles: [], warehouses: [],
          items: [], qtyBySku: {}, qtyTotal: 0, warnings: [],
        };
        buckets.set(bucketKey, bucket);
      } else if (m.score > bucket.match.score) {
        bucket.match = m; // keep the strongest spelling for display
      }
      if (g.outletRaw && !bucket.outletRaws.includes(g.outletRaw)) bucket.outletRaws.push(g.outletRaw);
      if (g.ref && !bucket.refs.includes(g.ref)) bucket.refs.push(g.ref);
      if (!bucket.kinds.includes(g.kind)) bucket.kinds.push(g.kind);
      if (g.entity && !bucket.entities.includes(g.entity)) bucket.entities.push(g.entity);
      if (!bucket.sourceFiles.includes(g.sourceFile)) bucket.sourceFiles.push(g.sourceFile);
      if (g.warehouse && !bucket.warehouses.includes(g.warehouse)) bucket.warehouses.push(g.warehouse);

      for (const it of g.items) {
        bucket.items.push(it);
        totalItems++;
        if (!it.sku) {
          const uKey = `${normName(it.rawName)}|${it.kode}`;
          let u = unknown.get(uKey);
          if (!u) { u = { rawName: it.rawName, kode: it.kode, qtySum: 0, outlets: [], files: [] }; unknown.set(uKey, u); }
          u.qtySum += it.qty ?? 0;
          if (g.outletRaw && !u.outlets.includes(g.outletRaw)) u.outlets.push(g.outletRaw);
          if (!u.files.includes(g.sourceFile)) u.files.push(g.sourceFile);
          continue;
        }
        const q = it.qty ?? 0;
        bucket.qtyBySku[it.sku] = (bucket.qtyBySku[it.sku] || 0) + q;
        bucket.qtyTotal += q;
      }
    }
  }

  const merged = [...buckets.values()].map((b) => {
    const w: MergedWarning[] = [];
    if (b.sourceFiles.length > 1) w.push("mergedFiles");
    if (b.items.some((i) => i.qty === null)) w.push("qtyMissing");
    if (b.items.some((i) => isDusUom(i.uom))) w.push("satuanDus");
    if (b.items.some((i) => !i.sku)) w.push("unknownSku");
    if (b.items.some((i) => i.packaging)) w.push("packaging");
    // same physical item arriving under a DO name and its "(BBT)" twin
    const baseToSkus = new Map<string, Set<string>>();
    for (const it of b.items) {
      if (!it.sku) continue;
      const base = normName(it.sku.replace(/\((BBT|FREE|FREE ITEM)\)/gi, ""));
      if (!base) continue;
      if (!baseToSkus.has(base)) baseToSkus.set(base, new Set());
      baseToSkus.get(base)!.add(it.sku);
    }
    if ([...baseToSkus.values()].some((s) => s.size > 1)) w.push("variantClash");
    return { ...b, warnings: w };
  }).sort((a, b) => (a.outletRaws[0] || "").localeCompare(b.outletRaws[0] || ""));

  return {
    files: parsed,
    merged,
    unknownSkus: [...unknown.values()].sort((a, b) => b.qtySum - a.qtySum),
    qtyMissing: parsed.some((f) => !f.qtyColumnPresent),
    totalItems,
  };
}

function normalizeForBucket(raw: string): string {
  const s = String(raw || "").toUpperCase().replace(/\(.*?\)/g, " ").replace(/[^A-Z0-9\s]/g, " ");
  const toks = s.split(/\s+/).filter(Boolean).filter((t) => !["PT", "BBT", "BBB", "BANGOR"].includes(t));
  return toks.join(" ");
}
