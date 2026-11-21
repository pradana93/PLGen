# Warehouse Map + Picking List — UI Wireframes & Design

## New Routes (Add to `src/App.tsx`)

```tsx
<Route path="/warehouse-map" element={<Protected roles={["Super Admin","Admin"]}><WarehouseMap /></Protected>} />
<Route path="/receive-stock" element={<Protected roles={["Super Admin","Admin"]}><ReceiveStock /></Protected>} />
<Route path="/picking-list" element={<Protected roles={["Super Admin","Admin"]}><PickingList /></Protected>} />
<Route path="/stock-history" element={<Protected roles={["Super Admin","Admin"]}><StockHistory /></Protected>} />
```

## Header Nav Addition

Add to profile/header nav bar (next to Dashboard):

```tsx
// In App.tsx header
const navItems = [
  { path: '/', label: 'Dashboard', roles: ['Super Admin', 'Admin'] },
  { path: '/dashboard-v2', label: 'Dashboard v2', roles: ['Super Admin', 'Admin'] },
  { path: '/warehouse-map', label: 'Warehouse Map', roles: ['Super Admin', 'Admin'] },
  { path: '/receive-stock', label: 'Receive Stock', roles: ['Super Admin', 'Admin'] },
  { path: '/picking-list', label: 'Picking List', roles: ['Super Admin', 'Admin'] },
  { path: '/stock-history', label: 'Stock History', roles: ['Super Admin', 'Admin'] },
  { path: '/digital-pl', label: 'Digital PL', roles: ['Super Admin', 'Admin', 'Checker'] },
  { path: '/live', label: 'Live Board', roles: ['Super Admin', 'Admin'] },
  // ... existing
];
```

---

## 1. Warehouse Map Page (`/warehouse-map`)

### Layout
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📍 Warehouse Map                                    [+ Add Location]       │
├─────────────────────────────────────────────────────────────────────────────┤
│  Filters: [Warehouse ▼] [Zone Type ▼] [Status ▼] [Search...        ]      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────┬──────────┬────┬────────────┬────────┬──────────────────┬────────┬───┐│
│  │ No │Pallet Code│Whs │ Zone       │ Level  │Max Cap (UOM)     │SKU     │Sts││
│  ├────┼──────────┼────┼────────────┼────────┼──────────────────┼────────┼───┤│
│  │ 1  │C11-RC-A1-01│C11│ Racking    │Lvl A/1 │ 50 Pack          │Thousand│Occ││
│  │ 2  │C11-RC-A1-02│C11│ Racking    │Lvl A/1 │ 50 Pack          │Island  │Occ││
│  │ 3  │C11-RC-A2-03│C11│ Racking    │Lvl A/2 │ 40 Pack          │-       │Avl││
│  │    │           │    │            │        │      │          │        │   ││
│  │    │  [inline edit on click]                              [🗑]      │   ││
│  └────┴──────────┴────┴────────────┴────────┴──────┴──────────┴────────┴───┘│
│  Pagination: [←] 1 2 3 ... [→]    Total: 72 locations                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Interactions
| Action | Behavior |
|--------|----------|
| Click row | Inline edit mode (all fields editable) |
| `+ Add Location` | Opens drawer/modal with empty form |
| `assigned_sku` change | Dropdown with fuzzy search from `master_data`; on select → auto-set status `Occupied` |
| Clear `assigned_sku` | Status → `Available` |
| `status` manual override | Dropdown: Available / Occupied / Reserved / Maintenance |
| Delete | Confirm modal → DELETE API |
| Bulk import | `POST /bulk` — upload Excel, preview, confirm |

### Column Details
| Column | Source | Editable | Notes |
|--------|--------|----------|-------|
| Pallet Code | `pallet_code` | ❌ (PK) | Unique |
| Warehouse | `warehouse` | ✅ | Select: C11, C12 |
| Zone Type | `zone_type` | ✅ | Select: Racking, Container, Floor |
| Level / Rack | `level_rack` | ✅ | Free text |
| Max Capacity | `max_capacity` | ✅ | Number (shows UOM label auto-fetched from `master_data.ITEM_UOM` when SKU is assigned) |
| Assigned SKU | `assigned_sku` | ✅ | Fuzzy search dropdown |
| Status | `status` | ✅* | Auto if SKU set; manual override allowed |

---

## 2. Receive Stock Page (`/receive-stock`)

### Layout
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📥 Receive Stock (PO-based)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  PO Number: [PO-2026-00123              ]  (free text, required)           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Items to Receive:                                    [+ Add Item]          │
│  ┌────┬────────────────┬──────────┬──────────┬─────────┬────────────────┐ │
│  │ #  │ SKU (search)   │ Kode Brg │ Exp Date │ Qty Pk │ Pallet Code    │ │
│  ├────┼────────────────┼──────────┼──────────┼─────────┼────────────────┤ │
│  │ 1  │ Thousand Island│ BBBJD008 │ 2026-12-31│  10   │ C11-RC-A1-01  ▼│ │
│  │ 2  │ Beef Patty Lg  │ BBBJD001 │ 2026-11-30│  5    │ C11-C40-04    ▼│ │
│  │    │ [fuzzy search] │ (auto)   │ (req)    │ (num)  │ (dropdown)    │ │
│  └────┴────────────────┴──────────┴──────────┴─────────┴────────────────┘ │
│                                                                             │
│  [Cancel]                              [Receive & Deduct Stock]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Interactions
| Action | Behavior |
|--------|----------|
| SKU search | Fuzzy search `master_data` (name + kode_barang); on select → auto-fill `kode_barang` |
| Pallet Code dropdown | Only locations where `assigned_sku` matches selected SKU OR status `Available` |
| Exp Date | Required date picker |
| Qty Packs | Number input, min 1 |
| `+ Add Item` | Adds another row |
| Receive & Deduct Stock | Calls `POST /stock/receive`; shows success toast with movement IDs; clears form |

### Validation
- PO Number required
- Each row: SKU, Exp Date, Qty > 0, Pallet Code required
- Pallet must exist in `warehouse_locations`
- SKU must exist in `master_data`

---

## 3. Picking List Page (`/picking-list`)

### Layout — Step 1: Cluster + RO Upload
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 Picking List Generator                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Cluster Name: [Cluster Traga 45                    ]  (required)          │
├─────────────────────────────────────────────────────────────────────────────┤
│  Upload RO File:  [Drag & drop Excel/PDF  or  Click to browse]            │
│  Supported: .xlsx, .xls, .pdf  —  Parses: SKU, Kode Barang, Qty           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Parsed Items Preview:                               [Generate Preview]    │
│  ┌────┬────────────────┬──────────┬─────────┐                               │
│  │ #  │ SKU            │ Kode Brg │ Qty Dim │                               │
│  ├────┼────────────────┼──────────┼─────────┤                               │
│  │ 1  │ Thousand Island│ BBBJD008 │   50    │                               │
│  │ 2  │ Beef Patty Lg  │ BBBJD001 │   20    │                               │
│  └────┴────────────────┴──────────┴─────────┘                               │
│                                                                             │
│  [Back]                                    [Generate Preview →]             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layout — Step 2: FIFO Allocation Preview (Read-Only)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 Picking List Preview — Cluster: Cluster Traga 45                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ⚠️  Warnings: Beef Patty Large: 5 packs short (Stok Kurang)              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Thousand Island (BBBJD008) — Qty Diminta: 50  ✅ Cukup                    │
│  ┌────┬──────────────┬──────────┬───────────────────┬────────┬────────┬────────┐  │
│  │ #  │ Nomor Rak    │ Exp Date │ Qty Setiap Pallet │ Alloc. │ Status │ Sisa   │  │
│  ├────┼──────────────┼──────────┼───────────────────┼────────┼────────┼────────┤  │
│  │ 1  │ C11-RC-A1-01 │ 2026-12-15│ 30                │  30   │ Cukup  │  0     │  │
│  │ 2  │ C11-RC-A1-02 │ 2026-12-20│ 80                │  20   │ Cukup  │  60    │  │
│  └────┴──────────────┴──────────┴───────────────────┴────────┴────────┴────────┘  │
│                                                                             │
│  Beef Patty Large (BBBJD001) — Qty Diminta: 20  ❌ Stok Kurang             │
│  ┌────┬──────────────┬──────────┬───────────────────┬────────┬────────┬────────┐  │
│  │ #  │ Nomor Rak    │ Exp Date │ Qty Setiap Pallet │ Alloc. │ Status │ Sisa   │  │
│  ├────┼──────────────┼──────────┼───────────────────┼────────┼────────┼────────┤  │
│  │ 1  │ C11-C40-04   │ 2026-11-30│ 15                │  15   │StokKrg │  0     │  │
│  └────┴──────────────┴──────────┴───────────────────┴────────┴────────┴────────┘  │
│  (Only 15 available — 5 short)                                             │
│                                                                             │
│  [← Back to Upload]                                      [Export Picking List]│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Visual Indicators
| Element | Style |
|---------|-------|
| Overall Status `Cukup` | Green badge |
| Overall Status `Stok Kurang` | Red badge + warning icon |
| Per-batch Status | Green/Red badge in row |
| Shortage warning | Yellow banner at top + red row |

### Export Action
- Button: **Export Picking List** (prominent, red/danger style since it deducts stock)
- Confirmation modal: "This will deduct stock from inventory. Continue?"
- On confirm: `POST /picking-list/export` → downloads Excel
- Success toast: "Picking List exported. Stock deducted. Movement IDs: ..."

---

## 4. Stock History Page (`/stock-history`)

### Layout
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📜 Stock Movement History                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Filters: [Type ▼] [SKU Search...] [Pallet...] [Date Range] [Search]      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────┬──────────┬──────────┬──────────┬────────┬──────────┬────────────┐ │
│  │ #  │ Date     │ Type     │ SKU      │ Qty    │ Pallet   │ Ref/Note   │ │
│  ├────┼──────────┼──────────┼──────────┼────────┼──────────┼────────────┤ │
│  │ 1  │ 2026-11-22│ RECEIVE  │ Thousand │ +10    │ C11-RC-A1│ PO-00123   │ │
│  │ 2  │ 2026-11-22│ PICK     │ Beef Pty │ -15    │ C11-C40-0│ Cluster T45│ │
│  │ 3  │ 2026-11-21│ ADJUST   │ Sambal   │ -2     │ C11-RC-B2│ Damaged    │ │
│  └────┴──────────┴──────────┴──────────┴────────┴──────────┴────────────┘ │
│  Pagination...    Export CSV                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Excel Export Template (Picking List)

### Sheet Structure
```
Row 1:  PICKING LIST — Cluster: [Cluster Traga 45]          Date: [2026-11-22]
Row 2:  (empty)
Row 3:  Headers (bold, colored background)
Row 4+: Data rows (one per batch allocation)
```

### Columns
| Col | Header | Source | Format |
|-----|--------|--------|--------|
| A | Nomor Rak | `pallet_code` | Text |
| B | Nama Barang | `sku` | Text |
| C | Qty Setiap Pallet/Rak | **Current on-hand stock at this rack before deduction** (sum of `stock_batches.qty_packs` for this SKU at this `pallet_code`) | Number (show `0` if none) |
| D | Exp Date | `exp_date` | Date (dd/mm/yyyy) |
| E | Item Diminta | `sku` | Text |
| F | Qty Diminta | `allocated` (split allocation per batch/rack) | Number |
| G | Status | `Cukup` / `Stok Kurang` | Badge style (green/red fill) |
| H | Sisa Qty | `sisa_qty` (after deduction) | Number |

### Styling (match PL look)
- Header row: navy background `#2C3E50`, white text
- Alternating row colors
- Thick borders around table
- Status column: conditional formatting (green fill for Cukup, red fill for Stok Kurang)
- Freeze header row
- Print on A4 landscape, fit to page

**Note:** The exported `Qty Setiap Pallet/Rak` shows the **before-picking on-hand quantity**. Stock deduction happens simultaneously at export time. The `Sisa Qty` column shows the remaining quantity after deduction.

---

## Fuzzy SKU Search Component (Reusable)

```tsx
// src/components/SkuSearch.tsx
interface SkuSearchProps {
  value: string;
  onChange: (sku: string, kodeBarang: string) => void;
  placeholder?: string;
}

// Uses master_data from store or API
// Debounced 250ms
// Shows: "Thousand Island (BBBJD00008)" — click to select
```

---

## State Management

| Page | State | Persistence |
|------|-------|-------------|
| Warehouse Map | Table data, filters, edit mode | None (server-driven) |
| Receive Stock | PO number, item rows | localStorage (draft) |
| Picking List | Cluster name, RO file, parsed items, preview | localStorage (draft) |
| Stock History | Filters, pagination | URL params |

---

## Permissions Summary

| Page | Super Admin | Admin | Checker |
|------|-------------|-------|---------|
| Warehouse Map | ✅ CRUD | ✅ CRUD | ✅ Read |
| Receive Stock | ✅ | ✅ | ❌ |
| Picking List | ✅ | ✅ | ❌ |
| Stock History | ✅ | ✅ | ✅ Read |

Checkers can view warehouse map and stock levels to know where items are, but cannot modify or generate picking lists.

---

## Integration Points with Existing PLGen

| Touchpoint | How |
|------------|-----|
| `master_data` | SKU dropdown sourced from existing `master_data.OUTLET_INFO` / `KODE_BARANG` |
| `getDeliveryDateWIB` | Not used — Picking List uses RO date / cluster label |
| `exportExcel.ts` | **Not touched** — new `pickingList.ts` for export |
| `labelSheets.ts` | Not used |
| `usePackingStore` | Not used — separate order state for RO |
| Auth | Reuses `AuthContext` + role checks |
| API | New `/api/warehouse/*` namespace in `api/index.ts` |

---

## File Structure (New Files Only)

```
src/
  pages/
    WarehouseMap.tsx
    ReceiveStock.tsx
    PickingList.tsx
    StockHistory.tsx
  components/
    SkuSearch.tsx
    WarehouseMapTable.tsx
    ReceiveStockForm.tsx
    PickingListUploader.tsx
    PickingListPreview.tsx
  lib/
    warehouseApi.ts          # API client for /api/warehouse/*
    pickingListExport.ts     # ExcelJS builder for picking list
    fifoAllocator.ts         # Pure FIFO allocation logic
  hooks/
    useWarehouseLocations.ts
    useStockBatches.ts
    usePickingList.ts
```

No changes to: `packing.ts`, `exportExcel.ts`, `labelSheets.ts`, `Dashboard.tsx`, `DigitalPl.tsx`, `LiveBoard.tsx`.

---

## Next Steps (Implementation Order)

1. **Supabase migration** — run SQL in Supabase
2. **API endpoints** — add to `api/index.ts`
3. **Types & API client** — `src/lib/warehouseApi.ts`, types
4. **Warehouse Map page** — grid + inline edit
5. **Receive Stock page** — PO form + fuzzy SKU
6. **FIFO allocator** — pure logic (testable)
7. **Picking List page** — upload → preview → export
8. **Picking List export** — ExcelJS builder
9. **Stock History page** — audit log
10. **Header nav + routes** — App.tsx
11. **i18n strings** — EN/ID for all new UI text

Each step verified with `typecheck` + `build` before next.