# Warehouse Map + Picking List — API Endpoint Specification

All endpoints are additive. No existing PLGen endpoints are modified.

---

## Base URL
`/api/warehouse` — new namespace for warehouse operations

---

## 1. Warehouse Locations (Warehouse Map)

### GET `/api/warehouse/locations`
List all warehouse locations with optional filters.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `warehouse` | string | — | Filter by warehouse (C11, C12) |
| `zone_type` | string | — | Filter by zone type |
| `status` | string | — | Filter by status |
| `assigned_sku` | string | — | Filter by SKU |
| `search` | string | — | Fuzzy search on pallet_code, level_rack, assigned_sku |
| `page` | int | 1 | Pagination |
| `limit` | int | 100 | Page size |

**Response:** `{ data: WarehouseLocation[], total: number, page: number, limit: number }`

---

### GET `/api/warehouse/locations/:palletCode`
Get single location by pallet code.

**Response:** `WarehouseLocation`

---

### POST `/api/warehouse/locations`
Create new location. **Admin only.**

**Body:**
```json
{
  "pallet_code": "C11-RC-A1-01",
  "warehouse": "C11",
  "zone_type": "Racking",
  "level_rack": "Level A / Bay 1",
  "max_capacity_pcs": 50,
  "in_pack": 1000,
  "assigned_sku": "Thousand Island",
  "status": "Available"
}
```
`pallet_code` must be unique. `status` auto-set if omitted.

**Response:** Created `WarehouseLocation` (201)

---

### PUT `/api/warehouse/locations/:palletCode`
Update location. **Admin only.**

**Body:** Partial `WarehouseLocation` (all fields optional except pallet_code in URL)

**Response:** Updated `WarehouseLocation`

---

### DELETE `/api/warehouse/locations/:palletCode`
Delete location. **Admin only.** Fails if `stock_batches` reference it (on delete restrict).

**Response:** 204 No Content

---

### POST `/api/warehouse/locations/bulk`
Bulk upsert from CSV/Excel import. **Admin only.**

**Body:** `{ locations: WarehouseLocation[] }`

**Response:** `{ inserted: number, updated: number, errors: string[] }`

---

## 2. Stock Batches (Inventory with Expiry)

### GET `/api/warehouse/stock`
List stock batches with filters.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `pallet_code` | string | Filter by location |
| `sku` | string | Filter by SKU |
| `kode_barang` | string | Filter by KODE_BARANG |
| `warehouse` | string | Filter by warehouse (via join) |
| `exp_before` | date | Expiry before date |
| `exp_after` | date | Expiry after date |
| `qty_gt` | number | Qty packs greater than |
| `page` / `limit` | int | Pagination |

**Response:** `{ data: StockBatch[], total: number, ... }`

---

### GET `/api/warehouse/stock/available`
**FIFO-ordered available stock for picking.** Used by Picking List page.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `sku` | string[] | One or more SKUs to allocate (repeat param) |
| `warehouse` | string | Optional warehouse filter |

**Response:** `{ sku: string, batches: [{ id, pallet_code, warehouse, zone_type, level_rack, sku, exp_date, qty_packs, received_at }] }[]`

Returns batches for requested SKUs, ordered by `exp_date ASC NULLS LAST, received_at ASC`.

---

### GET `/api/warehouse/stock/summary`
Aggregated stock per SKU per location (uses `v_current_stock_per_location` view).

**Response:** `{ pallet_code, warehouse, zone_type, level_rack, assigned_sku, sku, kode_barang, total_qty_packs, nearest_exp_date, batch_count }[]`

---

### POST `/api/warehouse/stock/receive`
Receive stock against a PO. **Admin only.** Creates `stock_batches` + `stock_movements`.

**Body:**
```json
{
  "po_number": "PO-2026-00123",
  "items": [
    {
      "sku": "Thousand Island",
      "kode_barang": "BBBJD00008",
      "exp_date": "2026-12-31",
      "qty_packs": 10,
      "pallet_code": "C11-RC-A1-01"
    }
  ]
}
```

**Validation:**
- `pallet_code` must exist in `warehouse_locations`
- `sku` must exist in `master_data`
- `exp_date` required
- `qty_packs > 0`

**Response:** `{ received: StockBatch[], movements: StockMovement[] }` (201)

---

### POST `/api/warehouse/stock/adjust`
Manual adjustment. **Admin only.**

**Body:**
```json
{
  "pallet_code": "C11-RC-A1-01",
  "sku": "Thousand Island",
  "exp_date": "2026-12-31",
  "qty_packs": -2,          // negative to reduce, positive to increase
  "reason": "Damaged goods"
}
```

**Response:** Updated `StockBatch` + `StockMovement` (ADJUST)

---

### POST `/api/warehouse/stock/transfer`
Move stock between locations. **Admin only.**

**Body:**
```json
{
  "from_pallet_code": "C11-RC-A1-01",
  "to_pallet_code": "C11-RC-A2-03",
  "sku": "Thousand Island",
  "exp_date": "2026-12-31",
  "qty_packs": 5
}
```

**Response:** Two `StockMovement` rows (TRANSFER out / TRANSFER in) + updated batches

---

## 3. Picking List

### POST `/api/warehouse/picking-list/preview`
Generate FIFO allocation preview from RO data. **Read-only, no stock deduction.**

**Body:**
```json
{
  "cluster_name": "Cluster Traga 45",
  "ro_items": [
    { "sku": "Thousand Island", "kode_barang": "BBBJD00008", "qty_diminta": 50 },
    { "sku": "Beef Patty Large", "kode_barang": "BBBJD00001", "qty_diminta": 20 }
  ]
}
```

**Logic:**
For each `ro_items` entry:
1. Query `v_fifo_available_batches` for that SKU
2. Allocate from earliest `exp_date` batch until `qty_diminta` satisfied
3. If insufficient stock → mark batch as `Stok Kurang`, allocate all available

**Response:**
```json
{
  "cluster_name": "Cluster Traga 45",
  "items": [
    {
      "sku": "Thousand Island",
      "kode_barang": "BBBJD00008",
      "qty_diminta": 50,
      "allocations": [
        { "pallet_code": "C11-RC-A1-01", "exp_date": "2026-12-15", "allocated": 30, "status": "Cukup", "sisa_qty": 20 },
        { "pallet_code": "C11-RC-A1-02", "exp_date": "2026-12-20", "allocated": 20, "status": "Cukup", "sisa_qty": 80 }
      ],
      "total_allocated": 50,
      "overall_status": "Cukup"
    },
    {
      "sku": "Beef Patty Large",
      "kode_barang": "BBBJD00001",
      "qty_diminta": 20,
      "allocations": [
        { "pallet_code": "C11-C40-04", "exp_date": "2026-11-30", "allocated": 15, "status": "Stok Kurang", "sisa_qty": 5 }
      ],
      "total_allocated": 15,
      "overall_status": "Stok Kurang"
    }
  ],
  "warnings": ["Beef Patty Large: 5 packs short (Stok Kurang)"]
}
```

---

### POST `/api/warehouse/picking-list/export`
Generate Excel + **deduct stock** + log movements. **Admin only.**

**Body:** Same as preview + optional `notes`

**Logic:**
1. Run same allocation as preview
2. For each allocation: `UPDATE stock_batches SET qty_packs = qty_packs - allocated WHERE id = ...`
3. Insert `stock_movements` (PICK) for each batch consumed
4. Build Excel with columns:
   - Nomor Rak (pallet_code)
   - Nama Barang (sku)
   - Qty Setiap Pallet/Rak (from warehouse_locations: `max_capacity_pcs` / `in_pack` logic)
   - Exp Date (exp_date)
   - Item Diminta (sku)
   - Qty Diminta (allocated per batch)
   - Status (Cukup / Stok Kurang)
   - Sisa Qty (qty_packs - allocated)
3. Return `{ blob, filename }`

**Filename:** `${cluster_name}_PICKING_${date}.xlsx` (suffix `_PICKING_`)

**Response:** `{ blob, filename }` — same shape as `exportLabels`/`exportPackingList`

---

### GET `/api/warehouse/picking-list/history`
List past picking list exports.

**Query params:** `cluster_name`, `from_date`, `to_date`, `page`, `limit`

**Response:** `{ data: [{ cluster_name, exported_at, exported_by, item_count, filename }], total }`

---

## 4. Stock Movements (Audit)

### GET `/api/warehouse/movements`
List stock movements with filters.

**Query params:** `movement_type`, `pallet_code`, `sku`, `reference`, `user_id`, `from_date`, `to_date`, `page`, `limit`

**Response:** `{ data: StockMovement[], total }`

---

## Types (TypeScript)

```typescript
interface WarehouseLocation {
  id: string;
  pallet_code: string;
  warehouse: string;
  zone_type: 'Racking' | 'Container' | 'Floor';
  level_rack: string;
  max_capacity_pcs: number;
  in_pack: number;
  assigned_sku: string | null;
  status: 'Available' | 'Occupied' | 'Reserved' | 'Maintenance';
  created_at: string;
  updated_at: string;
}

interface StockBatch {
  id: string;
  pallet_code: string;
  sku: string;
  kode_barang: string | null;
  exp_date: string;
  qty_packs: number;
  received_at: string;
  created_at: string;
}

interface StockMovement {
  id: string;
  movement_type: 'RECEIVE' | 'PICK' | 'ADJUST' | 'TRANSFER';
  pallet_code: string;
  sku: string;
  kode_barang: string | null;
  exp_date: string | null;
  qty_packs: number;
  reference: string | null;
  user_id: string;
  created_at: string;
}

interface PickingListPreviewItem {
  sku: string;
  kode_barang: string;
  qty_diminta: number;
  allocations: PickingAllocation[];
  total_allocated: number;
  overall_status: 'Cukup' | 'Stok Kurang';
}

interface PickingAllocation {
  pallet_code: string;
  exp_date: string;
  allocated: number;
  status: 'Cukup' | 'Stok Kurang';
  sisa_qty: number;
}
```

---

## Auth & Roles

| Endpoint | Roles |
|----------|-------|
| GET `/locations` | Super Admin, Admin, Checker |
| POST/PUT/DELETE `/locations` | Super Admin, Admin |
| GET `/stock*` | Super Admin, Admin, Checker |
| POST `/stock/receive` | Super Admin, Admin |
| POST `/stock/adjust` | Super Admin, Admin |
| POST `/stock/transfer` | Super Admin, Admin |
| POST `/picking-list/preview` | Super Admin, Admin |
| POST `/picking-list/export` | Super Admin, Admin |
| GET `/picking-list/history` | Super Admin, Admin |
| GET `/movements` | Super Admin, Admin |

Checkers can view warehouse map and stock, but cannot modify or export picking lists.