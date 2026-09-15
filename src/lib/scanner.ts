// Ported 1:1 from addons.py smart_scan_pdf / smart_scan_file / get_dual_lookup_maps
// DO NOT CHANGE MAIN LOGIC — keep dual-tier KODE→SKU, silent filters, company verification, Kupon rim×5

import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";

// Set worker for pdfjs
// @ts-ignore
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorker;

import type { MasterDB } from "./packing";

export type ScanResult = Record<string, { qty: number; note: string }>;

export function getDualLookupMaps(master: MasterDB): { kodeMap: Record<string,string>, skuMap: Record<string,string> } {
  const kodeMap: Record<string,string> = {};
  const raw = master.KODE_BARANG || {};
  for (const [code, sku] of Object.entries(raw)) {
    kodeMap[String(code).toLowerCase()] = sku;
  }
  const skuMap: Record<string,string> = {};
  for (const sku of Object.keys(master.BOX_CAPACITY || {})) {
    skuMap[sku.toLowerCase()] = sku;
  }
  return { kodeMap, skuMap };
}

// Silent filter from addons.py: ignore @5 Liter etc.
function silentFilter(text: string): string {
  // (?:@\s*)?\d+(?:[,.]\d+)?\s*(?:gr|gram|kg|ml|ltr|liter|liters|l|oz)\b
  return text.replace(/(?:@\s*)?\d+(?:[,.]\d+)?\s*(?:gr|gram|kg|ml|ltr|liter|liters|l|oz)\b/gi, "");
}

function extractQty(cell: string, matchedKey: string, sku: string): number | null {
  let clean = cell.toLowerCase().replace(matchedKey.toLowerCase(), "").trim();
  clean = silentFilter(clean);
  clean = clean.replace(/\(\d+\)/g, "");
  clean = clean.replace(/\./g, "").replace(/,/g, "");
  const nums = clean.match(/(\d+)/g);
  if (!nums || nums.length === 0) return null;
  let qty = parseInt(nums[0], 10);
  if (isNaN(qty) || qty <= 0) return null;
  if (sku === "Kupon Umroh" && cell.toLowerCase().includes("rim")) qty *= 5;
  return qty;
}

function detectCompanyCode(allTextUpper: string): "BBB" | "BBT" | null {
  const clean = allTextUpper.replace(/\s+/g, "");
  if (clean.includes("BANGORBERANITERUKUR")) return "BBT";
  if (clean.includes("BANGORBERKEMBANGBERSAMA")) return "BBB";
  return null;
}

// PDF scan — mirrors addons.py smart_scan_pdf (text + fallback line logic, no table dependency)
export async function smartScanPdf(file: File, master: MasterDB): Promise<{ results: ScanResult, company: "BBB"|"BBT" } | null> {
  const { kodeMap, skuMap } = getDualLookupMaps(master);
  const sortedKodes = Object.keys(kodeMap).sort((a,b)=> b.length - a.length);
  const sortedSkus = Object.keys(skuMap).sort((a,b)=> b.length - a.length);

  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  let allTextUpper = "";
  const pageTexts: string[] = [];
  for (let i=1;i<=pdf.numPages;i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = (tc.items as any[]).map(it=> (it as any).str).join(" ");
    pageTexts.push(text);
    allTextUpper += text.toUpperCase() + "\n";
  }

  const company = detectCompanyCode(allTextUpper);
  if (!company) {
    throw new Error("Document does not belong to PT BANGOR BERKEMBANG BERSAMA or PT BANGOR BERANI TERUKUR.");
  }

  const results: ScanResult = {};

  // For each page, try line-by-line (pdfjs has no table structure, so we go line fallback directly)
  // We split each page text by newline and also try to handle rows where SKU and qty are in same line
  for (const text of pageTexts) {
    const lines = text.split(/\n|(?<=\.\s)/).flatMap(l=> l.split("\n"));
    // Also split by multiple spaces to simulate rows
    const rawLines = text.split("\n");
    const candidates = [...rawLines, ...lines];
    for (const line of candidates) {
      const lineLower = line.toLowerCase();
      if (lineLower.trim().length < 3) continue;
      let foundSku: string | null = null;
      let matchedKey: string | null = null;
      for (const k of sortedKodes) { if (lineLower.includes(k)) { foundSku = kodeMap[k]; matchedKey = k; break; } }
      if (!foundSku) for (const k of sortedSkus) { if (lineLower.includes(k)) { foundSku = skuMap[k]; matchedKey = k; break; } }
      if (foundSku && matchedKey) {
        // qty is after SKU in same line, like addons.py: after_sku = line_lower.split(matched_key,1)[-1]
        const after = lineLower.split(matchedKey)[1] || "";
        const qty = extractQty(after, "", foundSku) ?? extractQty(lineLower, matchedKey, foundSku);
        if (qty !== null && qty > 0) {
          if (results[foundSku]) results[foundSku].qty += qty;
          else results[foundSku] = { qty, note: "FILE_SCAN" };
        }
      }
    }
  }

  // If nothing found, try broader token scan: look for any row-like split by 2+ spaces
  if (Object.keys(results).length === 0) {
    for (const text of pageTexts) {
      const tokens = text.split(/\s{2,}|\t/);
      for (const tok of tokens) {
        const lower = tok.toLowerCase();
        let foundSku: string | null = null;
        let matchedKey: string | null = null;
        for (const k of sortedKodes) { if (lower.includes(k)) { foundSku = kodeMap[k]; matchedKey = k; break; } }
        if (!foundSku) for (const k of sortedSkus) { if (lower.includes(k)) { foundSku = skuMap[k]; matchedKey = k; break; } }
        if (foundSku && matchedKey) {
          const qty = extractQty(tok, matchedKey, foundSku);
          if (qty !== null && qty > 0) {
            if (results[foundSku]) results[foundSku].qty += qty;
            else results[foundSku] = { qty, note: "FILE_SCAN" };
          }
        }
      }
    }
  }

  return { results, company };
}

// Excel scan — mirrors addons.py smart_scan_file
export async function smartScanExcel(file: File, master: MasterDB): Promise<{ results: ScanResult, company: "BBB"|"BBT" } | null> {
  const { kodeMap, skuMap } = getDualLookupMaps(master);
  const sortedKodes = Object.keys(kodeMap).sort((a,b)=> b.length - a.length);
  const sortedSkus = Object.keys(skuMap).sort((a,b)=> b.length - a.length);

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Gather all text for company detection
  let allText = "";
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (const r of rows) allText += (r as any[]).join(" ") + " ";
  }
  const company = detectCompanyCode(allText.toUpperCase());
  if (!company) {
    throw new Error("Document does not belong to PT BANGOR BERKEMBANG BERSAMA or PT BANGOR BERANI TERUKUR.");
  }

  const results: ScanResult = {};
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (const row of rows) {
      const rowStr = (row as any[]).map(c=> String(c||"").trim()).join(" ").toLowerCase();
      if (!rowStr.trim()) continue;
      let foundSku: string | null = null;
      let matchedKey: string | null = null;
      for (const k of sortedKodes) { if (rowStr.includes(k)) { foundSku = kodeMap[k]; matchedKey = k; break; } }
      if (!foundSku) for (const k of sortedSkus) { if (rowStr.includes(k)) { foundSku = skuMap[k]; matchedKey = k; break; } }
      if (foundSku && matchedKey) {
        for (const cell of (row as any[]).slice(1)) {
          if (cell == null || String(cell).trim() === "") continue;
          const qty = extractQty(String(cell), matchedKey, foundSku);
          // Also check raw cell for rim
          if (qty !== null && qty > 0) {
            const finalQty = qty;
            if (results[foundSku]) results[foundSku].qty += finalQty;
            else results[foundSku] = { qty: finalQty, note: "FILE_SCAN" };
            break;
          }
        }
        // Fallback: try extracting from whole row string after SKU
        if (!results[foundSku] || results[foundSku].qty === 0) {
          const after = rowStr.split(matchedKey)[1] || "";
          const qty2 = extractQty(after, "", foundSku);
          if (qty2 !== null && qty2 > 0) {
            if (results[foundSku]) results[foundSku].qty += qty2;
            else results[foundSku] = { qty: qty2, note: "FILE_SCAN" };
          }
        }
      }
    }
  }

  return { results, company };
}
