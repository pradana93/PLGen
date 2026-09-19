// Remastered Dashboard section scanner — ADDITIVE ONLY.
// Splits a multi-DO/IT file into per-outlet sections, then runs the SAME kode-first
// tiers as smartScanPdf/smartScanExcel (scanner.ts) per section row. Unmapped box SKUs
// (Dus Patty Logo L/S, Dus Medium, …) are ignored by design — packing-team consumables.
// Existing scanner.ts functions are byte-for-byte untouched (only 3 symbols newly exported).
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorker;

import { getDualLookupMaps, silentFilter, detectCompanyCode, groupItemsIntoRows } from "./scanner";
import type { MasterDB } from "./packing";
import type { ScanResult } from "./scanner";

export type OutletSection = {
  key: string;            // merge key: REF, or outlet-derived for DATExOUTLET sections
  ref: string;            // DO./IT. ref, or "" when the file carries none
  outletRaw: string;      // scanned outlet text ("Bangor - Sitanala", "Kalisari")
  company: "BBB" | "BBT"; // file-level company (per-outlet vote happens in outletResolver)
  results: ScanResult;    // kode-harvested lines for THIS section only
  lines: number;          // matched item rows (for company vote weighting)
  unpaired: number;       // item slots with no qty found (surfaced as warnings, never exported silently)
};

const REF_RE = /\b(DO|IT)\.\d{4}\.\d{2}\.\d{5}\b/i;
const REF_RE_NOSPACE = /(DO|IT)\.\d{4}\.\d{2}\.\d{5}/i;
const DATE_RE = /\d{1,2}\s+[A-Za-z]+\s+\d{4}/;

export type ScanDebug = { pages: number; textChars: number; rowsTotal: number; refsSeen: number; textSample: string; rowSample: string[] };

// pdfjs often tokenizes punctuation ("DO . 2026 . 09 . 02687") — collapse
// whitespace before REF matching (detection only; outlet parsing keeps spacing).
export function findRef(s: string): string | null {
  const m = s.match(REF_RE) || s.replace(/\s+/g, "").match(REF_RE_NOSPACE);
  return m ? m[0].toUpperCase() : null;
}

// Outlet = text after the date on a DO/IT header line; "Gudang Vittoria X" kept raw
// (outletResolver.normalizeOutlet strips the prefix at resolve time).
export function outletFromHeaderLine(line: string): string {
  const dm = line.match(DATE_RE);
  if (!dm || dm.index === undefined) return "";
  return line.slice(dm.index + dm[0].length).replace(/^[\s\-–—|:;.,]+/, "").trim();
}

// Tier matcher — MIRROR of scanner.ts table-tier cell loop. Keep in sync; do not diverge.
function matchRowInto(
  row: string[], kodeMap: Record<string, string>, skuMap: Record<string, string>,
  sortedKodes: string[], sortedSkus: string[], out: ScanResult
): boolean {
  const rowStr = row.map(c => String(c).trim().toLowerCase()).filter(Boolean).join(" ");
  if (!rowStr) return false;
  let itemName: string | null = null;
  let matchedKey: string | null = null;
  for (const k of sortedKodes) { if (rowStr.includes(k)) { itemName = kodeMap[k]; matchedKey = k; break; } }
  if (!itemName) for (const k of sortedSkus) { if (rowStr.includes(k)) { itemName = skuMap[k]; matchedKey = k; break; } }
  if (!itemName || !matchedKey) return false;
  for (const cell of row.slice(1)) {
    if (!cell) continue;
    const cellStr = String(cell).trim().toLowerCase();
    let cleanCell = cellStr.replace(matchedKey.toLowerCase(), "").trim();
    cleanCell = silentFilter(cleanCell);
    cleanCell = cleanCell.replace(/\(\d+\)/g, "");
    cleanCell = cleanCell.replace(/\./g, "").replace(/,/g, "");
    const nums = cleanCell.match(/(\d+)/g);
    if (nums && nums.length > 0) {
      const qty = parseInt(nums[0], 10);
      if (isNaN(qty)) continue;
      const finalQty = itemName === "Kupon Umroh" && cellStr.includes("rim") ? qty * 5 : qty;
      if (out[itemName]) out[itemName].qty += finalQty;
      else out[itemName] = { qty: finalQty, note: "" };
      return true;
    }
  }
  return false;
}

// Line-fallback matcher — MIRROR of scanner.ts fallback tier. Keep in sync.
function matchLineInto(
  line: string, kodeMap: Record<string, string>, skuMap: Record<string, string>,
  sortedKodes: string[], sortedSkus: string[], out: ScanResult
): boolean {
  const lineLower = line.toLowerCase();
  let itemName: string | null = null;
  let matchedKey: string | null = null;
  for (const k of sortedKodes) { if (lineLower.includes(k)) { itemName = kodeMap[k]; matchedKey = k; break; } }
  if (!itemName) for (const k of sortedSkus) { if (lineLower.includes(k)) { itemName = skuMap[k]; matchedKey = k; break; } }
  if (!itemName || !matchedKey) return false;
  const afterSku = lineLower.split(matchedKey)[1] ?? "";
  let cleanAfter = silentFilter(afterSku);
  cleanAfter = cleanAfter.replace(/\(\d+\)/g, "");
  cleanAfter = cleanAfter.replace(/\./g, "").replace(/,/g, "");
  const nums = cleanAfter.match(/(\d+)/g);
  if (nums && nums.length > 0) {
    const qty = parseInt(nums[0], 10);
    if (isNaN(qty)) return false;
    const finalQty = itemName === "Kupon Umroh" && afterSku.includes("rim") ? qty * 5 : qty;
    if (out[itemName]) out[itemName].qty += finalQty;
    else out[itemName] = { qty: finalQty, note: "" };
    return true;
  }
  return false;
}

function newSection(ref: string, outletRaw: string, company: "BBB" | "BBT", key?: string): OutletSection {
  return { key: key || ref.toUpperCase(), ref: ref.toUpperCase(), outletRaw, company, results: {}, lines: 0, unpaired: 0 };
}

const DATE_ONLY_RE = /^\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*$/;
const HAS_LETTER_RE = /[a-z]/i;
const NON_QTY_CHARS_RE = /[^0-9.,\s]/;

// KODE-tier resolve only (DATE path): box-SKU and name rows must never open slots,
// otherwise "BOLOGNESE SAUCE 500GR"-style name lines double-slot against their kode line.
function resolveKode(lineLower: string, kodeMap: Record<string, string>, sortedKodes: string[]): { sku: string; key: string } | null {
  for (const k of sortedKodes) {
    if (lineLower.includes(k)) return { sku: kodeMap[k], key: k };
  }
  return null;
}

// Pure standalone qty ("36", "1.000") — anything with other chars (DUS-20, (20), 500GR, dates) is rejected.
function pureQty(t: string): number | null {
  if (NON_QTY_CHARS_RE.test(t)) return null;
  const digits = t.replace(/[. ,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = parseInt(digits, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

type Slot = { sku: string; qty: number | null; note: string; ignored?: boolean };
type OpenSec = { sec: OutletSection; slots: Slot[]; pool: number[] };

// Unmapped KODE-format lines (box SKUs: BBPCK00009/09F/10/10F/41/41F …) open
// placeholder slots: they still consume exactly one pool qty (their own row's),
// keeping every later pairing aligned. Placeholders never reach results.
// Proven by simulation: without this, one ignored box line shifts all following qtys.
const KODE_FORMAT_RE = /^[A-Z]{2,}[0-9]{4,}[A-Z]?$/;

// DATE+OUTLET line-tier: for report PDFs whose headers are "19 SEP 2026 / OUTLET"
// with no DO/IT tokens, and whose quantities extract as standalone number rows.
// Order of checks per line: REF → date-only → outlet states → inline kode+qty →
// kode slot → pure-number pool → ignore (names, units, box SKUs, preface).
function sectionByDateLines(
  lines: string[], company: "BBB" | "BBT",
  kodeMap: Record<string, string>, sortedKodes: string[]
): OutletSection[] {
  const sections: OutletSection[] = [];
  const byKey = new Map<string, OpenSec>();
  let n = 0;
  const open = (outletRaw: string): OpenSec => {
    const norm = outletRaw.toUpperCase().replace(/\s+/g, " ").trim();
    const key = norm || `UNKNOWN-${++n}`;
    let o = byKey.get(key);
    if (!o) {
      o = { sec: newSection("", outletRaw, company, key), slots: [], pool: [] };
      byKey.set(key, o);
      sections.push(o.sec);
    }
    return o;
  };
  let cur: OpenSec | null = null;
  let pendingDate = false;
  let pendingDest = false;
  const isWarehouse = (t: string) => /gudang/i.test(t);

  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (!t) continue;
    const ref = findRef(t);
    if (ref) {
      cur = open(outletFromHeaderLine(t));
      cur.sec.ref = ref;
      cur.sec.key = ref;
      pendingDate = false;
      pendingDest = false;
      // Header may carry an inline item — harvest it filled.
      const tmp: ScanResult = {};
      if (matchLineInto(t, kodeMap, {}, sortedKodes, [], tmp)) {
        for (const [sku, r] of Object.entries(tmp)) {
          cur.slots.push({ sku, qty: (r as any).qty, note: "" });
        }
      }
      continue;
    }
    if (DATE_ONLY_RE.test(t)) { pendingDate = true; pendingDest = false; continue; }
    const lower = t.toLowerCase();
    if (pendingDate) {
      if (!HAS_LETTER_RE.test(t)) {
        // stray number right after a date — pool it if a section is open, else drop
        const q = pureQty(t);
        if (q !== null && cur) cur.pool.push(q);
        continue;
      }
      if (isWarehouse(t) && !resolveKode(lower, kodeMap, sortedKodes)) { pendingDest = true; continue; }
      const hit = resolveKode(lower, kodeMap, sortedKodes);
      if (hit) {
        // item line directly after date (outlet unknown) — never lose items
        cur = open("");
        const tmp: ScanResult = {};
        if (matchLineInto(t, kodeMap, {}, sortedKodes, [], tmp) && Object.keys(tmp).length) {
          for (const [sku, r] of Object.entries(tmp)) cur.slots.push({ sku, qty: (r as any).qty, note: "" });
        } else {
          cur.slots.push({ sku: hit.sku, qty: null, note: "" });
        }
        pendingDate = false;
        continue;
      }
      if (KODE_FORMAT_RE.test(t.toUpperCase().replace(/\s+/g, ""))) {
        // unmapped kode-format line (box SKU) where outlet was expected — keep as
        // placeholder under an unknown outlet so pool alignment survives
        cur = open("");
        cur.slots.push({ sku: "", qty: null, note: "", ignored: true });
        pendingDate = false;
        continue;
      }
      cur = open(t);
      pendingDate = false;
      continue;
    }
    if (pendingDest) {
      const hit = resolveKode(lower, kodeMap, sortedKodes);
      if (hit) {
        cur = open("");
        cur.slots.push({ sku: hit.sku, qty: null, note: "" });
        pendingDest = false;
        continue;
      }
      if (KODE_FORMAT_RE.test(t.toUpperCase().replace(/\s+/g, ""))) {
        cur = open("");
        cur.slots.push({ sku: "", qty: null, note: "", ignored: true });
        pendingDest = false;
        continue;
      }
      if (HAS_LETTER_RE.test(t)) { cur = open(t); pendingDest = false; continue; }
      continue;
    }
    if (!cur) continue;
    // inline kode+qty on one line (filled slot, consumes no pool)
    const tmp: ScanResult = {};
    if (matchLineInto(t, kodeMap, {}, sortedKodes, [], tmp) && Object.keys(tmp).length) {
      for (const [sku, r] of Object.entries(tmp)) cur.slots.push({ sku, qty: (r as any).qty, note: "" });
      continue;
    }
    const hit = resolveKode(lower, kodeMap, sortedKodes);
    if (hit) { cur.slots.push({ sku: hit.sku, qty: null, note: "" }); continue; }
    if (KODE_FORMAT_RE.test(t.toUpperCase().replace(/\s+/g, ""))) {
      cur.slots.push({ sku: "", qty: null, note: "", ignored: true });
      continue;
    }
    const q = pureQty(t);
    if (q !== null) { cur.pool.push(q); continue; }
    // else: name/unit/box-name/preface row — ignored by design
  }

  // positional zip: pending slots consume pool in order; leftovers counted, never guessed
  for (const o of byKey.values()) {
    let pi = 0;
    for (const s of o.slots) {
      if (s.qty !== null) continue;
      if (pi < o.pool.length) { s.qty = o.pool[pi++]; }
    }
    const filled = o.slots.filter(s => s.qty !== null && (s.qty as number) > 0 && !s.ignored);
    o.sec.unpaired = o.slots.filter(s => s.qty === null && !s.ignored).length;
    for (const s of filled) {
      const q = s.qty as number;
      if (o.sec.results[s.sku]) o.sec.results[s.sku].qty += q;
      else o.sec.results[s.sku] = { qty: q, note: s.note };
    }
    o.sec.lines = filled.length;
  }
  return sections;
}

export async function smartScanPdfSections(
  file: File, master: MasterDB
): Promise<{ sections: OutletSection[]; company: "BBB" | "BBT"; refs: string[]; debug: ScanDebug }> {
  const { kodeMap, skuMap } = getDualLookupMaps(master);
  const sortedKodes = Object.keys(kodeMap).sort((a, b) => b.length - a.length);
  const sortedSkus = Object.keys(skuMap).sort((a, b) => b.length - a.length);

  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;

  let allTextUpper = "";
  const pageRows: string[][][] = [];
  const pageLines: string[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = (tc.items as any[]).map((it: any) => it.str).join("\n");
    allTextUpper += text.toUpperCase() + "\n";
    pageRows.push(groupItemsIntoRows(tc.items as any[]));
    pageLines.push(text.split("\n"));
  }

  const company = detectCompanyCode(allTextUpper);
  if (!company) {
    throw new Error("Document does not belong to PT BANGOR BERKEMBANG BERSAMA or PT BANGOR BERANI TERUKUR.");
  }

  // Cut sections at DO/IT header rows (row-tier), tracking outlet per section.
  // Header detect is whitespace-tolerant (findRef); item matching mirrors scanner.ts.
  const sections: OutletSection[] = [];
  let cur: OutletSection | null = null;
  let refsSeen = 0;
  const rowsTotal = pageRows.reduce((a, r) => a + r.length, 0);
  for (const rows of pageRows) {
    for (const row of rows) {
      const joined = row.join(" ");
      const ref = findRef(joined);
      if (ref) {
        refsSeen++;
        cur = newSection(ref, outletFromHeaderLine(joined) || cur?.outletRaw || "", company);
        sections.push(cur);
        // Header row may itself carry an item (e.g. single-line DO + Poster row) — still try matching.
        if (matchRowInto(row, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
        else if (matchLineInto(joined, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
        continue;
      }
      if (!cur) continue; // ignore preface rows before first DO/IT
      if (matchRowInto(row, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
      // Same-row line fallback: single-cell rows (row.slice(1) empty) get line-tier treatment.
      else if (matchLineInto(joined, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
    }
  }
  // Fallback: DATE+OUTLET line-tier. Covers report PDFs whose headers carry no
  // DO/IT tokens and whose quantities extract as standalone number rows.
  if (!sections.some(s => Object.keys(s.results).length > 0)) {
    const flatLines: string[] = [];
    for (const lines of pageLines) for (const ln of lines) flatLines.push(ln);
    const dated = sectionByDateLines(flatLines, company, kodeMap, sortedKodes);
    sections.length = 0;
    for (const s of dated) sections.push(s);
  }

  const refs = sections.map(s => s.ref).filter(Boolean);
  const flatRows = pageRows.flat();
  return {
    sections, company, refs,
    debug: {
      pages: pageRows.length, textChars: allTextUpper.length, rowsTotal,
      refsSeen,
      textSample: allTextUpper.slice(0, 2000),
      rowSample: flatRows.slice(0, 30).map(r => r.join(" | ")),
    },
  };
}

export async function smartScanExcelSections(
  file: File, master: MasterDB
): Promise<{ sections: OutletSection[]; company: "BBB" | "BBT"; refs: string[]; debug: ScanDebug }> {
  const { kodeMap, skuMap } = getDualLookupMaps(master);
  const sortedKodes = Object.keys(kodeMap).sort((a, b) => b.length - a.length);
  const sortedSkus = Object.keys(skuMap).sort((a, b) => b.length - a.length);

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

  let allText = "";
  for (const r of rows) for (const c of r) allText += String(c ?? "") + " ";
  allText = allText.toUpperCase();
  const company = detectCompanyCode(allText);
  if (!company) {
    throw new Error("Document does not belong to PT BANGOR BERKEMBANG BERSAMA or PT BANGOR BERANI TERUKUR.");
  }

  const sections: OutletSection[] = [];
  let cur: OutletSection | null = null;
  let refsSeen = 0;
  for (const row of rows) {
    const cells = (row as any[]).filter(c => c !== null && c !== undefined && String(c).trim() !== "" && String(c).toLowerCase() !== "nan");
    if (cells.length === 0) continue;
    const joined = cells.map(c => String(c)).join(" ");
    const ref = findRef(joined);
    if (ref) {
      refsSeen++;
      cur = newSection(ref, outletFromHeaderLine(joined) || cur?.outletRaw || "", company);
      sections.push(cur);
    }
    if (!cur) continue;
    const strRow = (row as any[]).map(c => String(c ?? ""));
    // MIRROR of smartScanExcel per-row tier (qty<=0 skipped, note FILE_SCAN).
    const rowStr = strRow.map(c => c.trim().toLowerCase()).filter(Boolean).join(" ");
    let itemName: string | null = null;
    let matchedKey: string | null = null;
    for (const k of sortedKodes) { if (rowStr.includes(k)) { itemName = kodeMap[k]; matchedKey = k; break; } }
    if (!itemName) for (const k of sortedSkus) { if (rowStr.includes(k)) { itemName = skuMap[k]; matchedKey = k; break; } }
    if (itemName && matchedKey) {
      for (const cell of strRow.slice(1)) {
        if (cell == null || String(cell).trim() === "" || String(cell).toLowerCase() === "nan") continue;
        let cleanCell = String(cell).toLowerCase().replace(matchedKey.toLowerCase(), "");
        cleanCell = silentFilter(cleanCell);
        cleanCell = cleanCell.replace(/\(\d+\)/g, "");
        cleanCell = cleanCell.replace(/\./g, "").replace(/,/g, "");
        const nums = cleanCell.match(/(\d+)/g);
        if (nums && nums.length > 0) {
          let qty = parseInt(nums[0], 10);
          if (isNaN(qty) || qty <= 0) continue;
          const cellValLower = String(cell).toLowerCase();
          if (itemName === "Kupon Umroh" && cellValLower.includes("rim")) qty *= 5;
          if (cur.results[itemName]) cur.results[itemName].qty += qty;
          else cur.results[itemName] = { qty, note: "FILE_SCAN" };
          cur.lines++;
          break;
        }
      }
    }
  }
  return {
    sections, company, refs: sections.map(s => s.ref),
    debug: {
      pages: 1, textChars: allText.length, rowsTotal: rows.length, refsSeen,
      textSample: allText.slice(0, 2000),
      rowSample: rows.slice(0, 30).map(r => (r as any[]).map(c => String(c ?? "")).join(" | ")),
    },
  };
}
