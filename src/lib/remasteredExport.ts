// Remastered Dashboard multi-sheet export — ADDITIVE ONLY.
// One workbook, one FULL PL sheet per outlet, each sheet mirroring the exportPackingList
// layout (exportExcel.ts) section-for-section. exportExcel.ts itself is untouched.
// Shared math (buildDisplayRows, weights, delivery date) imported from packing.ts.
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Box, Order, buildDisplayRows, getDeliveryDateWIB } from "./packing";

export type RemasteredSheet = {
  tabName: string;       // sanitized outlet tab
  outlet: string;        // canonical outlet
  boxes: Box[];          // final reviewed koli (per-outlet calculateBoxes + review)
  order: Order;          // per-outlet order (packed qty)
  companyCode: "BBB" | "BBT";
  deliveryNo: string;    // pre-issued PL/{CODE}/… sequential per company
  sourceRef: string;     // DO./IT. ref for this outlet
};

const NAVY = "FF2C3E50";
const ORANGE = "FFF39C12";
const WARM_LIGHT = "FFFAF7F2";
const MID_GRAY = "FF7F8C8D";
const LIGHT_LINE = "FFD5D8DC";
const WHITE = "FFFFFFFF";

const thin = { style: "thin" as const };
const medium = { style: "medium" as const };

// Renders one full PL sheet — layout mirrors exportPackingList sections 1-6 + footer.
export function renderRemasteredSheet(
  wb: ExcelJS.Workbook, tabName: string, s: RemasteredSheet,
  master: any, checkerDisplay: string, preparedBy: string | undefined, deliveryDate: string
) {
  const ws = wb.addWorksheet(tabName);
  const totalWeight = Object.entries(s.order).reduce((acc, [sku, data]) => {
    const w = master.ITEM_WEIGHT_GRAMS?.[sku] || 0;
    return acc + ((data as any).qty * w) / 1000;
  }, 0);
  const outletInfo = master.OUTLET_INFO?.[s.outlet.toUpperCase()] || {};
  const receiverAddr = outletInfo.address || "—";
  const receiverPhone = outletInfo.phone || "—";
  const totalKoli = s.boxes.length;

  ws.pageSetup.paperSize = 9 as any;
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.45, bottom: 0.6, header: 0.3, footer: 0.35 };
  ws.pageSetup.printTitlesRow = "1:2";
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 9;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 28;

  const fill = (cell: ExcelJS.Cell, argb: string) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; };
  const setAll = (cell: ExcelJS.Cell, opts: { value?: any; font?: Partial<ExcelJS.Font>; fill?: string; align?: Partial<ExcelJS.Alignment>; border?: Partial<ExcelJS.Borders> }) => {
    if (opts.value !== undefined) cell.value = opts.value;
    if (opts.font) cell.font = opts.font;
    if (opts.fill) fill(cell, opts.fill);
    if (opts.align) cell.alignment = opts.align;
    if (opts.border) cell.border = opts.border;
  };

  // SECTION 1 — HEADER BLOCK (rows 1-3, mirrors exportExcel.ts)
  ws.mergeCells("A1:C1");
  setAll(ws.getCell("A1"), { value: "BURGER BANGOR", font: { name: "Arial Black", size: 26, bold: true, color: { argb: NAVY } }, align: { horizontal: "left", vertical: "middle" } });
  ws.getRow(1).height = 36;
  ws.mergeCells("D1:E1");
  setAll(ws.getCell("D1"), { value: "PACKING LIST", font: { name: "Arial Black", size: 18, bold: true, color: { argb: WHITE } }, fill: ORANGE, align: { horizontal: "center", vertical: "middle" } });
  ws.mergeCells("A2:C2");
  setAll(ws.getCell("A2"), { value: "", font: { name: "Arial", size: 9, color: { argb: MID_GRAY } }, align: { horizontal: "left", vertical: "middle" } });
  ws.mergeCells("D2:E2");
  setAll(ws.getCell("D2"), { value: "LOGISTICS DIVISION", font: { name: "Arial", size: 9, color: { argb: WHITE } }, fill: ORANGE, align: { horizontal: "center", vertical: "middle" } });
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 6;
  for (let c = 1; c <= 5; c++) { fill(ws.getCell(3, c), NAVY); ws.getCell(3, c).border = {}; }

  // SECTION 2 — SHIP-TO + DOC INFO (rows 5-11, mirrors exportExcel.ts)
  ws.mergeCells("A5:C5");
  setAll(ws.getCell("A5"), { value: "  SHIP TO", font: { name: "Arial", size: 10, bold: true, color: { argb: WHITE } }, fill: NAVY, align: { horizontal: "left", vertical: "middle" }, border: { top: medium, left: medium, bottom: medium, right: medium } });
  ws.getRow(5).height = 20;
  ws.mergeCells("D5:E5");
  setAll(ws.getCell("D5"), { value: "  DOCUMENT INFO", font: { name: "Arial", size: 10, bold: true, color: { argb: WHITE } }, fill: NAVY, align: { horizontal: "left", vertical: "middle" }, border: { top: medium, left: medium, bottom: medium, right: medium } });
  ws.mergeCells("A6:C6");
  setAll(ws.getCell("A6"), { value: "BANGOR — " + s.outlet.toUpperCase(), font: { name: "Arial Black", size: 10, bold: true, color: { argb: NAVY } }, fill: WARM_LIGHT, align: { horizontal: "left", vertical: "top", indent: 1, wrapText: true }, border: { top: thin, left: medium, bottom: thin, right: medium } });
  ws.getRow(6).height = 36;
  setAll(ws.getCell("D6"), { value: "DOC NO", font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } }, align: { horizontal: "right", vertical: "middle" }, border: { top: thin, left: medium, bottom: thin, right: thin } });
  setAll(ws.getCell("E6"), { value: s.deliveryNo, font: { name: "Arial", size: 9, bold: true, color: { argb: NAVY } }, align: { horizontal: "left", vertical: "middle" }, border: { top: thin, left: thin, bottom: thin, right: medium } });
  ws.mergeCells("A7:C7");
  setAll(ws.getCell("A7"), { value: receiverAddr, font: { name: "Arial", size: 8, color: { argb: MID_GRAY } }, fill: WARM_LIGHT, align: { horizontal: "left", vertical: "top", wrapText: true, indent: 1 }, border: { top: thin, left: medium, bottom: thin, right: medium } });
  ws.getRow(7).height = 36;
  setAll(ws.getCell("D7"), { value: "DATE", font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } }, align: { horizontal: "right", vertical: "middle" }, border: { top: thin, left: medium, bottom: thin, right: thin } });
  setAll(ws.getCell("E7"), { value: deliveryDate, font: { name: "Arial", size: 9, color: { argb: NAVY } }, align: { horizontal: "left", vertical: "middle" }, border: { top: thin, left: thin, bottom: thin, right: medium } });
  ws.mergeCells("A8:C8");
  setAll(ws.getCell("A8"), { value: receiverPhone, font: { name: "Arial", size: 8.5, color: { argb: MID_GRAY } }, fill: WARM_LIGHT, align: { horizontal: "left", vertical: "middle", indent: 1, wrapText: true }, border: { top: thin, left: medium, bottom: medium, right: medium } });
  ws.getRow(8).height = 20;
  setAll(ws.getCell("D8"), { value: "CHECKER", font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } }, align: { horizontal: "right", vertical: "middle" }, border: { top: thin, left: medium, bottom: thin, right: thin } });
  setAll(ws.getCell("E8"), { value: checkerDisplay, font: { name: "Arial", size: 8.5, bold: true, color: { argb: NAVY } }, align: { horizontal: "left", vertical: "middle", wrapText: true }, border: { top: thin, left: thin, bottom: thin, right: medium } });
  const refText = s.sourceRef && s.sourceRef.trim() ? s.sourceRef.trim() : "—";
  ws.mergeCells("A9:C9");
  setAll(ws.getCell("A9"), { value: "", border: { top: thin, left: medium, bottom: thin, right: medium } });
  ws.getRow(9).height = 18;
  setAll(ws.getCell("D9"), { value: "REF (SJ)", font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } }, align: { horizontal: "right", vertical: "middle" }, border: { top: thin, left: medium, bottom: thin, right: thin } });
  setAll(ws.getCell("E9"), { value: refText, font: { name: "Arial", size: 7.5, color: { argb: NAVY } }, align: { horizontal: "left", vertical: "middle", wrapText: true }, border: { top: thin, left: thin, bottom: thin, right: medium } });
  ws.mergeCells("A10:C10");
  setAll(ws.getCell("A10"), { value: "", border: { top: thin, left: medium, bottom: thin, right: medium } });
  ws.getRow(10).height = 18;
  setAll(ws.getCell("D10"), { value: "TOTAL KOLI", font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } }, align: { horizontal: "right", vertical: "middle" }, border: { top: thin, left: medium, bottom: thin, right: thin } });
  setAll(ws.getCell("E10"), { value: String(totalKoli), font: { name: "Arial", size: 10, bold: true, color: { argb: NAVY } }, align: { horizontal: "left", vertical: "middle" }, border: { top: thin, left: thin, bottom: thin, right: medium } });
  ws.mergeCells("A11:C11");
  setAll(ws.getCell("A11"), { value: "", border: { top: thin, left: medium, bottom: medium, right: medium } });
  ws.getRow(11).height = 18;
  setAll(ws.getCell("D11"), { value: "WEIGHT (KG)", font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } }, align: { horizontal: "right", vertical: "middle" }, border: { top: thin, left: medium, bottom: thin, right: thin } });
  setAll(ws.getCell("E11"), { value: totalWeight.toFixed(2), font: { name: "Arial", size: 10, bold: true, color: { argb: "FFE67E22" } }, align: { horizontal: "left", vertical: "middle" }, border: { top: thin, left: thin, bottom: medium, right: medium } });

  // SECTION 3+4 — TABLE HEADER (13) + DATA ROWS via shared buildDisplayRows
  const HEADER_ROW = 13;
  ws.getRow(HEADER_ROW).height = 22;
  const headers = ["No.", "Description", "Qty", "Item Unit", "Notes"];
  const aligns = ["center", "left", "center", "center", "left"];
  for (let i = 0; i < headers.length; i++) {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = headers[i];
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
    fill(cell, NAVY);
    cell.alignment = { horizontal: aligns[i] as any, vertical: "middle" };
    cell.border = { top: medium, left: medium, bottom: medium, right: medium };
  }
  const rows = buildDisplayRows(s.boxes, s.order, master.ITEM_UOM || {});
  const START_ROW = HEADER_ROW + 1;
  rows.forEach((r, i) => {
    const rowNum = START_ROW + i;
    const values = [r.koli, r.sku, r.qty, r.uom, r.note];
    const ca = ["center", "left", "center", "center", "left"] as const;
    const isEven = i % 2 === 0;
    for (let c = 0; c < values.length; c++) {
      const cell = ws.getCell(rowNum, c + 1);
      cell.value = values[c];
      cell.font = { name: "Arial", size: 9 };
      fill(cell, isEven ? WHITE : WARM_LIGHT);
      cell.alignment = { horizontal: ca[c], vertical: "middle" };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    }
    ws.getRow(rowNum).height = 18;
  });

  // SECTION 5 — TOTALS ROW
  const totalRow = START_ROW + rows.length;
  ws.getRow(totalRow).height = 24;
  ws.mergeCells(totalRow, 1, totalRow, 4);
  setAll(ws.getCell(totalRow, 1), { value: "TOTAL", font: { name: "Arial", size: 10, bold: true, color: { argb: WHITE } }, fill: NAVY, align: { horizontal: "right", vertical: "middle" }, border: { top: medium, left: medium, bottom: medium, right: thin } });
  setAll(ws.getCell(totalRow, 5), { value: totalWeight.toFixed(2) + " Kg", font: { name: "Arial", size: 10, bold: true, color: { argb: NAVY } }, fill: WARM_LIGHT, align: { horizontal: "center", vertical: "middle" }, border: { top: medium, left: thin, bottom: medium, right: medium } });

  // SECTION 6 — SIGNATURES + disclaimer + print area + footer (mirrors exportExcel.ts)
  const sigStart = totalRow + 3;
  ws.getRow(sigStart).height = 18;
  ws.getRow(sigStart + 1).height = 18;
  ws.getRow(sigStart + 2).height = 16;
  const sigBlocks = [
    { c1: 1, c2: 2, label: "Prepared By", role: preparedBy || "" },
    { c1: 3, c2: 4, label: "Checked By", role: "(CHECKER)" },
    { c1: 5, c2: 5, label: "Received By", role: "(PENERIMA)" },
  ];
  for (const { c1, c2, label, role } of sigBlocks) {
    const merge = (r: number) => { if (c2 > c1) ws.mergeCells(r, c1, r, c2); };
    merge(sigStart);
    const lblCell = ws.getCell(sigStart, c1);
    lblCell.value = label;
    lblCell.font = { name: "Arial", size: 9, bold: true, color: { argb: NAVY } };
    lblCell.alignment = { horizontal: "center", vertical: "bottom" };
    merge(sigStart + 1);
    const lineCell = ws.getCell(sigStart + 1, c1);
    lineCell.value = "________________________";
    lineCell.font = { name: "Arial", size: 9, color: { argb: LIGHT_LINE } };
    lineCell.alignment = { horizontal: "center", vertical: "top" };
    merge(sigStart + 2);
    const roleCell = ws.getCell(sigStart + 2, c1);
    roleCell.value = role;
    roleCell.font = { name: "Arial", size: 8, italic: true, color: { argb: MID_GRAY } };
    roleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  const disclaimerRow = sigStart + 4;
  ws.mergeCells(disclaimerRow, 1, disclaimerRow, 5);
  setAll(ws.getCell(disclaimerRow, 1), { value: "Dokumen ini dibuat secara otomatis oleh PLGen (Packing List Generator) — tidak memerlukan tanda tangan", font: { name: "Arial", size: 7, italic: true, color: { argb: "FFBDC3C7" } }, align: { horizontal: "center", vertical: "middle" } });
  ws.pageSetup.printArea = "A1:E" + disclaimerRow;
  ws.headerFooter.oddFooter = `&C&8&K727272Page &P of &N  |  ${s.outlet.toUpperCase()}`;
  ws.headerFooter.evenFooter = `&C&8&K727272Page &P of &N  |  ${s.outlet.toUpperCase()}`;
  ws.headerFooter.oddHeader = `&L&8&K727272${s.deliveryNo}&R&8&K727272${deliveryDate}`;
  ws.headerFooter.evenHeader = `&L&8&K727272${s.deliveryNo}&R&8&K727272${deliveryDate}`;
  ws.headerFooter.differentFirst = false;
  ws.pageSetup.showRowColHeaders = false;
  return { totalWeight, totalKoli };
}

// Builds the whole workbook (one full-PL sheet per outlet) + instant download.
// Numbering/dates are pre-issued by the caller — this fn never touches counters.
export async function exportRemasteredWorkbook(
  sheets: RemasteredSheet[], master: any, checkerDisplay: string, preparedBy?: string
): Promise<{ blob: Blob; filename: string; deliveryDate: string }> {
  const deliveryDate = getDeliveryDateWIB(1, master.HOLIDAYS || []);
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    renderRemasteredSheet(wb, s.tabName, s, master, checkerDisplay, preparedBy, deliveryDate);
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const d = new Date();
  const ts = String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0") + d.getFullYear();
  const filename = `${ts}_REMASTERED_${sheets.length}outlets.xlsx`;
  saveAs(blob, filename);
  return { blob, filename, deliveryDate };
}
