// Label size templates — "Medium" (4 per A4) and "Large" (2 per A4).
//
// This module is ADDITIVE: the original 6-per-A4 layout lives untouched in
// exportExcel.ts and is still used for the default "standard" template.
// Nothing here changes packing math, PL numbering, or delivered quantities.
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Box, getDeliveryDateWIB, getOutletPalette } from "./packing";

const ARIA = "Arial";
const ARIA_BLACK = "Arial Black";

export type SizedLabelTemplate = "medium" | "large";

type LabelCfg = {
  orientation: "portrait" | "landscape";
  colsPerPage: number;
  rowsPerPage: number;
  labelCols: number;
  colWidth: number;
  marginColWidth: number;
  spacerColWidth: number;
  labelSpan: number; // columns used by the label caption (PENERIMA / PENGIRIM)
  heights: number[]; // 11 logical rows per label
  gapRows: number;
  startRow: number;
  font: {
    outlet: number;
    koli: number;
    addr: number;
    cap: number;
    value: number;
    banner: number;
    detail: number;
  };
  margin: { left: number; right: number; top: number; bottom: number };
  suffix: string;
};

const CFG: Record<SizedLabelTemplate, LabelCfg> = {
  // 4 per A4 portrait (2 across x 2 down)
  medium: {
    orientation: "portrait",
    colsPerPage: 2,
    rowsPerPage: 2,
    labelCols: 4,
    colWidth: 12,
    marginColWidth: 2,
    spacerColWidth: 2,
    labelSpan: 2,
    heights: [30, 30, 30, 32, 32, 36, 36, 36, 36, 34, 26],
    gapRows: 1,
    startRow: 2,
    font: { outlet: 22, koli: 16, addr: 13, cap: 13, value: 15, banner: 15, detail: 10 },
    margin: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35 },
    suffix: "MEDIUM_",
  },
  // 2 per A4 landscape (2 across x 1 down) — A5-ish label face
  large: {
    orientation: "landscape",
    colsPerPage: 2,
    rowsPerPage: 1,
    labelCols: 6,
    colWidth: 12,
    marginColWidth: 1,
    spacerColWidth: 2,
    labelSpan: 2,
    heights: [44, 44, 40, 40, 40, 48, 48, 48, 48, 52, 34],
    gapRows: 0,
    startRow: 2,
    font: { outlet: 28, koli: 20, addr: 16, cap: 16, value: 19, banner: 20, detail: 12 },
    margin: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3 },
    suffix: "LARGE_",
  },
};

const WARNING_BANNER = "⚠️ WAJIB VIDEO UNBOXING";
const WARNING_DETAIL =
  "Rekam video saat paket dibuka. Klaim barang rusak/kurang tanpa video TIDAK dapat diproses.";

function stamp(): string {
  const d = new Date();
  return (
    String(d.getDate()).padStart(2, "0") +
    String(d.getMonth() + 1).padStart(2, "0") +
    d.getFullYear()
  );
}

/**
 * Builds a label workbook using the requested size template.
 * Returns the same `{ blink, filename }` shape as exportLabels so the Drive and
 * ZIP callers need no special handling.
 */
export async function exportSizedLabels(
  outlet: string,
  boxes: Box[],
  master: any,
  template: SizedLabelTemplate,
  opts?: { skipDownload?: boolean }
) {
  const cfg = CFG[template];
  const outName = outlet.toUpperCase();
  const outletData = (master?.OUTLET_INFO || {})[outName] || {};
  const receiverName = outletData.name || outName;
  const receiverPhone = outletData.phone || "";
  const receiverAddr = outletData.address || "Address not available";
  const totalKoli = boxes.length;
  const deliveryDate = getDeliveryDateWIB(1, master?.HOLIDAYS || []);

  const palette = getOutletPalette(outlet);
  const destFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF" + palette.bg },
  };
  const destFg = "FF" + palette.text;
  const senderFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF2C3E50" },
  };
  const white = "FFFFFFFF";

  const wb = new ExcelJS.Workbook();
  const perSheet = cfg.colsPerPage * cfg.rowsPerPage;

  const setupSheet = (ws: ExcelJS.Worksheet) => {
    (ws.pageSetup as any).paperSize = 9; // A4
    ws.pageSetup.orientation = cfg.orientation;
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 1;
    ws.pageSetup.margins = {
      left: cfg.margin.left,
      right: cfg.margin.right,
      top: cfg.margin.top,
      bottom: cfg.margin.bottom,
      header: 0.2,
      footer: 0.2,
    };
    ws.getColumn(1).width = cfg.marginColWidth;
    // label columns + spacer between the two label blocks
    for (let i = 0; i < cfg.colsPerPage; i++) {
      const start = 2 + i * (cfg.labelCols + 1);
      for (let c = start; c < start + cfg.labelCols; c++) {
        ws.getColumn(c).width = cfg.colWidth;
      }
      if (i < cfg.colsPerPage - 1) {
        ws.getColumn(start + cfg.labelCols).width = cfg.spacerColWidth;
      }
    }
  };

  const thick = { style: "thick" as const };
  const borderBox = (ws: ExcelJS.Worksheet, r0: number, c0: number, r1: number, c1: number) => {
    for (let c = c0; c <= c1; c++) {
      ws.getCell(r0, c).border = { ...ws.getCell(r0, c).border, top: thick };
      ws.getCell(r1, c).border = { ...ws.getCell(r1, c).border, bottom: thick };
    }
    for (let r = r0; r <= r1; r++) {
      ws.getCell(r, c0).border = { ...ws.getCell(r, c0).border, left: thick };
      ws.getCell(r, c1).border = { ...ws.getCell(r, c1).border, right: thick };
    }
  };

  const drawLabel = (ws: ExcelJS.Worksheet, koliNum: number, r0: number, c0: number) => {
    const c1 = c0 + cfg.labelCols - 1;

    // rows 0-1 — OUTLET NAME
    ws.mergeCells(r0, c0, r0 + 1, c1);
    const cOutlet = ws.getCell(r0, c0);
    cOutlet.value = outName;
    cOutlet.font = { name: ARIA_BLACK, size: cfg.font.outlet, bold: true };
    cOutlet.alignment = { horizontal: "center", vertical: "middle" };

    // row 2 — KOLI NUMBER (actual number, not a blank line)
    ws.mergeCells(r0 + 2, c0, r0 + 2, c1);
    const cKoli = ws.getCell(r0 + 2, c0);
    cKoli.value = `KOLI  ${koliNum} / ${totalKoli}`;
    cKoli.font = { bold: true, size: cfg.font.koli, name: ARIA };
    cKoli.alignment = { horizontal: "center", vertical: "middle" };

    // rows 3-4 — ADDRESS
    ws.mergeCells(r0 + 3, c0, r0 + 4, c1);
    const cAddr = ws.getCell(r0 + 3, c0);
    cAddr.value = receiverAddr;
    cAddr.font = { size: cfg.font.addr, name: ARIA };
    cAddr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // helper for the PENERIMA / PENGIRIM pair rows
    const pair = (row: number, cap: string, value: string, fill: any, fg: string) => {
      ws.mergeCells(row, c0, row, c0 + cfg.labelSpan - 1);
      const cl = ws.getCell(row, c0);
      cl.value = cap;
      cl.fill = fill;
      cl.font = { color: { argb: fg }, bold: true, size: cfg.font.cap, name: ARIA };
      cl.alignment = { horizontal: "center", vertical: "middle" };

      ws.mergeCells(row, c0 + cfg.labelSpan, row, c1);
      const cv = ws.getCell(row, c0 + cfg.labelSpan);
      cv.value = value;
      cv.fill = fill;
      cv.font = { color: { argb: fg }, bold: true, size: cfg.font.value, name: ARIA };
      cv.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    };

    pair(r0 + 5, "PENERIMA", receiverName, destFill, destFg);
    pair(r0 + 6, "NO. HP", receiverPhone, destFill, destFg);
    pair(r0 + 7, "PENGIRIM", "BURGER BANGOR", senderFill, white);
    pair(r0 + 8, "NO. HP", "082125627591", senderFill, white);

    // row 9 — dominant warning banner
    ws.mergeCells(r0 + 9, c0, r0 + 9, c1);
    const cBanner = ws.getCell(r0 + 9, c0);
    cBanner.value = WARNING_BANNER;
    cBanner.font = { name: ARIA_BLACK, size: cfg.font.banner, bold: true, color: { argb: white } };
    cBanner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
    cBanner.alignment = { horizontal: "center", vertical: "middle" };

    // row 10 — warning detail + delivery date
    ws.mergeCells(r0 + 10, c0, r0 + 10, c1);
    const cDetail = ws.getCell(r0 + 10, c0);
    cDetail.value = `${WARNING_DETAIL}\nTgl Kirim: ${deliveryDate}`;
    cDetail.font = { size: cfg.font.detail, bold: true, name: ARIA, color: { argb: "FF7F1D1D" } };
    cDetail.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE4E6" } };
    cDetail.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    borderBox(ws, r0, c0, r0 + 10, c1);

    for (let i = 0; i < cfg.heights.length; i++) {
      ws.getRow(r0 + i).height = cfg.heights[i];
    }
  };

  const blockRows = cfg.heights.length + cfg.gapRows;
  for (let sheetIndex = 0; sheetIndex < totalKoli; sheetIndex += perSheet) {
    const chunk = boxes.slice(sheetIndex, sheetIndex + perSheet);
    const ws: ExcelJS.Worksheet =
      sheetIndex === 0 ? wb.addWorksheet("Labels") : wb.addWorksheet();
    ws.name = `Labels_${sheetIndex + 1}_to_${Math.min(sheetIndex + perSheet, totalKoli)}`;
    setupSheet(ws);

    for (let li = 0; li < chunk.length; li++) {
      const slot = li % perSheet;
      const colBlock = slot % cfg.colsPerPage;
      const rowBlock = Math.floor(slot / cfg.colsPerPage);
      const c0 = 2 + colBlock * (cfg.labelCols + 1);
      const r0 = cfg.startRow + rowBlock * blockRows;
      drawLabel(ws, sheetIndex + li + 1, r0, c0);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${outlet}_${cfg.suffix}${stamp()}.xlsx`;
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (!opts?.skipDownload) saveAs(blob, filename);
  return { blob, filename };
}
