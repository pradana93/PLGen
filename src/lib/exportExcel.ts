// 1:1 port of core.py export_packing_list + addons.py generate_labels
// Preserves: A4 portrait layout, QR embed (B44), header rows, palette fills, thick borders, row heights, print area
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import QRCode from "qrcode";
import { Box, Order, getNextDeliveryNumber, getDeliveryDateWIB, buildDisplayRows, getOutletPalette } from "./packing";

const ARIA = "Arial";
const ARIA_BLACK = "Arial Black";

// Packing List export — mirrors export_packing_list in core.py (template mode simplified, same row layout)
export async function exportPackingList(outlet: string, boxes: Box[], order: Order, master: any, checkerDisplay: string) {
  const deliveryDate = getDeliveryDateWIB(1, master.HOLIDAYS||[]);
  const deliveryNo = getNextDeliveryNumber(master.companyCode||"BBB");
  const totalWeight = Object.entries(order).reduce((acc,[sku,data])=>{
    const w = master.ITEM_WEIGHT_GRAMS?.[sku]||0;
    return acc + (data.qty*w)/1000;
  },0);

  // Generate QR as data URL (like addons.generate_qr_code_image → qr_url encoded)
  let qrDataUrl = "";
  try { qrDataUrl = await QRCode.toDataURL(`https://jestu93.pythonanywhere.com/scan/${encodeURIComponent(deliveryNo)}`, { width: 200 }); } catch {}

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Packing List");

  // Page setup — A4 portrait, repeated print area like template mode
  (ws.pageSetup as any).paperSize = 9; // PAPERSIZE_A4
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = false;
  ws.pageSetup.horizontalCentered = false;
  ws.pageSetup.printArea = "A1:E48"; // enforce print area to prevent blank pages
  ws.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 };

  // Title rows (template mode positions)
  ws.getCell("A1").value = `Ship To : BANGOR - ${outlet.toUpperCase()}`;
  ws.getCell("A1").font = { bold: true, size: 16, name: ARIA_BLACK };
  ws.getCell("A2").value = `Assigned Checker: ${checkerDisplay}`;
  ws.getCell("A2").font = { bold: true, italic: true, size: 10, name: ARIA };
  ws.getCell("D4").value = "Delivery No :";
  ws.getCell("D4").font = { bold: true, size: 10, name: ARIA };
  ws.getCell("E4").value = deliveryNo;
  ws.getCell("E4").font = { bold: true, size: 10, name: ARIA };
  ws.getCell("D5").value = "Delivery Date :";
  ws.getCell("D5").font = { bold: true, size: 10, name: ARIA };
  ws.getCell("E5").value = deliveryDate;
  ws.getCell("E5").font = { bold: true, size: 10, name: ARIA };

  // Header row like template (row 8)
  const headers = ["No. Koli", "Description", "Qty", "Item Unit", "Notes"];
  for (let i = 0; i < headers.length; i++) {
    const cell = ws.getCell(8, i + 1);
    cell.value = headers[i];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: ARIA };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C3E50" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  // Data rows from row 9 (START_ROW) — like template pagination rows
  const rows = buildDisplayRows(boxes, order, master.ITEM_UOM||{});
  rows.forEach((r, i) => {
    const rowNum = 9 + i;
    const cells = [r.koli, r.sku, r.qty, r.uom, r.note];
    for (let c = 0; c < cells.length; c++) {
      const cell = ws.getCell(rowNum, c + 1);
      cell.value = cells[c];
      cell.font = { size: 10, name: ARIA };
      if (c === 0 || c === 2) cell.alignment = { horizontal: "center" };
      if (c === 1) cell.alignment = { vertical: "middle" };
    }
  });

  // QR code like template mode: patched to B44 (110x110)
  if (qrDataUrl) {
    const base64 = qrDataUrl.split(",")[1];
    const imgId = wb.addImage({ base64, extension: "png" });
    ws.addImage(imgId, "B44:C47");
  }

  // Column widths — Description wider
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 20;
  ws.getRow(8).height = 22;

  // Log packing status to backend (fire-and-forget)
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
