// Exact 1:1 port of addons.py get_dual_lookup_maps / smart_scan_pdf / smart_scan_file
// DO NOT CHANGE MAIN LOGIC — preserve dual-tier KODE→SKU, silent filters, company verification, rim×5, first number, table+fallback

import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorker;

import type { MasterDB } from "./packing";

export type ScanResult = Record<string, { qty: number; note: string }>;

export function getDualLookupMaps(master: MasterDB): { kodeMap: Record<string,string>, skuMap: Record<string,string> } {
  const kodeMap: Record<string,string> = {};
  const raw = (master as any).KODE_BARANG || {};
  for (const [code, sku] of Object.entries(raw)) {
    kodeMap[String(code).toLowerCase()] = sku as string;
  }
  const skuMap: Record<string,string> = {};
  for (const sku of Object.keys(master.BOX_CAPACITY || {})) {
    skuMap[sku.toLowerCase()] = sku;
  }
  return { kodeMap, skuMap };
}

function silentFilter(text: string): string {
  return text.replace(/(?:@\s*)?\d+(?:[,.]\d+)?\s*(?:gr|gram|kg|ml|ltr|liter|liters|l|oz)\b/gi, "");
}

function detectCompanyCode(allTextUpper: string): "BBB" | "BBT" | null {
  const clean = allTextUpper.replace(/\s+/g, "");
  if (clean.includes("BANGORBERANITERUKUR")) return "BBT";
  if (clean.includes("BANGORBERKEMBANGBERSAMA")) return "BBB";
  return null;
}

// Group pdfjs text items into rows by y-coordinate (approximate pdfplumber table row)
function groupItemsIntoRows(items: any[], yTolerance = 3): string[][] {
  // items: {str, transform: [a,b,c,d,x,y]}
  const rows: { y: number, items: {x:number, str:string}[] }[] = [];
  for (const it of items) {
    const x = it.transform[4];
    const y = it.transform[5];
    const str = String(it.str || "").trim();
    if (!str) continue;
    let row = rows.find(r => Math.abs(r.y - y) < yTolerance);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, str });
  }
  // Sort rows top to bottom (y descending in PDF coords)
  rows.sort((a,b)=> b.y - a.y);
  return rows.map(r => {
    r.items.sort((a,b)=> a.x - b.x);
    return r.items.map(it=> it.str);
  });
}

export async function smartScanPdf(file: File, master: MasterDB): Promise<{ results: ScanResult, company: "BBB"|"BBT" } | null> {
  const { kodeMap, skuMap } = getDualLookupMaps(master);
  const sortedKodes = Object.keys(kodeMap).sort((a,b)=> b.length - a.length);
  const sortedSkus = Object.keys(skuMap).sort((a,b)=> b.length - a.length);

  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;

  // Step 1: collect allTextUpper for company verification (like pdfplumber all_text_caps)
  let allTextUpper = "";
  const pageTexts: string[] = [];
  const pageRows: string[][][] = []; // per page rows
  for (let i=1;i<=pdf.numPages;i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = (tc.items as any[]).map((it:any)=> it.str).join(" ");
    pageTexts.push(text);
    allTextUpper += text.toUpperCase() + "\n";
    // Also build rows for table emulation
    const rows = groupItemsIntoRows(tc.items as any[]);
    pageRows.push(rows);
  }

  const company = detectCompanyCode(allTextUpper);
  if (!company) {
    throw new Error("Document does not belong to PT BANGOR BERKEMBANG BERSAMA or PT BANGOR BERANI TERUKUR.");
  }

  const scannedResults: ScanResult = {};

  // Step 2: Try table extraction first (emulated via grouped rows)
  for (let p=0;p<pdf.numPages;p++) {
    const rows = pageRows[p];
    if (!rows || rows.length===0) continue;
    for (const row of rows) {
      // row is string[] cells
      const rowStr = row.map(c=> String(c).trim().toLowerCase()).filter(Boolean).join(" ");
      if (!rowStr) continue;
      let itemName: string | null = null;
      let matchedKey: string | null = null;
      for (const k of sortedKodes) { if (rowStr.includes(k)) { itemName = kodeMap[k]; matchedKey = k; break; } }
      if (!itemName) for (const k of sortedSkus) { if (rowStr.includes(k)) { itemName = skuMap[k]; matchedKey = k; break; } }
      if (itemName && matchedKey) {
        //Like Python: for cell in row[1:]:
        for (const cell of row.slice(1)) {
          if (!cell) continue;
          const cellStr = String(cell).trim().toLowerCase();
          let cleanCell = cellStr.replace(matchedKey.toLowerCase(), "").trim();
          cleanCell = silentFilter(cleanCell);
          cleanCell = cleanCell.replace(/\(\d+\)/g, "");
          cleanCell = cleanCell.replace(/\./g, "").replace(/,/g, "");
          const nums = cleanCell.match(/(\d+)/g);
          if (nums && nums.length>0) {
            let qty = parseInt(nums[0], 10);
            if (isNaN(qty)) continue;
            if (itemName === "Kupon Umroh" && cellStr.includes("rim")) qty *= 5;
            // PIRATE_MODE false in WebApp
            if (scannedResults[itemName]) scannedResults[itemName].qty += qty;
            else scannedResults[itemName] = { qty, note: "" }; // PDF note is "" like Python
            break; // correctly break cell loop per Python
          }
        }
      }
    }
  }

  // Step 3: Fallback line-by-line if no results (exactly like Python: if not scanned_results)
  if (Object.keys(scannedResults).length === 0) {
    for (const text of pageTexts) {
      const lines = text.split("\n");
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        let itemName: string | null = null;
        let matchedKey: string | null = null;
        for (const k of sortedKodes) { if (lineLower.includes(k)) { itemName = kodeMap[k]; matchedKey = k; break; } }
        if (!itemName) for (const k of sortedSkus) { if (lineLower.includes(k)) { itemName = skuMap[k]; matchedKey = k; break; } }
        if (itemName && matchedKey) {
          const afterSku = lineLower.split(matchedKey)[1] ?? "";
          let cleanAfter = silentFilter(afterSku);
          cleanAfter = cleanAfter.replace(/\(\d+\)/g, "");
          cleanAfter = cleanAfter.replace(/\./g, "").replace(/,/g, "");
          const nums = cleanAfter.match(/(\d+)/g);
          if (nums && nums.length>0) {
            let qty = parseInt(nums[0], 10);
            if (isNaN(qty)) continue;
            if (itemName === "Kupon Umroh" && afterSku.includes("rim")) qty *= 5;
            if (scannedResults[itemName]) scannedResults[itemName].qty += qty;
            else scannedResults[itemName] = { qty, note: "" };
          }
        }
      }
    }
  }

  return { results: scannedResults, company };
}

export async function smartScanExcel(file: File, master: MasterDB): Promise<{ results: ScanResult, company: "BBB"|"BBT" } | null> {
  const { kodeMap, skuMap } = getDualLookupMaps(master);
  const sortedKodes = Object.keys(kodeMap).sort((a,b)=> b.length - a.length);
  const sortedSkus = Object.keys(skuMap).sort((a,b)=> b.length - a.length);

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Python uses pd.read_excel without sheet_name -> first sheet only
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

  // Company detection: " ".join(map(str, df.values.flatten())).upper()
  let allText = "";
  for (const r of rows) for (const c of r) allText += String(c ?? "") + " ";
  allText = allText.toUpperCase();
  const company = detectCompanyCode(allText);
  if (!company) {
    throw new Error("Document does not belong to PT BANGOR BERKEMBANG BERSAMA or PT BANGOR BERANI TERUKUR.");
  }

  const scannedResults: ScanResult = {};
  for (const row of rows) {
    // Python: row_str = " ".join([str(c).strip().lower() for c in row if pd.notna(c)])
    const cells = (row as any[]).filter(c => c !== null && c !== undefined && String(c).trim() !== "" && String(c).toLowerCase() !== "nan");
    if (cells.length === 0) continue;
    const rowStr = cells.map(c=> String(c).trim().toLowerCase()).join(" ");
    let itemName: string | null = null;
    let matchedKey: string | null = null;
    for (const k of sortedKodes) { if (rowStr.includes(k)) { itemName = kodeMap[k]; matchedKey = k; break; } }
    if (!itemName) for (const k of sortedSkus) { if (rowStr.includes(k)) { itemName = skuMap[k]; matchedKey = k; break; } }
    if (itemName && matchedKey) {
      // For cell in row[1:]:
      for (const cell of (row as any[]).slice(1)) {
        if (cell == null || String(cell).trim() === "" || String(cell).toLowerCase() === "nan") continue;
        let cleanCell = String(cell).toLowerCase().replace(matchedKey.toLowerCase(), "");
        cleanCell = silentFilter(cleanCell);
        cleanCell = cleanCell.replace(/\(\d+\)/g, "");
        cleanCell = cleanCell.replace(/\./g, "").replace(/,/g, "");
        const nums = cleanCell.match(/(\d+)/g);
        if (nums && nums.length>0) {
          let qty = parseInt(nums[0], 10);
          if (isNaN(qty) || qty <=0) continue;
          const cellValLower = String(cell).toLowerCase();
          if (itemName === "Kupon Umroh" && cellValLower.includes("rim")) qty *= 5;
          if (scannedResults[itemName]) scannedResults[itemName].qty += qty;
          else scannedResults[itemName] = { qty, note: "FILE_SCAN" };
          break;
        }
      }
    }
  }

  return { results: scannedResults, company };
}
