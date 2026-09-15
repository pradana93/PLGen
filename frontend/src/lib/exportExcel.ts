import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import QRCode from "qrcode";
import { Box, Order, getNextDeliveryNumber, getDeliveryDateWIB, buildDisplayRows, LOGISTICS_PALETTE, getOutletPalette } from "./packing";

// Packing List export - mirrors export_packing_list in core.py (template mode simplified)
export async function exportPackingList(outlet: string, boxes: Box[], order: Order, master: any, checkerDisplay: string) {
  const deliveryDate = getDeliveryDateWIB(1, master.HOLIDAYS||[]);
  const deliveryNo = getNextDeliveryNumber(master.companyCode||"BBB");
  const totalWeight = Object.entries(order).reduce((acc,[sku,data])=>{
    const w = master.ITEM_WEIGHT_GRAMS?.[sku]||0;
    return acc + (data.qty*w)/1000;
  },0);

  // Generate QR as data URL
  let qrDataUrl = "";
  try { qrDataUrl = await QRCode.toDataURL(`https://jestu93.pythonanywhere.com/scan/${encodeURIComponent(deliveryNo)}`, { width: 200 }); } catch {}

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Packing List");
  (ws.pageSetup as any).paperSize = 1; // A4
  ws.pageSetup.orientation = "portrait";
  // Title
  ws.getCell("A1").value = `Ship To : BANGOR - ${outlet.toUpperCase()}`;
  ws.getCell("A1").font = { bold:true, size:14 };
  ws.getCell("A2").value = `Checker: ${checkerDisplay}`;
  ws.getCell("A2").font = { italic:true, bold:true };
  ws.getCell("E2").value = "Delivery No :"; ws.getCell("F2").value = deliveryNo;
  ws.getCell("E3").value = "Delivery Date :"; ws.getCell("F3").value = deliveryDate;

  // QR embedding
  if (qrDataUrl) {
    const base64 = qrDataUrl.split(",")[1];
    const imgId = wb.addImage({ base64, extension: "png" });
    ws.addImage(imgId, "B6:C9");
  }

  const headers = ["No. Koli","Description","Qty","Item Unit","Notes"];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold:true, color:{ argb:"FFFFFFFF" } };
  headerRow.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF2C3E50" } };
  headerRow.alignment = { horizontal:"center" };
  // Insert after header row is currently row 6 (3 title + 1 header)
  const rows = buildDisplayRows(boxes, order, master.ITEM_UOM||{});
  rows.forEach(r=>{
    const row = ws.addRow([r.koli, r.sku, r.qty, r.uom, r.note]);
    row.getCell(1).alignment={ horizontal:"center" };
    row.getCell(3).alignment={ horizontal:"center" };
  });
  ws.columns.forEach(c=> c.width=18);
  ws.getColumn(2).width=32;

  // Log packing status to backend (fire-and-forget)
  try {
    await fetch(`${import.meta.env.VITE_API_URL||"http://localhost:4000"}/api/packing_status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:deliveryNo,outlet,checker:checkerDisplay,status:"PENDING",total_weight_kg: Number(totalWeight.toFixed(2))})});
    await fetch(`${import.meta.env.VITE_API_URL||"http://localhost:4000"}/api/track_item_usage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:deliveryNo,outlet,items:Object.fromEntries(Object.entries(order).map(([k,v])=>[k,v.qty]))})});
  } catch {}

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `${new Date().toISOString().slice(0,10)}_${outlet}.xlsx`);
  return { deliveryNo, totalWeight };
}

export async function exportLabels(outlet: string, boxes: Box[], master: any) {
  const wb = new ExcelJS.Workbook();
  const palette = getOutletPalette(outlet);
  const info = master.OUTLET_INFO?.[outlet.toUpperCase()] || { name: outlet, phone:"", address:"Address not available" };
  for (let idx=0; idx<boxes.length; idx+=6) {
    const chunk = boxes.slice(idx, idx+6);
    const ws = wb.addWorksheet(`Labels_${idx+1}_to_${Math.min(idx+6, boxes.length)}`);
    (ws.pageSetup as any).paperSize=1; ws.pageSetup.orientation="portrait"; ws.pageSetup.fitToPage=true;
    // simple label grid: 2 cols x 3 rows
    for(let li=0; li<chunk.length; li++){
      const colOffset = li%2===0? 1:6;
      const rowOffset = 2 + Math.floor(li/2)*12;
      const koliNum = idx+li+1;
      // Outlet name merged
      ws.mergeCells(rowOffset, colOffset, rowOffset+1, colOffset+4);
      const c1 = ws.getCell(rowOffset, colOffset);
      c1.value = outlet.toUpperCase(); c1.font={ bold:true, size:14 }; c1.alignment={ horizontal:"center", vertical:"middle" };
      ws.mergeCells(rowOffset+2, colOffset, rowOffset+2, colOffset+4);
      const c2 = ws.getCell(rowOffset+2, colOffset);
      c2.value = `No. Koli: ${koliNum} / ${boxes.length}`; c2.font={ bold:true }; c2.alignment={ horizontal:"center" };
      ws.mergeCells(rowOffset+3, colOffset, rowOffset+4, colOffset+4);
      const c3 = ws.getCell(rowOffset+3, colOffset);
      c3.value = info.address; c3.alignment={ horizontal:"center", vertical:"middle", wrapText:true };
      // Receiver block with palette color
      ws.mergeCells(rowOffset+5, colOffset, rowOffset+5, colOffset+1);
      const rLbl = ws.getCell(rowOffset+5, colOffset); rLbl.value="PENERIMA"; rLbl.fill={ type:"pattern", pattern:"solid", fgColor:{ argb:"FF"+palette.bg }}; rLbl.font={ color:{ argb:"FF"+palette.text }, bold:true }; rLbl.alignment={ horizontal:"center" };
      ws.mergeCells(rowOffset+7, colOffset, rowOffset+7, colOffset+1);
      const sLbl = ws.getCell(rowOffset+7, colOffset); sLbl.value="PENGIRIM"; sLbl.fill={ type:"pattern", pattern:"solid", fgColor:{ argb:"FF2C3E50" }}; sLbl.font={ color:{argb:"FFFFFFFF"}, bold:true }; sLbl.alignment={ horizontal:"center" };
      ws.getCell(rowOffset+5, colOffset+2).value = info.name;
      ws.getCell(rowOffset+6, colOffset+2).value = info.phone;
      ws.getCell(rowOffset+7, colOffset+2).value = "BURGER BANGOR";
      ws.getCell(rowOffset+8, colOffset+2).value = "082125627591";
      // borders
      for(let c=colOffset;c<colOffset+5;c++){ ws.getCell(rowOffset, c).border={ top:{ style:"thick" }}; ws.getCell(rowOffset+9,c).border={ bottom:{ style:"thick"}}; }
    }
    ws.columns.forEach(c=> c.width=16);
  }
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `${outlet}_${new Date().toISOString().slice(0,10)}_labels.xlsx`);
}
