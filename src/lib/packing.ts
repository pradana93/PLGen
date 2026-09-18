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
  "BOX_TOLERANCE": 1.859,
  "CATEGORIES": {
    "APPAREL_ITEMS": [
      "Kaus Seragam M",
      "Kaus Seragam L",
      "Kaus Seragam XL",
      "Kaus Seragam XXL",
      "Kaus Seragam XXXL",
      "Topi",
      "Polo Shirt S",
      "Polo Shirt M",
      "Polo Shirt L",
      "Polo Shirt XL",
      "Polo Shirt XXL",
      "Polo Shirt XXXL",
      "Apron",
      "Seragam Owner S",
      "Seragam Owner M",
      "Seragam Owner L",
      "Seragam Owner XL",
      "Seragam Owner XXL",
      "Seragam Owner XXXL",
      "Name Tag"
    ],
    "BIG_ITEMS": [
      "Minyak Padat",
      "Sabun Cuci Piring Mitra",
      "Sabun Lantai Mitra",
      "Sabun MPC",
      "Sabun Kerak",
      "Sambal Sachet Bangor",
      "Saos Tomat Jerigen Delmonte",
      "Pembersih Kerak",
      "Sabun MPC (BBT)",
      "Pembersih Kerak (BBT)",
      "Sabun Cuci Tangan",
      "Hand Sanitizer"
    ],
    "BREAD_ITEMS": [
      "HD Bun",
      "Burger Bun (20)",
      "HD Bun (BBT)",
      "Burger Bun (BBT)"
    ],
    "BUNDLE_ITEMS": [
      "Box Hampers",
      "Grill Box",
      "Inner",
      "Dus Hampers"
    ],
    "FROZEN_ITEMS": [
      "Beef Patty Small",
      "Beef Patty Large",
      "Keju Slice Non Brand",
      "Keju Slice Non Brand A",
      "Chicken Nugget",
      "Spicy Chicken Nugget",
      "Bangor Fried Chicken",
      "Sosis",
      "Ayam Crispy",
      "Dori Crispy",
      "Smoke Beef Slice",
      "Bangor Chicken Wings",
      "Cheese Slice",
      "Beef Slice",
      "Chicken Wings",
      "Spicy Chicken Patty",
      "Beef Patty Large (BBT)",
      "Beef Patty Small (BBT)",
      "Keju Anchor",
      "Jawara Patty"
    ],
    "KENTANG_ITEMS": [
      "Kentang Goreng",
      "Kentang Goreng Mc Cain"
    ],
    "PACKAGING_ITEMS": [
      "Poster Halal",
      "Kertas Nasi",
      "Paper Kentang",
      "Tray Kentang",
      "Paper Bag",
      "Packaging Box Sultan",
      "Packaging HD",
      "Kertas Printer",
      "Cup Plastik 14 oz",
      "Tutup Gelas",
      "Cup Sauce",
      "Sedotan",
      "Hand Gloves",
      "Kresek Kecil",
      "Kresek Besar",
      "Kresek Gelas",
      "Bangor Crazy Bucket",
      "Sticker Labeling",
      "Tissue Pop Up",
      "Box Hampers",
      "Grill Box",
      "Inner",
      "Bangor Thermal Bag",
      "Kertas Thermal",
      "Spunbond Bangor",
      "Spunbond Polos + Sticker",
      "Gelas Plastik",
      "Gelas Plastik + Tutup",
      "Cetakan Telur",
      "Thermal Bag",
      "Tutup Gelas Plastik",
      "Plastik Kresek Gelas",
      "Sticker Labeling (BBT)",
      "Cup Sauce (BBT)",
      "Kresek Gelas (BBT)",
      "Kresek Besar (BBT)",
      "Kresek Kecil (BBT)",
      "Hand Gloves (BBT)",
      "Sedotan (BBT)",
      "Packaging Box Sultan (BBT)",
      "Paper Kentang (BBT)",
      "Paper Bag (BBT)",
      "Tray Kentang (BBT)",
      "Packaging HD (BBT)",
      "Kertas Nasi (BBT)",
      "Kupon Umroh"
    ],
    "SAUCE_ITEMS": [
      "BBQ Sauce",
      "BBQ Spicy",
      "Bolognese Sauce 500gr",
      "Cheese Sauce",
      "Nacho Sauce New",
      "Mayonaise Garlic",
      "Nestea Lemontea",
      "Butter",
      "Thousand Island Mayonaise",
      "Nachos Sauce",
      "Lemon Tea",
      "Thousand Island",
      "Bolognese Sauce",
      "Mayonaise Garlic (BBT)",
      "BBQ Spicy (BBT)",
      "BBQ Sauce (BBT)",
      "Thousand Island (BBT)",
      "Bolognese Sauce (BBT)"
    ]
  },
  "ITEM_UOM": {
    "Kaus Seragam M": "Pcs",
    "Kaus Seragam L": "Pcs",
    "Kaus Seragam XL": "Pcs",
    "Kaus Seragam XXL": "Pcs",
    "Kaus Seragam XXXL": "Pcs",
    "Topi": "Pcs",
    "Polo Shirt S": "Pcs",
    "Polo Shirt M": "Pcs",
    "Polo Shirt L": "Pcs",
    "Polo Shirt XL": "Pcs",
    "Polo Shirt XXL": "Pcs",
    "Polo Shirt XXXL": "Pcs",
    "Apron": "Pcs",
    "Seragam Owner S": "Pcs",
    "Seragam Owner M": "Pcs",
    "Seragam Owner L": "Pcs",
    "Seragam Owner XL": "Pcs",
    "Seragam Owner XXL": "Pcs",
    "Seragam Owner XXXL": "Pcs",
    "Name Tag": "Pack",
    "Minyak Padat": "Dus",
    "Sabun Cuci Piring Mitra": "Jrg",
    "Sabun Lantai Mitra": "Jrg",
    "Sabun MPC": "Jrg",
    "Sabun Kerak": "Jrg",
    "Sambal Sachet Bangor": "Dus",
    "Saos Tomat Jerigen Delmonte": "Jrg",
    "Pembersih Kerak": "Jrg",
    "Sabun MPC (BBT)": "Jrg",
    "Pembersih Kerak (BBT)": "Jrg",
    "Sabun Cuci Tangan": "Jrg",
    "Hand Sanitizer": "Jrg",
    "HD Bun": "Pack",
    "Burger Bun (20)": "Pack",
    "HD Bun (BBT)": "Pack",
    "Burger Bun (BBT)": "Dus",
    "Box Hampers": "Pcs",
    "Grill Box": "Pcs",
    "Inner": "Pcs",
    "Dus Hampers": "Pcs",
    "Beef Patty Small": "Pack",
    "Beef Patty Large": "Pack",
    "Keju Slice Non Brand": "Pack",
    "Keju Slice Non Brand A": "Pack",
    "Chicken Nugget": "Pack",
    "Spicy Chicken Nugget": "Pack",
    "Bangor Fried Chicken": "Pack",
    "Sosis": "Pack",
    "Ayam Crispy": "Pack",
    "Dori Crispy": "Pack",
    "Smoke Beef Slice": "Pack",
    "Bangor Chicken Wings": "Pack",
    "Cheese Slice": "Pack",
    "Beef Slice": "Pack",
    "Chicken Wings": "Pack",
    "Spicy Chicken Patty": "Pack",
    "Beef Patty Large (BBT)": "Pack",
    "Beef Patty Small (BBT)": "Pack",
    "Keju Anchor": "Pack",
    "Jawara Patty": "Pack",
    "Kentang Goreng": "Pack",
    "Kentang Goreng Mc Cain": "Pack",
    "Poster Halal": "Pcs",
    "Kertas Nasi": "Pack",
    "Paper Kentang": "Pack",
    "Tray Kentang": "Pack",
    "Paper Bag": "Pack",
    "Packaging Box Sultan": "Ikat",
    "Packaging HD": "Ikat",
    "Kertas Printer": "Pack",
    "Cup Plastik 14 oz": "Pack",
    "Tutup Gelas": "Pack",
    "Cup Sauce": "Pack",
    "Sedotan": "Pack",
    "Hand Gloves": "Pack",
    "Kresek Kecil": "Pack",
    "Kresek Besar": "Pack",
    "Kresek Gelas": "Pack",
    "Bangor Crazy Bucket": "Pack",
    "Sticker Labeling": "Ikat",
    "Tissue Pop Up": "Pack",
    "Bangor Thermal Bag": "Pack",
    "Kertas Thermal": "Pack",
    "Spunbond Bangor": "Pack",
    "Spunbond Polos + Sticker": "Pcs",
    "Gelas Plastik": "Pack",
    "Gelas Plastik + Tutup": "Pack",
    "Cetakan Telur": "Pcs",
    "Thermal Bag": "Pack",
    "Tutup Gelas Plastik": "Pack",
    "Plastik Kresek Gelas": "Pack",
    "Sticker Labeling (BBT)": "Ikat",
    "Cup Sauce (BBT)": "Pack",
    "Kresek Gelas (BBT)": "Pack",
    "Kresek Besar (BBT)": "Pack",
    "Kresek Kecil (BBT)": "Pack",
    "Hand Gloves (BBT)": "Pack",
    "Sedotan (BBT)": "Pack",
    "Packaging Box Sultan (BBT)": "Ikat",
    "Paper Kentang (BBT)": "Pack",
    "Paper Bag (BBT)": "Pack",
    "Tray Kentang (BBT)": "Pack",
    "Packaging HD (BBT)": "Ikat",
    "Kertas Nasi (BBT)": "Pack",
    "Kupon Umroh": "RIM",
    "BBQ Sauce": "Pack",
    "BBQ Spicy": "Pack",
    "Bolognese Sauce 500gr": "Pack",
    "Cheese Sauce": "Pack",
    "Nacho Sauce New": "Pack",
    "Mayonaise Garlic": "Pack",
    "Nestea Lemontea": "Pack",
    "Butter": "Pack",
    "Thousand Island Mayonaise": "Pack",
    "Nachos Sauce": "Pack",
    "Lemon Tea": "Pack",
    "Thousand Island": "Pack",
    "Bolognese Sauce": "Pack",
    "Mayonaise Garlic (BBT)": "Pack",
    "BBQ Spicy (BBT)": "Pack",
    "BBQ Sauce (BBT)": "Pack",
    "Thousand Island (BBT)": "Pack",
    "Bolognese Sauce (BBT)": "Pack"
  },
  "BOX_CAPACITY": {
    "Kaus Seragam M": 50,
    "Kaus Seragam L": 50,
    "Kaus Seragam XL": 50,
    "Kaus Seragam XXL": 50,
    "Kaus Seragam XXXL": 50,
    "Topi": 50,
    "Polo Shirt S": 50,
    "Polo Shirt M": 50,
    "Polo Shirt L": 50,
    "Polo Shirt XL": 50,
    "Polo Shirt XXL": 50,
    "Polo Shirt XXXL": 50,
    "Apron": 50,
    "Seragam Owner S": 50,
    "Seragam Owner M": 50,
    "Seragam Owner L": 50,
    "Seragam Owner XL": 50,
    "Seragam Owner XXL": 50,
    "Seragam Owner XXXL": 50,
    "Name Tag": 50,
    "Minyak Padat": 1,
    "Sabun Cuci Piring Mitra": 1,
    "Sabun Lantai Mitra": 1,
    "Sabun MPC": 1,
    "Sabun Kerak": 1,
    "Sambal Sachet Bangor": 1,
    "Saos Tomat Jerigen Delmonte": 1,
    "Pembersih Kerak": 1,
    "Sabun MPC (BBT)": 1,
    "Pembersih Kerak (BBT)": 1,
    "Sabun Cuci Tangan": 1,
    "Hand Sanitizer": 1,
    "HD Bun": 30,
    "Burger Bun (20)": 20,
    "HD Bun (BBT)": 30,
    "Burger Bun (BBT)": 1,
    "Box Hampers": 50,
    "Grill Box": 50,
    "Inner": 50,
    "Dus Hampers": 50,
    "Beef Patty Small": 18,
    "Beef Patty Large": 18,
    "Keju Slice Non Brand": 12,
    "Keju Slice Non Brand A": 12,
    "Chicken Nugget": 10,
    "Spicy Chicken Nugget": 5,
    "Bangor Fried Chicken": 6,
    "Sosis": 10,
    "Ayam Crispy": 10,
    "Dori Crispy": 24,
    "Smoke Beef Slice": 150,
    "Bangor Chicken Wings": 6,
    "Cheese Slice": 12,
    "Beef Slice": 40,
    "Chicken Wings": 6,
    "Spicy Chicken Patty": 10,
    "Beef Patty Large (BBT)": 18,
    "Beef Patty Small (BBT)": 18,
    "Keju Anchor": 10,
    "Jawara Patty": 18,
    "Kentang Goreng": 15,
    "Kentang Goreng Mc Cain": 20,
    "Poster Halal": 20,
    "Kertas Nasi": 20,
    "Paper Kentang": 30,
    "Tray Kentang": 60,
    "Paper Bag": 30,
    "Packaging Box Sultan": 50,
    "Packaging HD": 50,
    "Kertas Printer": 10,
    "Cup Plastik 14 oz": 40,
    "Tutup Gelas": 40,
    "Cup Sauce": 24,
    "Sedotan": 50,
    "Hand Gloves": 150,
    "Kresek Kecil": 50,
    "Kresek Besar": 50,
    "Kresek Gelas": 50,
    "Bangor Crazy Bucket": 9,
    "Sticker Labeling": 100,
    "Tissue Pop Up": 50,
    "Bangor Thermal Bag": 5,
    "Kertas Thermal": 10,
    "Spunbond Bangor": 4,
    "Spunbond Polos + Sticker": 200,
    "Gelas Plastik": 40,
    "Gelas Plastik + Tutup": 40,
    "Cetakan Telur": 2,
    "Thermal Bag": 5,
    "Tutup Gelas Plastik": 40,
    "Plastik Kresek Gelas": 50,
    "Sticker Labeling (BBT)": 100,
    "Cup Sauce (BBT)": 24,
    "Kresek Gelas (BBT)": 50,
    "Kresek Besar (BBT)": 50,
    "Kresek Kecil (BBT)": 50,
    "Hand Gloves (BBT)": 150,
    "Sedotan (BBT)": 50,
    "Packaging Box Sultan (BBT)": 50,
    "Paper Kentang (BBT)": 30,
    "Paper Bag (BBT)": 30,
    "Tray Kentang (BBT)": 60,
    "Packaging HD (BBT)": 50,
    "Kertas Nasi (BBT)": 20,
    "Kupon Umroh": 200,
    "BBQ Sauce": 20,
    "BBQ Spicy": 20,
    "Bolognese Sauce 500gr": 20,
    "Cheese Sauce": 12,
    "Nacho Sauce New": 24,
    "Mayonaise Garlic": 20,
    "Nestea Lemontea": 12,
    "Butter": 40,
    "Thousand Island Mayonaise": 20,
    "Nachos Sauce": 24,
    "Lemon Tea": 12,
    "Thousand Island": 20,
    "Bolognese Sauce": 20,
    "Mayonaise Garlic (BBT)": 20,
    "BBQ Spicy (BBT)": 20,
    "BBQ Sauce (BBT)": 20,
    "Thousand Island (BBT)": 20,
    "Bolognese Sauce (BBT)": 20
  },
  "HOLIDAYS": [],
  "OUTLET_INFO": {},
  "KODE_BARANG": {
    "100001": "Beef Patty Large (BBT)",
    "100002": "Beef Patty Small (BBT)",
    "100008": "Thousand Island (BBT)",
    "100009": "BBQ Sauce (BBT)",
    "100011": "Burger Bun (BBT)",
    "100012": "HD Bun (BBT)",
    "100020": "Mayonaise Garlic (BBT)",
    "100032": "Kertas Nasi (BBT)",
    "100033": "Tray Kentang (BBT)",
    "100037": "Packaging Box Sultan (BBT)",
    "100038": "Packaging HD (BBT)",
    "100041": "Sedotan (BBT)",
    "100042": "Kresek Kecil (BBT)",
    "100043": "Kresek Besar (BBT)",
    "100044": "Kresek Gelas (BBT)",
    "100045": "Cup Sauce (BBT)",
    "100050": "Sticker Labeling (BBT)",
    "100051": "Hand Gloves (BBT)",
    "100068": "Bolognese Sauce (BBT)",
    "100119": "Paper Kentang (BBT)",
    "100120": "Paper Bag (BBT)",
    "100125": "BBQ Spicy (BBT)",
    "100364": "Pembersih Kerak (BBT)",
    "100365": "Sabun MPC (BBT)",
    "BBBJD00001": "Beef Patty Large",
    "BBBJD00002": "Beef Patty Small",
    "BBBJD00003": "Butter",
    "BBBJD00004": "Kentang Goreng",
    "BBBJD00005": "Kentang Goreng Mc Cain",
    "BBBJD00006": "Smoke Beef Slice",
    "BBBKU00011": "Mayonaise Garlic",
    "BBBKU00013": "Saos Tomat Jerigen Delmonte",
    "BBPCK00001": "Bangor Crazy Bucket",
    "BBPCK00003": "Box Hampers",
    "BBPCK00004": "Cup Plastik 14 oz",
    "BBPCK00005": "Cup Sauce",
    "BBPCK00011": "Grill Box",
    "BBPCK00012": "Inner",
    "BBPCK00014": "Kertas Nasi",
    "BBPCK00015": "Kresek Besar",
    "BBPCK00016": "Kresek Gelas",
    "BBPCK00017": "Kresek Kecil",
    "BBPCK00018": "Packaging Box Sultan",
    "BBPCK00019": "Packaging HD",
    "BBPCK00020": "Paper Bag",
    "BBPCK00023": "Paper Kentang",
    "BBPCK00027": "Tutup Gelas",
    "BBPCK00033": "Spunbond Bangor",
    "BBPCK00034": "Sticker Labeling",
    "BBPCK00035": "Tray Kentang",
    "BBPCK00037": "Bangor Thermal Bag",
    "BBPCK00043 (S)": "Spunbond Polos + Sticker",
    "BBPLK00001": "Apron",
    "BBPLK00002": "Cetakan Telur",
    "BBPLK00003": "Hand Gloves",
    "BBPLK00004": "Hand Sanitizer",
    "BBPLK00005": "Kaus Seragam L",
    "BBPLK00006": "Kaus Seragam M",
    "BBPLK00007": "Kaus Seragam XL",
    "BBPLK00008": "Kaus Seragam XXL",
    "BBPLK00009": "Kaus Seragam XXXL",
    "BBPLK00010": "Kertas Thermal",
    "BBPLK00011": "Name Tag",
    "BBPLK00012": "Sabun Cuci Piring Mitra",
    "BBPLK00013": "Sabun Cuci Tangan",
    "BBPLK00014": "Sabun Lantai Mitra",
    "BBPLK00015": "Sedotan",
    "BBPLK00017": "Polo Shirt L",
    "BBPLK00018": "Polo Shirt M",
    "BBPLK00019": "Polo Shirt S",
    "BBPLK00020": "Polo Shirt XL",
    "BBPLK00021": "Polo Shirt XXL",
    "BBPLK00022": "Polo Shirt XXXL",
    "BBPLK00024": "Tissue Pop Up",
    "BBPLK00025": "Topi",
    "BBPLK00027": "Seragam Owner S",
    "BBPLK00028": "Seragam Owner M",
    "BBPLK00029": "Seragam Owner L",
    "BBPLK00030": "Seragam Owner XL",
    "BBPLK00031": "Seragam Owner XXL",
    "BBPLK00032": "Seragam Owner XXXL",
    "BBPLK00039": "Sabun MPC",
    "BBPLK00040": "Pembersih Kerak",
    "BBPLK00056": "Kupon Umroh",
    "BBPLK00071": "Poster Halal",
    "BBRTL00001": "Ayam Crispy",
    "BBRTL00002": "Bangor Fried Chicken",
    "BBRTL00003": "BBQ Sauce",
    "BBRTL00004": "Beef Slice",
    "BBRTL00005": "Bolognese Sauce 500gr",
    "BBRTL00007": "Cheese Sauce",
    "BBRTL00008": "Chicken Nugget",
    "BBRTL00009": "Dori Crispy",
    "BBRTL00010": "HD Bun",
    "BBRTL00011": "Keju Anchor",
    "BBRTL00013": "Keju Slice Non Brand",
    "BBRTL00014": "Keju Slice Non Brand A",
    "BBRTL00016": "Minyak Padat",
    "BBRTL00017": "Nacho Sauce New",
    "BBRTL00018": "Nestea Lemontea",
    "BBRTL00020": "Sambal Sachet Bangor",
    "BBRTL00021": "Sosis",
    "BBRTL00022": "Spicy Chicken Nugget",
    "BBRTL00023": "Spicy Chicken Patty",
    "BBRTL00024": "Thousand Island Mayonaise",
    "BBRTL00025": "BBQ Spicy",
    "BBRTL00026": "Burger Bun (20)",
    "BBRTL00028": "Bangor Chicken Wings",
    "BBBJD00009": "Jawara Patty"
  },
  "ITEM_WEIGHT_GRAMS": {
    "Kaus Seragam M": 200,
    "Kaus Seragam L": 200,
    "Kaus Seragam XL": 200,
    "Kaus Seragam XXL": 200,
    "Kaus Seragam XXXL": 200,
    "Topi": 50,
    "Polo Shirt S": 200,
    "Polo Shirt M": 200,
    "Polo Shirt L": 200,
    "Polo Shirt XL": 200,
    "Polo Shirt XXL": 200,
    "Polo Shirt XXXL": 200,
    "Apron": 200,
    "Seragam Owner S": 200,
    "Seragam Owner M": 200,
    "Seragam Owner L": 200,
    "Seragam Owner XL": 200,
    "Seragam Owner XXL": 200,
    "Seragam Owner XXXL": 200,
    "Name Tag": 0,
    "Minyak Padat": 15950,
    "Sabun Cuci Piring Mitra": 6000,
    "Sabun Lantai Mitra": 6000,
    "Sabun MPC": 5000,
    "Sabun Kerak": 4000,
    "Sambal Sachet Bangor": 4800,
    "Saos Tomat Jerigen Delmonte": 6000,
    "Pembersih Kerak": 4000,
    "Sabun MPC (BBT)": 5000,
    "Pembersih Kerak (BBT)": 4000,
    "Sabun Cuci Tangan": 6000,
    "Hand Sanitizer": 6000,
    "HD Bun": 200,
    "Burger Bun (20)": 400,
    "HD Bun (BBT)": 200,
    "Burger Bun (BBT)": 400,
    "Box Hampers": 150,
    "Grill Box": 200,
    "Inner": 100,
    "Dus Hampers": 0,
    "Beef Patty Small": 1100,
    "Beef Patty Large": 1550,
    "Keju Slice Non Brand": 0,
    "Keju Slice Non Brand A": 1100,
    "Chicken Nugget": 550,
    "Spicy Chicken Nugget": 1050,
    "Bangor Fried Chicken": 1500,
    "Sosis": 1050,
    "Ayam Crispy": 650,
    "Dori Crispy": 650,
    "Smoke Beef Slice": 300,
    "Bangor Chicken Wings": 0,
    "Cheese Slice": 0,
    "Beef Slice": 550,
    "Chicken Wings": 0,
    "Spicy Chicken Patty": 1050,
    "Beef Patty Large (BBT)": 1550,
    "Beef Patty Small (BBT)": 1100,
    "Keju Anchor": 0,
    "Jawara Patty": 0,
    "Kentang Goreng": 2100,
    "Kentang Goreng Mc Cain": 1600,
    "Poster Halal": 0,
    "Kertas Nasi": 2700,
    "Paper Kentang": 200,
    "Tray Kentang": 850,
    "Paper Bag": 500,
    "Packaging Box Sultan": 900,
    "Packaging HD": 900,
    "Kertas Printer": 450,
    "Cup Plastik 14 oz": 200,
    "Tutup Gelas": 50,
    "Cup Sauce": 100,
    "Sedotan": 100,
    "Hand Gloves": 100,
    "Kresek Kecil": 150,
    "Kresek Besar": 150,
    "Kresek Gelas": 150,
    "Bangor Crazy Bucket": 1500,
    "Sticker Labeling": 150,
    "Tissue Pop Up": 50,
    "Bangor Thermal Bag": 45,
    "Kertas Thermal": 450,
    "Spunbond Bangor": 45,
    "Spunbond Polos + Sticker": 45,
    "Gelas Plastik": 200,
    "Gelas Plastik + Tutup": 200,
    "Cetakan Telur": 100,
    "Thermal Bag": 45,
    "Tutup Gelas Plastik": 50,
    "Plastik Kresek Gelas": 150,
    "Sticker Labeling (BBT)": 150,
    "Cup Sauce (BBT)": 100,
    "Kresek Gelas (BBT)": 150,
    "Kresek Besar (BBT)": 150,
    "Kresek Kecil (BBT)": 150,
    "Hand Gloves (BBT)": 100,
    "Sedotan (BBT)": 100,
    "Packaging Box Sultan (BBT)": 900,
    "Paper Kentang (BBT)": 200,
    "Paper Bag (BBT)": 500,
    "Tray Kentang (BBT)": 850,
    "Packaging HD (BBT)": 900,
    "Kertas Nasi (BBT)": 2700,
    "Kupon Umroh": 0,
    "BBQ Sauce": 550,
    "BBQ Spicy": 550,
    "Bolognese Sauce 500gr": 550,
    "Cheese Sauce": 1050,
    "Nacho Sauce New": 1050,
    "Mayonaise Garlic": 550,
    "Nestea Lemontea": 1050,
    "Butter": 500,
    "Thousand Island Mayonaise": 550,
    "Nachos Sauce": 1050,
    "Lemon Tea": 1050,
    "Thousand Island": 550,
    "Bolognese Sauce": 550,
    "Mayonaise Garlic (BBT)": 550,
    "BBQ Spicy (BBT)": 550,
    "BBQ Sauce (BBT)": 550,
    "Thousand Island (BBT)": 550,
    "Bolognese Sauce (BBT)": 550
  }
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
    // 1:1 with core.py: sort key = 1/box_capacity reverse=True — largest unitSpace first, stable tie-break by SKU name
    catSkus.sort((a,b)=> {
      const diff = (1/(box_capacity[b]??1)) - (1/(box_capacity[a]??1));
      return diff !== 0 ? diff : a.localeCompare(b);
    });
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

// Delivery number like core.py get_next_delivery_number — now PL/ per user request (follows selected Company Code BBB/BBT)
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
  return `PL/${companyCode}/${todayStr}/${String(newNumber).padStart(3,"0")}`;
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
