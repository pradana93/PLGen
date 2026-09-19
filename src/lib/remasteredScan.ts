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
  ref: string;            // DO.2026.09.xxxxx / IT.2026.09.xxxxx
  outletRaw: string;      // scanned outlet text ("Bangor - Sitanala", "Gudang Vittoria Kalisari")
  company: "BBB" | "BBT"; // file-level company (per-outlet vote happens in outletResolver)
  results: ScanResult;    // kode-harvested lines for THIS section only
  lines: number;          // matched item rows (for company vote weighting)
};

const REF_RE = /\b(DO|IT)\.\d{4}\.\d{2}\.\d{5}\b/i;
const DATE_RE = /\d{1,2}\s+[A-Za-z]+\s+\d{4}/;

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

function newSection(ref: string, outletRaw: string, company: "BBB" | "BBT"): OutletSection {
  return { ref: ref.toUpperCase(), outletRaw, company, results: {}, lines: 0 };
}

export async function smartScanPdfSections(
  file: File, master: MasterDB
): Promise<{ sections: OutletSection[]; company: "BBB" | "BBT"; refs: string[] }> {
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
  const sections: OutletSection[] = [];
  let cur: OutletSection | null = null;
  for (const rows of pageRows) {
    for (const row of rows) {
      const joined = row.join(" ");
      const m = joined.match(REF_RE);
      if (m) {
        cur = newSection(m[0], outletFromHeaderLine(joined) || cur?.outletRaw || "", company);
        sections.push(cur);
        // Header row may itself carry an item (e.g. single-line DO + Poster row) — still try matching.
        if (matchRowInto(row, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
        continue;
      }
      if (!cur) continue; // ignore preface rows before first DO/IT
      if (matchRowInto(row, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
    }
  }
  // Fallback: if a section got zero rows (image PDFs), run line-tier within its page span.
  // Simplest robust fallback — if NO section matched anything, run legacy-style line scan
  // split by header lines across the whole text.
  if (!sections.some(s => Object.keys(s.results).length > 0)) {
    sections.length = 0;
    cur = null;
    for (const lines of pageLines) {
      for (const line of lines) {
        const m = line.match(REF_RE);
        if (m) {
          cur = newSection(m[0], outletFromHeaderLine(line) || cur?.outletRaw || "", company);
          sections.push(cur);
          if (matchLineInto(line, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
          continue;
        }
        if (!cur) continue;
        if (matchLineInto(line, kodeMap, skuMap, sortedKodes, sortedSkus, cur.results)) cur.lines++;
      }
    }
  }

  const refs = sections.map(s => s.ref);
  return { sections, company, refs };
}

export async function smartScanExcelSections(
  file: File, master: MasterDB
): Promise<{ sections: OutletSection[]; company: "BBB" | "BBT"; refs: string[] }> {
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
  for (const row of rows) {
    const cells = (row as any[]).filter(c => c !== null && c !== undefined && String(c).trim() !== "" && String(c).toLowerCase() !== "nan");
    if (cells.length === 0) continue;
    const joined = cells.map(c => String(c)).join(" ");
    const m = joined.match(REF_RE);
    if (m) {
      cur = newSection(m[0], outletFromHeaderLine(joined) || cur?.outletRaw || "", company);
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
  return { sections, company, refs: sections.map(s => s.ref) };
}
