// Ported 1:1 from core.py calculate_boxes + master data handling
// Logic must NOT be changed when transitioning to TypeScript

export type OrderItem = { qty: number; note: string };
export type Order = Record<string, OrderItem>;
export type Box = Record<string, number>;

export type MasterDB = {
  BOX_TOLERANCE: number;
  CATEGORIES: Record<string, string[]>;
  ITEM_UOM: Record<string, string>;
  BOX_CAPACITY: Record<string, number>;
  HOLIDAYS?: string[];
  OUTLET_INFO?: Record<string, { name: string; phone: string; address: string; auto_registered?: boolean; registered_by?: string; registered_at?: string }>;
  KODE_BARANG?: Record<string, string>;
  ITEM_WEIGHT_GRAMS?: Record<string, number>;
};

export const FALLBACK_MASTER_DATA: MasterDB = {
  BOX_TOLERANCE: 1.859,
  CATEGORIES: {
    FROZEN_ITEMS: ["Beef Patty Small","Beef Patty Large","Keju Slice Non Brand","Keju Slice Non Brand A","Chicken Nugget","Spicy Chicken Nugget","Bangor Fried Chicken","Sosis","Ayam Crispy","Dori Crispy","BEEF SLICE","Smoke Beef Slice","Spicy Chicken Patty","Bangor Chicken Wings"],
    KENTANG_ITEMS: ["Kentang Goreng","Kentang Goreng Mc Cain"],
    SAUCE_ITEMS: ["BBQ Sauce","BBQ Spicy","Bolognese Sauce 500gr","Cheese Sauce","Nacho Sauce New","Mayonaise Garlic","Nestea Lemontea","Butter","Thousand Island Mayonaise"],
    PACKAGING_ITEMS: ["Kertas Nasi","Paper Kentang","Tray Kentang","Paper Bag","Packaging Box Sultan","Packaging HD","Kertas Printer","Cup Plastik 14 oz","Tutup Gelas","Cup Sauce","Sedotan","Hand Gloves","Kresek Kecil","Kresek Besar","Kresek Gelas","Bangor Crazy Bucket","Spunbond Bangor","Sticker Labeling","Tissue Pop Up","Box Hampers","Grill Box","Inner","Bangor Thermal Bag","Kertas Thermal","Kupon Umroh"],
    APPAREL_ITEMS: ["Kaus Seragam M","Kaus Seragam L","Kaus Seragam XL","Kaus Seragam XXL","Kaus Seragam XXXL","Topi","Polo Shirt S","Polo Shirt M","Polo Shirt L","Polo Shirt XL","Polo Shirt XXL","Polo Shirt XXXL","Apron","Seragam Owner S","Seragam Owner M","Seragam Owner L","Seragam Owner XL","Seragam Owner XXL","Seragam Owner XXXL"],
    BIG_ITEMS: ["Minyak Padat","Sabun Cuci Piring Mitra","Sabun Cuci Tangan @5 Liter","Sabun Lantai Mitra","Hand Sanitizer","Sabun MPC","Sabun Kerak","Cetakan Telur","Sambal Sachet Bangor","Saos Tomat Jerigen Delmonte"],
    BREAD_ITEMS: ["HD Bun","Burger Bun"],
    BUNDLE_ITEMS: ["Box Hampers","Grill Box","Inner"],
  },
  ITEM_UOM: {
    "Beef Patty Small":"Pack","Beef Patty Large":"Pack","Keju Slice Non Brand":"Pack","Keju Slice Non Brand A":"Pack","Chicken Nugget":"Pack","Spicy Chicken Nugget":"Pack","Kentang Goreng":"Pack","Kentang Goreng Mc Cain":"Pack","Bangor Fried Chicken":"Pack","Sosis":"Pack","Ayam Crispy":"Pack","Dori Crispy":"Pack","BEEF SLICE":"Pack","Smoke Beef Slice":"Pack","Spicy Chicken Patty":"Pack","HD Bun":"Pack","Burger Bun":"Pack","Thousand Island Mayonaise":"Pack","BBQ Sauce":"Pack","BBQ Spicy":"Pack","Bolognese Sauce 500gr":"Pack","Cheese Sauce":"Pack","Nacho Sauce New":"Pack","Mayonaise Garlic":"Pack","Nestea Lemontea":"Pack","Sambal Sachet Bangor":"Dus","Butter":"Pack","Sticker Labeling":"Ikat","Tissue Pop Up":"Pack","Kertas Nasi":"Pack","Paper Kentang":"Pack","Tray Kentang":"Pack","Paper Bag":"Pack","Packaging HD":"Ikat","Cup Plastik 14 oz":"Pack","Tutup Gelas":"Pack","Cup Sauce":"Pack","Sedotan":"Pack","Hand Gloves":"Pack","Kresek Kecil":"Pack","Kresek Besar":"Pack","Kresek Gelas":"Pack","Bangor Thermal Bag":"Pack","Kupon Umroh":"Buku","Packaging Box Sultan":"Ikat","Minyak Padat":"Dus","Box Hampers":"Pcs","Grill Box":"Pcs","Inner":"Pcs","Sabun Cuci Piring Mitra":"Jrg","Sabun Cuci Tangan @5 Liter":"Jrg","Sabun Lantai Mitra":"Jrg","Hand Sanitizer":"Jrg","Sabun MPC":"Jrg","Sabun Kerak":"Jrg","Kaus Seragam M":"Pcs","Kaus Seragam L":"Pcs","Kaus Seragam XL":"Pcs","Kaus Seragam XXL":"Pcs","Kaus Seragam XXXL":"Pcs","Topi":"Pcs","Bangor Crazy Bucket":"Pack","Polo Shirt S":"Pcs","Polo Shirt M":"Pcs","Polo Shirt L":"Pcs","Polo Shirt XL":"Pcs","Polo Shirt XXL":"Pcs","Polo Shirt XXXL":"Pcs","Apron":"Pcs","Seragam Owner S":"Pcs","Seragam Owner M":"Pcs","Seragam Owner L":"Pcs","Seragam Owner XL":"Pcs","Seragam Owner XXL":"Pcs","Seragam Owner XXXL":"Pcs","Cetakan Telur":"Pcs","Bangor Chicken Wings":"Pack","Kertas Thermal":"Pack","Saos Tomat Jerigen Delmonte":"Jrg"
  },
  BOX_CAPACITY: {
    "Beef Patty Small":18,"Beef Patty Large":18,"Keju Slice Non Brand":12,"Keju Slice Non Brand A":12,"Chicken Nugget":10,"HD Bun":30,"Burger Bun":20,"Kentang Goreng":15,"Kentang Goreng Mc Cain":20,"Bangor Fried Chicken":6,"Spicy Chicken Nugget":5,"Spicy Chicken Patty":10,"Sosis":10,"Ayam Crispy":10,"Dori Crispy":24,"BEEF SLICE":40,"Smoke Beef Slice":150,"Thousand Island Mayonaise":20,"BBQ Sauce":20,"BBQ Spicy":20,"Bolognese Sauce 500gr":20,"Cheese Sauce":12,"Nacho Sauce New":24,"Mayonaise Garlic":20,"Nestea Lemontea":12,"Butter":40,"Sambal Sachet Bangor":1,"Minyak Padat":1,"Kertas Nasi":20,"Paper Kentang":30,"Tray Kentang":60,"Paper Bag":30,"Packaging Box Sultan":50,"Packaging HD":50,"Kertas Printer":10,"Cup Plastik 14 oz":40,"Tutup Gelas":40,"Cup Sauce":24,"Sedotan":50,"Hand Gloves":150,"Kresek Kecil":50,"Kresek Besar":50,"Kresek Gelas":50,"Kaus Seragam M":50,"Kaus Seragam L":50,"Kaus Seragam XL":50,"Kaus Seragam XXL":50,"Kaus Seragam XXXL":50,"Topi":50,"Box Hampers":50,"Grill Box":50,"Inner":50,"Bangor Crazy Bucket":9,"Spunbond Bangor":50,"Bangor Thermal Bag":5,"Sticker Labeling":100,"Polo Shirt S":50,"Polo Shirt M":50,"Polo Shirt L":50,"Polo Shirt XL":50,"Polo Shirt XXL":50,"Polo Shirt XXXL":50,"Apron":50,"Seragam Owner S":50,"Seragam Owner M":50,"Seragam Owner L":50,"Seragam Owner XL":50,"Seragam Owner XXL":50,"Seragam Owner XXXL":50,"Cetakan Telur":2,"Sabun Cuci Piring Mitra":1,"Sabun Cuci Tangan @5 Liter":1,"Sabun Lantai Mitra":1,"Hand Sanitizer":1,"Sabun MPC":1,"Sabun Kerak":1,"Tissue Pop Up":50,"Bangor Chicken Wings":6,"Kertas Thermal":10,"Saos Tomat Jerigen Delmonte":1,"Kupon Umroh":200
  },
  HOLIDAYS: [],
  OUTLET_INFO: {},
  KODE_BARANG: {},
  ITEM_WEIGHT_GRAMS: {}
};

// ---- 1:1 port of calculate_boxes from core.py:128-256 ----
export function calculateBoxes(order: Order, master: MasterDB, currentTolerance?: number): Box[] {
  const box_capacity = master.BOX_CAPACITY;
  const FROZEN_ITEMS = new Set(master.CATEGORIES["FROZEN_ITEMS"] || []);
  const KENTANG_ITEMS = new Set(master.CATEGORIES["KENTANG_ITEMS"] || []);
  const SAUCE_ITEMS = new Set(master.CATEGORIES["SAUCE_ITEMS"] || []);
  const PACKAGING_ITEMS = new Set(master.CATEGORIES["PACKAGING_ITEMS"] || []);
  const APPAREL_ITEMS = new Set(master.CATEGORIES["APPAREL_ITEMS"] || []);
  const BIG_ITEMS = new Set(master.CATEGORIES["BIG_ITEMS"] || []);
  const BREAD_ITEMS = new Set(master.CATEGORIES["BREAD_ITEMS"] || []);
  const BUNDLE_ITEMS = new Set(master.CATEGORIES["BUNDLE_ITEMS"] || []);
  const DRY_ITEMS = new Set([...Array.from(SAUCE_ITEMS), ...Array.from(PACKAGING_ITEMS), ...Array.from(APPAREL_ITEMS)].filter(x=> !BUNDLE_ITEMS.has(x)));

  const finalBoxes: Box[] = [];
  const remaining: Record<string, number> = {};
  for (const [sku, data] of Object.entries(order)) if (data.qty>0) remaining[sku]=data.qty;
  const TOLERANCE = currentTolerance ?? master.BOX_TOLERANCE ?? 1.859;

  const isolatedKejuBoxes: Box[] = [];
  for (const sku of ["Keju Slice Non Brand","Keju Slice Non Brand A"]) {
    if (sku in remaining && order[sku].qty > 3) {
      const cap = box_capacity[sku] ?? 12;
      while (remaining[sku] > 0) {
        const take = Math.min(remaining[sku], cap);
        isolatedKejuBoxes.push({ [sku]: take });
        remaining[sku] -= take;
      }
      delete remaining[sku];
    }
  }

  function packCategoryGreedy(categorySet: Set<string>) {
    const activeSet = new Set([...Array.from(categorySet)].filter(x=> !BUNDLE_ITEMS.has(x)));
    const catSkus = [...Array.from(activeSet)].filter(s=> s in remaining && remaining[s]>0);
    catSkus.sort((a,b)=> (1/(box_capacity[a]??1)) > (1/(box_capacity[b]??1)) ? -1 : 1);
    let currentBox: Box = {};
    let usedSpace = 0;
    for (const sku of catSkus) {
      const qtyToPack = remaining[sku];
      if (qtyToPack<=0) continue;
      const unitSpace = 1/(box_capacity[sku]??1);
      const itemTotalSpace = qtyToPack*unitSpace;
      if (Object.keys(currentBox).length>0 && (usedSpace+itemTotalSpace > TOLERANCE+0.0001)) {
        finalBoxes.push(currentBox);
        currentBox={}; usedSpace=0;
      }
      currentBox[sku]=qtyToPack;
      usedSpace+=itemTotalSpace;
      remaining[sku]=0;
    }
    if (Object.keys(currentBox).length>0) finalBoxes.push(currentBox);
  }

  // Frozen full boxes
  for (const sku of Object.keys({...remaining})) {
    if (FROZEN_ITEMS.has(sku)) {
      const cap = box_capacity[sku]??1;
      if (["Beef Patty Large","Beef Patty Small"].includes(sku) || remaining[sku] >= cap) {
        const fullBoxes = Math.floor(remaining[sku]/cap);
        for(let i=0;i<fullBoxes;i++) finalBoxes.push({ [sku]: cap });
        remaining[sku] %= cap;
        if (remaining[sku]===0) delete remaining[sku];
      }
    }
  }
  for (const sku of Array.from(KENTANG_ITEMS)) {
    if (sku in remaining) {
      const cap = box_capacity[sku]??15;
      if (remaining[sku] >= cap) {
        const fullBoxes = Math.floor(remaining[sku]/cap);
        for(let i=0;i<fullBoxes;i++) finalBoxes.push({ [sku]: cap });
        remaining[sku] %= cap;
      }
    }
  }
  if (isolatedKejuBoxes.length) finalBoxes.push(...isolatedKejuBoxes);
  packCategoryGreedy(FROZEN_ITEMS);
  packCategoryGreedy(KENTANG_ITEMS);
  for (const sku of Object.keys({...remaining})) {
    if (DRY_ITEMS.has(sku)) {
      const cap = box_capacity[sku]??1;
      if (cap>1 && remaining[sku]>=cap) {
        const fullBoxes = Math.floor(remaining[sku]/cap);
        for(let i=0;i<fullBoxes;i++) finalBoxes.push({ [sku]: cap });
        remaining[sku] %= cap;
      }
    }
  }
  packCategoryGreedy(DRY_ITEMS);
  for (const sku of Array.from(BREAD_ITEMS)) {
    if (sku in remaining) {
      const cap = box_capacity[sku]??1;
      while (remaining[sku]>0) {
        const take=Math.min(remaining[sku], cap);
        finalBoxes.push({[sku]:take});
        remaining[sku]-=take;
      }
    }
  }
  for (const sku of Array.from(BIG_ITEMS)) {
    if (sku in remaining) {
      for(let i=0;i<remaining[sku];i++) finalBoxes.push({[sku]:1});
      remaining[sku]=0;
    }
  }
  let currentBundleBox: Box = {};
  let currentBundleQty=0;
  for (const sku of Array.from(BUNDLE_ITEMS)) {
    while (sku in remaining && remaining[sku]>0) {
      const spaceLeft=50-currentBundleQty;
      const take=Math.min(remaining[sku], spaceLeft);
      if(take>0){ currentBundleBox[sku]=(currentBundleBox[sku]||0)+take; remaining[sku]-=take; currentBundleQty+=take; }
      if(currentBundleQty===50){ finalBoxes.push(currentBundleBox); currentBundleBox={}; currentBundleQty=0; }
    }
    if (sku in remaining) delete remaining[sku];
  }
  if (Object.keys(currentBundleBox).length>0) finalBoxes.push(currentBundleBox);
  return finalBoxes;
}

// Quantity multipliers from core.py add_item / subtract_item logic
export function toPackedQty(sku: string, baseQty: number): number {
  if (["Beef Patty Small","Beef Patty Large"].includes(sku)) return baseQty*18;
  if (sku==="Thousand Island Mayonaise") return baseQty*20;
  if (sku==="Thousand Island (BBT)") return baseQty*1;
  if (sku==="Butter") return baseQty*40;
  return baseQty;
}
export function fromPackedQty(sku: string, packedQty: number): number {
  if (["Beef Patty Small","Beef Patty Large"].includes(sku)) return Math.floor(packedQty/18);
  if (sku==="Thousand Island Mayonaise") return Math.floor(packedQty/20);
  if (sku==="Butter") return Math.floor(packedQty/40);
  return packedQty;
}

// Delivery number like core.py get_next_delivery_number
export function getNextDeliveryNumber(companyCode="BBB"): string {
  const key=`delivery_counter_${companyCode}`;
  const today=new Date();
  const dd=String(today.getDate()).padStart(2,"0");
  const mm=String(today.getMonth()+1).padStart(2,"0");
  const yyyy=today.getFullYear();
  const todayStr=`${dd}${mm}${yyyy}`;
  const raw=localStorage.getItem(key);
  let lastNumber=0, lastDate:string|null=null;
  if(raw){
    const parts=raw.split("|");
    if(parts.length===2){ lastDate=parts[0]; lastNumber=parseInt(parts[1],10)||0; }
  }
  if(lastDate!==todayStr) lastNumber=0;
  const newNumber=lastNumber+1;
  localStorage.setItem(key, `${todayStr}|${newNumber}`);
  return `DO/${companyCode}/${todayStr}/${String(newNumber).padStart(3,"0")}`;
}

export function getDeliveryDateWIB(leadTimeDays=1, holidays: string[]=[]): string {
  const holidaySet=new Set(holidays);
  let d=new Date();
  let added=0;
  while(added<leadTimeDays){
    d.setDate(d.getDate()+1);
    const isSunday=d.getDay()===0;
    const ymd=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const isHoliday=holidaySet.has(ymd);
    if(!isSunday && !isHoliday) added++;
  }
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

// Palette like addons.py
export const LOGISTICS_PALETTE=[
  {bg:"2980B9",text:"FFFFFF"},{bg:"27AE60",text:"FFFFFF"},{bg:"E67E22",text:"FFFFFF"},{bg:"8E44AD",text:"FFFFFF"},{bg:"16A085",text:"FFFFFF"},{bg:"C0392B",text:"FFFFFF"},{bg:"F39C12",text:"000000"},{bg:"D35400",text:"FFFFFF"},{bg:"2C3E50",text:"FFFFFF"},{bg:"7F8C8D",text:"FFFFFF"},
];
export function getOutletPalette(outlet:string){ const h=[...outlet.toUpperCase()].reduce((a,c)=>a+c.charCodeAt(0),0); return LOGISTICS_PALETTE[h%LOGISTICS_PALETTE.length]; }

// Export helper: build display rows like export_packing_list
export function buildDisplayRows(boxes: Box[], order: Order, ITEM_UOM: Record<string,string>){
  const rows: {koli:string|number; sku:string; qty:number; uom:string; note:string}[]=[];
  boxes.forEach((box,i)=>{
    let first=true;
    for(const [sku,qty] of Object.entries(box)){
      rows.push({ koli: first? i+1 : "", sku, qty, uom: ITEM_UOM[sku]||"Pack", note: order[sku]?.note||"" });
      first=false;
    }
  });
  return rows;
}
