// 1:1 port of core.py export_packing_list + addons.py generate_labels
// Preserves: A4 portrait layout, QR embed (B44), header rows, palette fills, thick borders, row heights, print area
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Box, Order, getNextDeliveryNumber, getDeliveryDateWIB, buildDisplayRows, getOutletPalette } from "./packing";

const ARIA = "Arial";
const ARIA_BLACK = "Arial Black";

// Packing List export — polished professional layout
export async function exportPackingList(outlet: string, boxes: Box[], order: Order, master: any, checkerDisplay: string, preparedBy?: string) {
  const deliveryDate = getDeliveryDateWIB(1, master.HOLIDAYS||[]);
  const deliveryNo = getNextDeliveryNumber(master.companyCode||"BBB");
  const totalWeight = Object.entries(order).reduce((acc,[sku,data])=>{
    const w = master.ITEM_WEIGHT_GRAMS?.[sku]||0;
    return acc + (data.qty*w)/1000;
  },0);

  const outletInfo = master.OUTLET_INFO?.[outlet.toUpperCase()] || {};
  const receiverAddr = outletInfo.address || "—";
  const receiverPhone = outletInfo.phone || "—";
  const totalKoli = boxes.length;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Packing List");

  // ── Color palette ──
  const NAVY      = "FF2C3E50";
  const ORANGE     = "FFF39C12";
  const WARM_LIGHT = "FFFAF7F2";
  const LIGHT_GRAY = "FFECEFF1";
  const MID_GRAY   = "FF7F8C8D";
  const LIGHT_LINE = "FFD5D8DC";
  const WHITE      = "FFFFFFFF";

  // ── Page setup ──
  (ws.pageSetup as any).paperSize = 9; // A4
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.45, bottom: 0.45, header: 0.3, footer: 0.3 };
  ws.pageSetup.printTitlesRow = "1:2"; // repeat branding on every page

  // ── Column widths ──
  ws.getColumn(1).width = 5;   // No. Koli
  ws.getColumn(2).width = 36;  // Description
  ws.getColumn(3).width = 9;   // Qty
  ws.getColumn(4).width = 12;  // Item Unit
  ws.getColumn(5).width = 22;  // Notes

  const thin   = { style: "thin" as const };
  const medium = { style: "medium" as const };
  const thick  = { style: "thick" as const };

  const allBorders = (ws: ExcelJS.Worksheet, r: number, c: number, style = thin) =>
    ({ top: style, left: style, bottom: style, right: style });

  const fill = (cell: ExcelJS.Cell, argb: string) =>
    { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; };

  const font = (cell: ExcelJS.Cell, f: ExcelJS.Font) => { cell.font = f; };

  const setAll = (cell: ExcelJS.Cell, opts: {
    value?: any;
    font?: Partial<ExcelJS.Font>;
    fill?: string;
    align?: Partial<ExcelJS.Alignment>;
    border?: Partial<ExcelJS.Borders>;
  }) => {
    if (opts.value !== undefined) cell.value = opts.value;
    if (opts.font) cell.font = opts.font;
    if (opts.fill) fill(cell, opts.fill);
    if (opts.align) cell.alignment = opts.align;
    if (opts.border) cell.border = opts.border;
  };

  // ════════════════════════════════════════════════════════════════
  //  SECTION 1 — HEADER BLOCK (rows 1-3)
  // ════════════════════════════════════════════════════════════════
  ws.mergeCells("A1:C1");
  setAll(ws.getCell("A1"), {
    value: "BURGER BANGOR",
    font: { name: "Arial Black", size: 26, bold: true, color: { argb: NAVY } },
    align: { horizontal: "left", vertical: "middle" },
  });
  ws.getRow(1).height = 36;

  ws.mergeCells("D1:E1");
  setAll(ws.getCell("D1"), {
    value: "PACKING LIST",
    font: { name: "Arial Black", size: 18, bold: true, color: { argb: WHITE } },
    fill: ORANGE,
    align: { horizontal: "center", vertical: "middle" },
  });
  ws.getRow(1).height = 36;

  ws.mergeCells("A2:C2");
  setAll(ws.getCell("A2"), {
    value: "",
    font: { name: "Arial", size: 9, color: { argb: MID_GRAY } },
    align: { horizontal: "left", vertical: "middle" },
  });

  ws.mergeCells("D2:E2");
  setAll(ws.getCell("D2"), {
    value: "LOGISTICS DIVISION",
    font: { name: "Arial", size: 9, color: { argb: WHITE } },
    fill: ORANGE,
    align: { horizontal: "center", vertical: "middle" },
  });
  ws.getRow(2).height = 18;

  // Thick navy divider bar
  ws.getRow(3).height = 6;
  for (let c = 1; c <= 5; c++) {
    fill(ws.getCell(3, c), NAVY);
    ws.getCell(3, c).border = {};
  }

  // ════════════════════════════════════════════════════════════════
  //  SECTION 2 — SHIP-TO + DOC INFO (rows 5-10)
  // ════════════════════════════════════════════════════════════════

  // ── SHIP TO header row ──
  ws.mergeCells("A5:C5");
  setAll(ws.getCell("A5"), {
    value: "  SHIP TO",
    font: { name: "Arial", size: 10, bold: true, color: { argb: WHITE } },
    fill: NAVY,
    align: { horizontal: "left", vertical: "middle" },
    border: { top: medium, left: medium, bottom: medium, right: medium },
  });
  ws.getRow(5).height = 20;

  ws.mergeCells("D5:E5");
  setAll(ws.getCell("D5"), {
    value: "  DOCUMENT INFO",
    font: { name: "Arial", size: 10, bold: true, color: { argb: WHITE } },
    fill: NAVY,
    align: { horizontal: "left", vertical: "middle" },
    border: { top: medium, left: medium, bottom: medium, right: medium },
  });

  // ── Ship-to content rows ──
  // Row 6: outlet name
  ws.mergeCells("A6:C6");
  setAll(ws.getCell("A6"), {
    value: "BANGOR — " + outlet.toUpperCase(),
    font: { name: "Arial Black", size: 12, bold: true, color: { argb: NAVY } },
    fill: WARM_LIGHT,
    align: { horizontal: "left", vertical: "middle", indent: 1, wrapText: true },
    border: { top: thin, left: medium, bottom: thin, right: medium },
  });
  ws.getRow(6).height = 26;

  // Row 6 right: DOC NO
  setAll(ws.getCell("D6"), {
    value: "DOC NO",
    font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } },
    align: { horizontal: "right", vertical: "middle" },
    border: { top: thin, left: medium, bottom: thin, right: thin },
  });
  setAll(ws.getCell("E6"), {
    value: deliveryNo,
    font: { name: "Arial", size: 9, bold: true, color: { argb: NAVY } },
    align: { horizontal: "left", vertical: "middle" },
    border: { top: thin, left: thin, bottom: thin, right: medium },
  });
  ws.getRow(6).height = 26;

  // Row 7: address + DATE
  ws.mergeCells("A7:C7");
  setAll(ws.getCell("A7"), {
    value: receiverAddr,
    font: { name: "Arial", size: 9, color: { argb: MID_GRAY } },
    fill: WARM_LIGHT,
    align: { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 },
    border: { top: thin, left: medium, bottom: thin, right: medium },
  });
  ws.getRow(7).height = 24;

  setAll(ws.getCell("D7"), {
    value: "DATE",
    font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } },
    align: { horizontal: "right", vertical: "middle" },
    border: { top: thin, left: medium, bottom: thin, right: thin },
  });
  setAll(ws.getCell("E7"), {
    value: deliveryDate,
    font: { name: "Arial", size: 9, color: { argb: NAVY } },
    align: { horizontal: "left", vertical: "middle" },
    border: { top: thin, left: thin, bottom: thin, right: medium },
  });

  // Row 8: phone + CHECKER
  ws.mergeCells("A8:C8");
  setAll(ws.getCell("A8"), {
    value: receiverPhone,
    font: { name: "Arial", size: 9, color: { argb: MID_GRAY } },
    fill: WARM_LIGHT,
    align: { horizontal: "left", vertical: "middle", indent: 1 },
    border: { top: thin, left: medium, bottom: medium, right: medium },
  });
  ws.getRow(8).height = 18;

  setAll(ws.getCell("D8"), {
    value: "CHECKER",
    font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } },
    align: { horizontal: "right", vertical: "middle" },
    border: { top: thin, left: medium, bottom: thin, right: thin },
  });
  setAll(ws.getCell("E8"), {
    value: checkerDisplay,
    font: { name: "Arial", size: 9, bold: true, color: { argb: NAVY } },
    align: { horizontal: "left", vertical: "middle" },
    border: { top: thin, left: thin, bottom: thin, right: medium },
  });

  // Row 9: (spacer under ship-to) + TOTAL KOLI
  ws.mergeCells("A9:C9");
  setAll(ws.getCell("A9"), {
    value: "",
    border: { top: thin, left: medium, bottom: thin, right: medium },
  });
  ws.getRow(9).height = 18;

  setAll(ws.getCell("D9"), {
    value: "TOTAL KOLI",
    font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } },
    align: { horizontal: "right", vertical: "middle" },
    border: { top: thin, left: medium, bottom: thin, right: thin },
  });
  setAll(ws.getCell("E9"), {
    value: String(totalKoli),
    font: { name: "Arial", size: 10, bold: true, color: { argb: NAVY } },
    align: { horizontal: "left", vertical: "middle" },
    border: { top: thin, left: thin, bottom: thin, right: medium },
  });

  // Row 10: spacer + TOTAL WEIGHT
  ws.mergeCells("A10:C10");
  setAll(ws.getCell("A10"), { value: "" });
  ws.getRow(10).height = 6;

  setAll(ws.getCell("D10"), {
    value: "WEIGHT (KG)",
    font: { name: "Arial", size: 8, bold: true, color: { argb: MID_GRAY } },
    align: { horizontal: "right", vertical: "middle" },
    border: { top: thin, left: medium, bottom: thin, right: thin },
  });
  setAll(ws.getCell("E10"), {
    value: totalWeight.toFixed(2),
    font: { name: "Arial", size: 10, bold: true, color: { argb: "FFE67E22" } },
    align: { horizontal: "left", vertical: "middle" },
    border: { top: thin, left: thin, bottom: medium, right: medium },
  });
  ws.getRow(10).height = 18;

  // ════════════════════════════════════════════════════════════════
  //  SECTION 3 — TABLE HEADER (row 12)
  // ════════════════════════════════════════════════════════════════
  const HEADER_ROW = 12;
  ws.getRow(HEADER_ROW).height = 22;
  const headers = ["No.", "Description", "Qty", "Item Unit", "Notes"];
  const headerStyles: { align: string }[] = [
    { align: "center" }, { align: "left" }, { align: "center" }, { align: "center" }, { align: "left" },
  ];
  for (let i = 0; i < headers.length; i++) {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = headers[i];
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
    fill(cell, NAVY);
    cell.alignment = { horizontal: headerStyles[i].align as any, vertical: "middle" };
    cell.border = { top: medium, left: medium, bottom: medium, right: medium };
  }

  // ════════════════════════════════════════════════════════════════
  //  SECTION 4 — DATA ROWS (from HEADER_ROW+1)
  // ════════════════════════════════════════════════════════════════
  const rows = buildDisplayRows(boxes, order, master.ITEM_UOM||{});
  const START_ROW = HEADER_ROW + 1;

  rows.forEach((r, i) => {
    const rowNum = START_ROW + i;
    const values = [r.koli, r.sku, r.qty, r.uom, r.note];
    const aligns = ["center", "left", "center", "center", "left"] as const;
    const isEven = i % 2 === 0;

    for (let c = 0; c < values.length; c++) {
      const cell = ws.getCell(rowNum, c + 1);
      cell.value = values[c];
      cell.font = { name: "Arial", size: 9 };
      fill(cell, isEven ? WHITE : WARM_LIGHT);
      cell.alignment = { horizontal: aligns[c], vertical: "middle" };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    }
    ws.getRow(rowNum).height = 18;
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 5 — TOTALS ROW
  // ════════════════════════════════════════════════════════════════
  const totalRow = START_ROW + rows.length;
  ws.getRow(totalRow).height = 24;
  ws.mergeCells(totalRow, 1, totalRow, 4);
  setAll(ws.getCell(totalRow, 1), {
    value: "TOTAL",
    font: { name: "Arial", size: 10, bold: true, color: { argb: WHITE } },
    fill: NAVY,
    align: { horizontal: "right", vertical: "middle" },
    border: { top: medium, left: medium, bottom: medium, right: thin },
  });
  setAll(ws.getCell(totalRow, 5), {
    value: totalWeight.toFixed(2) + " Kg",
    font: { name: "Arial", size: 10, bold: true, color: { argb: NAVY } },
    fill: WARM_LIGHT,
    align: { horizontal: "center", vertical: "middle" },
    border: { top: medium, left: thin, bottom: medium, right: medium },
  });

  // ════════════════════════════════════════════════════════════════
  //  SECTION 6 — SIGNATURE BLOCK
  // ════════════════════════════════════════════════════════════════
  const sigStart = totalRow + 3;
  ws.getRow(sigStart).height = 18;
  ws.getRow(sigStart + 1).height = 18;
  ws.getRow(sigStart + 2).height = 16;

  // Each block is merged across its column range to prevent overflow overlap
  const sigBlocks = [
    { c1: 1, c2: 2, label: "Prepared By", role: preparedBy || "" },   // A-B (41 wide)
    { c1: 3, c2: 4, label: "Checked By",  role: "(CHECKER)" },        // C-D (21 wide)
    { c1: 5, c2: 5, label: "Received By", role: "(PENERIMA)" },       // E  (22 wide)
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

  // Bottom line disclaimer
  const disclaimerRow = sigStart + 4;
  ws.mergeCells(disclaimerRow, 1, disclaimerRow, 5);
  setAll(ws.getCell(disclaimerRow, 1), {
    value: "Dokumen ini dibuat secara otomatis oleh PLGen (Packing List Generator) — tidak memerlukan tanda tangan",
    font: { name: "Arial", size: 7, italic: true, color: { argb: "FFBDC3C7" } },
    align: { horizontal: "center", vertical: "middle" },
  });

  // ── Print area ──
  ws.pageSetup.printArea = "A1:E" + disclaimerRow;

  // ════════════════════════════════════════════════════════════════
  //  BACKEND LOGGING (fire-and-forget)
  // ════════════════════════════════════════════════════════════════
  const _base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
  try {
    await fetch(`${_base}/api/packing_status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:deliveryNo,outlet,checker:checkerDisplay,status:"PENDING",total_weight_kg: Number(totalWeight.toFixed(2))})});
    await fetch(`${_base}/api/track_item_usage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:deliveryNo,outlet,items:Object.fromEntries(Object.entries(order).map(([k,v])=>[k,v.qty]))})});
  } catch {}

  const buf = await wb.xlsx.writeBuffer() as ArrayBuffer;
  const _ts = (() => { const d = new Date(); return String(d.getDate()).padStart(2,"0") + String(d.getMonth()+1).padStart(2,"0") + d.getFullYear(); })();
  const filename = `${_ts}_${outlet}.xlsx`;
  saveAs(new Blob([buf]), filename);
  // Auto-upload to Supabase Storage via backend (persistent, downloadable later) — non-blocking, keeps local save
  try {
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
    fd.append("delivery_no", deliveryNo);
    fd.append("outlet", outlet);
    // fire-and-forget, backend stores to packing-lists bucket + packing_status
    fetch(`${_base}/api/upload_packing_list`, { method: "POST", body: fd } as any).catch(()=>{});
  } catch {}
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
