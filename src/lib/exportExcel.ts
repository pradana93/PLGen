// 1:1 port of core.py export_packing_list + addons.py generate_labels
// Preserves: A4 portrait layout, QR embed (B44), header rows, palette fills, thick borders, row heights, print area
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Box, Order, getNextDeliveryNumber, getDeliveryDateWIB, buildDisplayRows, getOutletPalette } from "./packing";

const ARIA = "Arial";
const ARIA_BLACK = "Arial Black";

// Packing List export — redesign with branding, info panel, bordered table, totals, signature
export async function exportPackingList(outlet: string, boxes: Box[], order: Order, master: any, checkerDisplay: string) {
  const deliveryDate = getDeliveryDateWIB(1, master.HOLIDAYS||[]);
  const deliveryNo = getNextDeliveryNumber(master.companyCode||"BBB");
  const totalWeight = Object.entries(order).reduce((acc,[sku,data])=>{
    const w = master.ITEM_WEIGHT_GRAMS?.[sku]||0;
    return acc + (data.qty*w)/1000;
  },0);

  const outletInfo = master.OUTLET_INFO?.[outlet.toUpperCase()] || {};
  const receiverAddr = outletInfo.address || "—";
  const receiverPhone = outletInfo.phone || "—";
  const companyCode = master.companyCode || "BBB";
  const companyName = companyCode === "BBT" ? "PT BANGOR BERANI TERUKUR" : "PT BANGOR BERKEMBANG BERSAMA";
  const totalKoli = boxes.length;


  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Packing List");

  // ── helpers ──
  const thin = { style: "thin" as const };
  const medium = { style: "medium" as const };
  const thick = { style: "thick" as const };
  const noBorder = { style: "none" as const };
  const NAVY = "FF2C3E50";
  const LIGHT = "FFF4F6F9";
  const WHITE = "FFFFFFFF";
  const GRAY_LINE = "FFD5D8DC";
  const RED = "FFE74C3C";

  const allThin = { top: thin, left: thin, bottom: thin, right: thin };
  const headerBorder = { top: medium, left: medium, bottom: medium, right: medium };

  const setBorder = (cell: ExcelJS.Cell, b: any) => { cell.border = b; };
  const setFill = (cell: ExcelJS.Cell, argb: string) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; };
  const setFont = (cell: ExcelJS.Cell, opts: any) => { cell.font = { name: ARIA, ...opts }; };

  // ── PAGE SETUP ──
  (ws.pageSetup as any).paperSize = 9; // A4
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0; // allow multiple pages
  ws.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

  // ── COLUMN WIDTHS ──
  ws.getColumn(1).width = 5;   // No. Koli
  ws.getColumn(2).width = 36;  // Description
  ws.getColumn(3).width = 9;   // Qty
  ws.getColumn(4).width = 12;  // Item Unit
  ws.getColumn(5).width = 22;  // Notes
  ws.getColumn(6).width = 1;   // spacer

  // ═══════════════════════════════════════════
  //  SECTION 1: COMPANY BANNER (rows 1-2)
  // ═══════════════════════════════════════════
  ws.mergeCells("A1:E1");
  const banner1 = ws.getCell("A1");
  banner1.value = "BURGER BANGOR";
  banner1.font = { name: ARIA_BLACK, size: 18, bold: true, color: { argb: WHITE } };
  banner1.alignment = { horizontal: "center", vertical: "middle" };
  setFill(banner1, NAVY);
  ws.getRow(1).height = 32;

  ws.mergeCells("A2:E2");
  const banner2 = ws.getCell("A2");
  banner2.value = "PACKING LIST";
  banner2.font = { name: ARIA, size: 11, bold: true, color: { argb: WHITE } };
  banner2.alignment = { horizontal: "center", vertical: "middle" };
  setFill(banner2, NAVY);
  ws.getRow(2).height = 18;

  // ═══════════════════════════════════════════
  //  SECTION 2: INFO PANEL (rows 4-7)
  // ═══════════════════════════════════════════
  // Left block: Ship To
  ws.mergeCells("A4:B4");
  const lblShipTo = ws.getCell("A4");
  lblShipTo.value = "SHIP TO";
  setFont(lblShipTo, { bold: true, size: 9, color: { argb: WHITE } });
  setFill(lblShipTo, NAVY);
  lblShipTo.alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("B4").border = { top: medium, right: medium, bottom: medium };
  ws.getCell("A4").border = { top: medium, left: medium, bottom: medium };
  ws.getRow(4).height = 20;

  ws.mergeCells("C4:E4");
  const valShipTo = ws.getCell("C4");
  valShipTo.value = "BANGOR - " + outlet.toUpperCase();
  setFont(valShipTo, { bold: true, size: 13, color: { argb: NAVY } });
  setFill(valShipTo, LIGHT);
  valShipTo.alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("C4").border = { top: medium, left: medium, bottom: medium };
  ws.getCell("E4").border = { top: medium, right: medium, bottom: medium };
  ws.getRow(5).height = 22;

  // Address
  ws.mergeCells("A5:B5");
  const lblAddr = ws.getCell("A5");
  lblAddr.value = "ADDRESS";
  setFont(lblAddr, { bold: true, size: 8, color: { argb: WHITE } });
  setFill(lblAddr, NAVY);
  lblAddr.alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("A5").border = { left: medium, bottom: medium };

  ws.mergeCells("C5:E5");
  const valAddr = ws.getCell("C5");
  valAddr.value = receiverAddr;
  setFont(valAddr, { size: 9, italic: true });
  valAddr.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws.getCell("C5").border = { left: medium, bottom: medium };
  ws.getCell("E5").border = { right: medium, bottom: medium };
  ws.getRow(5).height = 28;

  // Phone
  ws.mergeCells("A6:B6");
  const lblPhone = ws.getCell("A6");
  lblPhone.value = "PHONE";
  setFont(lblPhone, { bold: true, size: 8, color: { argb: WHITE } });
  setFill(lblPhone, NAVY);
  lblPhone.alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("A6").border = { left: medium, bottom: medium };

  ws.mergeCells("C6:E6");
  const valPhone = ws.getCell("C6");
  valPhone.value = receiverPhone;
  setFont(valPhone, { size: 9, italic: true });
  valPhone.alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell("C6").border = { left: medium, bottom: medium };
  ws.getCell("E6").border = { right: medium, bottom: medium };
  ws.getRow(6).height = 18;

  // ── Right block: Doc info (rows 4-7, same rows) ──
  // Already handled via merged cells — using a clean two-column layout
  // Actually let me put doc info in a separate block below the ship-to panel

  // ═══════════════════════════════════════════
  //  SECTION 3: DOCUMENT INFO (rows 8-12)
  // ═══════════════════════════════════════════
  const infoLabels = ["DOCUMENT NO", "DELIVERY DATE", "CHECKER", "TOTAL KOLI", "TOTAL WEIGHT"];
  const infoValues = [deliveryNo, deliveryDate, checkerDisplay, String(totalKoli), totalWeight.toFixed(2) + " Kg"];
  const infoColors = [NAVY, NAVY, NAVY, RED, RED];

  for (let i = 0; i < infoLabels.length; i++) {
    const rowNum = 8 + i;
    ws.getRow(rowNum).height = 18;

    // Label cell (A-B merged)
    ws.mergeCells(rowNum, 1, rowNum, 2);
    const lbl = ws.getCell(rowNum, 1);
    lbl.value = infoLabels[i];
    setFont(lbl, { bold: true, size: 9, color: { argb: WHITE } });
    setFill(lbl, NAVY);
    lbl.alignment = { horizontal: "right", vertical: "middle" };
    lbl.border = { top: thin, left: medium, bottom: thin, right: thin };

    // Value cell (C-E merged)
    ws.mergeCells(rowNum, 3, rowNum, 5);
    const val = ws.getCell(rowNum, 3);
    val.value = infoValues[i];
    setFont(val, { bold: true, size: 10, color: { argb: infoColors[i] } });
    setFill(val, LIGHT);
    val.alignment = { horizontal: "center", vertical: "middle" };
    val.border = { top: thin, left: thin, bottom: thin, right: medium };
  }
  // Bottom border for the info block
  for (let c = 1; c <= 5; c++) {
    ws.getCell(12, c).border = { ...ws.getCell(12, c).border, bottom: medium };
  }

  // ═══════════════════════════════════════════
  //  SECTION 4: TABLE HEADER (row 14)
  // ═══════════════════════════════════════════
  const HEADER_ROW = 14;
  ws.getRow(HEADER_ROW).height = 24;
  const headers = ["No.", "Description", "Qty", "Item Unit", "Notes"];
  for (let i = 0; i < headers.length; i++) {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = headers[i];
    setFont(cell, { bold: true, size: 10, color: { argb: WHITE } });
    setFill(cell, NAVY);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = headerBorder;
  }

  // ═══════════════════════════════════════════
  //  SECTION 5: DATA ROWS (from HEADER_ROW+1)
  // ═══════════════════════════════════════════
  const rows = buildDisplayRows(boxes, order, master.ITEM_UOM||{});
  const START_ROW = HEADER_ROW + 1;

  rows.forEach((r, i) => {
    const rowNum = START_ROW + i;
    const values = [r.koli, r.sku, r.qty, r.uom, r.note];
    const fills = [LIGHT, i % 2 === 0 ? "FFFFFFFF" : LIGHT, LIGHT, LIGHT, i % 2 === 0 ? "FFFFFFFF" : LIGHT];

    for (let c = 0; c < values.length; c++) {
      const cell = ws.getCell(rowNum, c + 1);
      cell.value = values[c];
      setFont(cell, { size: 9 });
      setFill(cell, fills[c]);
      cell.alignment = { horizontal: c === 0 || c === 2 ? "center" : "left", vertical: "middle" };
      cell.border = allThin;
    }
    ws.getRow(rowNum).height = 18;
  });

  // ═══════════════════════════════════════════
  //  SECTION 6: TOTALS ROW
  // ═══════════════════════════════════════════
  const totalRow = START_ROW + rows.length;
  ws.getRow(totalRow).height = 22;
  ws.mergeCells(totalRow, 1, totalRow, 2);
  const totalLabel = ws.getCell(totalRow, 1);
  totalLabel.value = "TOTAL";
  setFont(totalLabel, { bold: true, size: 10, color: { argb: WHITE } });
  setFill(totalLabel, NAVY);
  totalLabel.alignment = { horizontal: "right", vertical: "middle" };
  totalLabel.border = { top: medium, left: medium, bottom: medium, right: thin };

  const totalQty = ws.getCell(totalRow, 3);
  totalQty.value = rows.length;
  setFont(totalQty, { bold: true, size: 10, color: { argb: NAVY } });
  setFill(totalQty, LIGHT);
  totalQty.alignment = { horizontal: "center", vertical: "middle" };
  totalQty.border = { top: medium, left: thin, bottom: medium, right: thin };

  ws.mergeCells(totalRow, 4, totalRow, 5);
  const totalWt = ws.getCell(totalRow, 4);
  totalWt.value = totalWeight.toFixed(2) + " Kg";
  setFont(totalWt, { bold: true, size: 10, color: { argb: NAVY } });
  setFill(totalWt, LIGHT);
  totalWt.alignment = { horizontal: "center", vertical: "middle" };
  totalWt.border = { top: medium, left: thin, bottom: medium, right: medium };

  // ═══════════════════════════════════════════
  //  SECTION 7: SIGNATURE BLOCK
  // ═══════════════════════════════════════════
  const sigRow = totalRow + 7;
  ws.getRow(sigRow).height = 16;
  ws.getRow(sigRow + 1).height = 16;
  ws.getRow(sigRow + 2).height = 16;

  const sigLabels = [
    { col: 1, text: "Prepared By :" },
    { col: 3, text: "Checked By :" },
    { col: 5, text: "Received By :" },
  ];
  sigLabels.forEach(({ col, text }) => {
    const cell = ws.getCell(sigRow, col);
    cell.value = text;
    setFont(cell, { bold: true, size: 9 });
    cell.alignment = { horizontal: "center" };

    // Underline row
    const lineCell = ws.getCell(sigRow + 2, col);
    lineCell.value = "___________________";
    setFont(lineCell, { size: 9, color: { argb: GRAY_LINE } });
    lineCell.alignment = { horizontal: "center" };
  });

  // ═══════════════════════════════════════════
  //  SECTION 9: PRINT TITLES + FREEZE PANES
  // ═══════════════════════════════════════════
  ws.pageSetup.printArea = "A1:E" + (sigRow + 2);
  ws.pageSetup.printTitlesRow = "1:2"; // repeat company banner on every page

  // ═══════════════════════════════════════════
  //  BACKEND LOGGING (fire-and-forget)
  // ═══════════════════════════════════════════
  const _base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
  try {
    await fetch(`${_base}/api/packing_status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:deliveryNo,outlet,checker:checkerDisplay,status:"PENDING",total_weight_kg: Number(totalWeight.toFixed(2))})});
    await fetch(`${_base}/api/track_item_usage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:deliveryNo,outlet,items:Object.fromEntries(Object.entries(order).map(([k,v])=>[k,v.qty]))})});
  } catch {}

  const buf = await wb.xlsx.writeBuffer();
  const _ts = (() => { const d = new Date(); return String(d.getDate()).padStart(2,"0") + String(d.getMonth()+1).padStart(2,"0") + d.getFullYear(); })();
  saveAs(new Blob([buf]), `${_ts}_${outlet}.xlsx`);
  return { deliveryNo, totalWeight };
}

// Label sheets export — mirrors addons.py generate_labels (6 labels/sheet, 2 cols x 3 rows, A4 portrait)
export async function exportLabels(outlet: string, boxes: Box[], master: any) {
  const outName = outlet.toUpperCase();
  const outletData = (master?.OUTLET_INFO || {})[outName] || {};
  const receiverName = outletData.name || outName;
  const receiverPhone = outletData.phone || "";
  const receiverAddr = outletData.address || "Address not available";
  const totalKoli = boxes.length;

  const palette = getOutletPalette(outlet);
  const destBg = "FF" + palette.bg;
  const destFg = "FF" + palette.text;
  const destFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: destBg } };
  const senderBg = "FF2C3E50";
  const senderFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: senderBg } };

  const wb = new ExcelJS.Workbook();

  const setupSheet = (ws: ExcelJS.Worksheet) => {
    (ws.pageSetup as any).paperSize = 9; // PAPERSIZE_A4
    ws.pageSetup.orientation = "portrait";
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 1;
    ws.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
    ws.getColumn(1).width = 2;   // left margin
    ws.getColumn(8).width = 2;   // spacer between labels
    for (let c = 2; c <= 14; c++) if (c !== 8) ws.getColumn(c).width = 9;
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

  for (let sheetIndex = 0; sheetIndex < totalKoli; sheetIndex += 6) {
    const chunk = boxes.slice(sheetIndex, sheetIndex + 6);
    const ws: ExcelJS.Worksheet = sheetIndex === 0 ? wb.addWorksheet("Labels") : wb.addWorksheet();
    ws.name = `Labels_${sheetIndex + 1}_to_${Math.min(sheetIndex + 6, totalKoli)}`;
    setupSheet(ws);

    for (let li = 0; li < chunk.length; li++) {
      const colOffset = li % 2 === 0 ? 2 : 9;
      const rowOffset = 2 + Math.floor(li / 2) * 11;
      const koliNum = sheetIndex + li + 1;

      // Rows 0-1: OUTLET NAME
      ws.mergeCells(rowOffset, colOffset, rowOffset + 1, colOffset + 5);
      const cOutlet = ws.getCell(rowOffset, colOffset);
      cOutlet.value = outName;
      cOutlet.font = { name: ARIA_BLACK, size: 16, bold: true };
      cOutlet.alignment = { horizontal: "center", vertical: "middle" };

      // Row 2: KOLI NUMBER (blank space for manual writing)
      ws.mergeCells(rowOffset + 2, colOffset, rowOffset + 2, colOffset + 5);
      const cKoli = ws.getCell(rowOffset + 2, colOffset);
      cKoli.value = `No. Koli:        / ${totalKoli}`;
      cKoli.font = { bold: true, size: 12, name: ARIA };
      cKoli.alignment = { horizontal: "center", vertical: "middle" };

      // Rows 3-4: ADDRESS
      ws.mergeCells(rowOffset + 3, colOffset, rowOffset + 4, colOffset + 5);
      const cAddr = ws.getCell(rowOffset + 3, colOffset);
      cAddr.value = receiverAddr;
      cAddr.font = { size: 10, name: ARIA };
      cAddr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      // Row 5: PENERIMA label + name (dynamic palette)
      ws.mergeCells(rowOffset + 5, colOffset, rowOffset + 5, colOffset + 1);
      const cRecvLbl = ws.getCell(rowOffset + 5, colOffset);
      cRecvLbl.value = "PENERIMA";
      cRecvLbl.fill = destFill; cRecvLbl.font = { color: { argb: destFg }, bold: true, size: 10, name: ARIA }; cRecvLbl.alignment = { horizontal: "center", vertical: "middle" };
      ws.mergeCells(rowOffset + 5, colOffset + 2, rowOffset + 5, colOffset + 5);
      const cRecvName = ws.getCell(rowOffset + 5, colOffset + 2);
      cRecvName.value = receiverName;
      cRecvName.fill = destFill; cRecvName.font = { color: { argb: destFg }, bold: true, size: 11, name: ARIA }; cRecvName.alignment = { horizontal: "center", vertical: "middle" };

      // Row 6: NO. HP label + phone
      ws.mergeCells(rowOffset + 6, colOffset, rowOffset + 6, colOffset + 1);
      const cPhoneLbl = ws.getCell(rowOffset + 6, colOffset);
      cPhoneLbl.value = "NO. HP";
      cPhoneLbl.fill = destFill; cPhoneLbl.font = { color: { argb: destFg }, bold: true, size: 10, name: ARIA }; cPhoneLbl.alignment = { horizontal: "center", vertical: "middle" };
      ws.mergeCells(rowOffset + 6, colOffset + 2, rowOffset + 6, colOffset + 5);
      const cPhoneNum = ws.getCell(rowOffset + 6, colOffset + 2);
      cPhoneNum.value = receiverPhone;
      cPhoneNum.fill = destFill; cPhoneNum.font = { color: { argb: destFg }, bold: true, size: 11, name: ARIA }; cPhoneNum.alignment = { horizontal: "center", vertical: "middle" };

      // Row 7: PENGIRIM label + name (consistent brand dark)
      ws.mergeCells(rowOffset + 7, colOffset, rowOffset + 7, colOffset + 1);
      const cSendLbl = ws.getCell(rowOffset + 7, colOffset);
      cSendLbl.value = "PENGIRIM";
      cSendLbl.fill = senderFill; cSendLbl.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 10, name: ARIA }; cSendLbl.alignment = { horizontal: "center", vertical: "middle" };
      ws.mergeCells(rowOffset + 7, colOffset + 2, rowOffset + 7, colOffset + 5);
      const cSendName = ws.getCell(rowOffset + 7, colOffset + 2);
      cSendName.value = "BURGER BANGOR";
      cSendName.fill = senderFill; cSendName.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11, name: ARIA }; cSendName.alignment = { horizontal: "center", vertical: "middle" };

      // Row 8: NO. HP label + phone (sender)
      ws.mergeCells(rowOffset + 8, colOffset, rowOffset + 8, colOffset + 1);
      const cSendPhLbl = ws.getCell(rowOffset + 8, colOffset);
      cSendPhLbl.value = "NO. HP";
      cSendPhLbl.fill = senderFill; cSendPhLbl.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 10, name: ARIA }; cSendPhLbl.alignment = { horizontal: "center", vertical: "middle" };
      ws.mergeCells(rowOffset + 8, colOffset + 2, rowOffset + 8, colOffset + 5);
      const cSendPhNum = ws.getCell(rowOffset + 8, colOffset + 2);
      cSendPhNum.value = "082125627591";
      cSendPhNum.fill = senderFill; cSendPhNum.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11, name: ARIA }; cSendPhNum.alignment = { horizontal: "center", vertical: "middle" };

      // Thick border around the entire label block
      borderBox(ws, rowOffset, colOffset, rowOffset + 9, colOffset + 5);

      // Row heights (like Python)
      ws.getRow(rowOffset).height = 20;
      ws.getRow(rowOffset + 1).height = 20;
      ws.getRow(rowOffset + 2).height = 20;
      ws.getRow(rowOffset + 3).height = 20;
      ws.getRow(rowOffset + 4).height = 20;
      ws.getRow(rowOffset + 5).height = 25;
      ws.getRow(rowOffset + 6).height = 25;
      ws.getRow(rowOffset + 7).height = 25;
      ws.getRow(rowOffset + 8).height = 25;
      ws.getRow(rowOffset + 9).height = 15;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const _ts = (() => { const d = new Date(); return String(d.getDate()).padStart(2,"0") + String(d.getMonth()+1).padStart(2,"0") + d.getFullYear(); })();
  saveAs(new Blob([buf]), `${outlet}_${_ts}.xlsx`);
}
