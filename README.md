# PLGen — Packing List Generator v2.0

**Interactive WebApp • React/TypeScript • Supabase Ready**

Ported 1:1 from the original Python desktop app (Tkinter + Flask + Streamlit). All packing logic is preserved.

## 🚀 What Is PLGen?

Warehouse logistics for **Burger Bangor** (PT Bangor Berkembang Bersama / PT Bangor Berani Terukur):

- Scan **Surat Jalan** (PDF / Excel) via drag-&-drop → auto-detect SKUs via `KODE_BARANG` + SKU name fuzzy matching
- Manage order (add/subtract with multipliers: Beef Patty ×18, Butter ×40, Thousand Island ×20)
- **Calculate Koli / Boxes** with category-aware greedy packing (`FROZEN`, `KENTANG`, `SAUCE/PACKAGING/APPAREL→DRY`, `BREAD`, `BIG`, `BUNDLE`) and `BOX_TOLERANCE=1.859` — identical to `core.py:calculate_boxes`
- Preview Koli in **Pre-Flight Reviewer** (drag-to-move, merge/insert)
- **Export Packing List** (Excel) with QR code + Delivery No `DO/BBB/DDMMYYYY/001` + delivery date (skip Sunday & holidays) + checker/cluster + weight manifest background tasks
- **Export Labels** (6 per A4, dynamic outlet palette)
- **Live Packing Board** (status: PENDING → IN PROGRESS → READY/CANCELLED, one-time QR scan gate, dus usage report)
- **Outbound Manifests**, **Inbound Logs/Planner**, **Staff & OT**, **Audit Trail**, **Stock Ledger**, **Wallet/Topup**, **Checker Management**
- Offline vault, license check, telemetry, ghost-math anti-tamper (ported as client-side safeguards)

## 📂 Project Structure

```
PLGen/
├── backend/               # Express + TypeScript (port of flask_app.py ~1917 lines)
│   ├── src/index.ts       # All REST endpoints (file-DB + Supabase-ready)
│   └── data/              # Local JSON file store (fallback when Supabase not linked)
├── frontend/              # Vite + React 18 + TypeScript + Tailwind
│   ├── src/
│   │   ├── lib/packing.ts # core.py calculateBoxes 1:1 port (preserved!)
│   │   ├── lib/exportExcel.ts
│   │   ├── store/usePackingStore.ts (zustand + persist)
│   │   ├── pages/Dashboard.tsx (port of core.py Tkinter dashboard)
│   │   ├── pages/LiveBoard.tsx, Admin.tsx, Manifests.tsx, Inbound.tsx, ScanPage.tsx
│   │   └── App.tsx (routing)
│   └── index.html
├── supabase/
│   └── schema.sql         # Full DB schema (run in Supabase SQL Editor)
├── core.py / addons.py / flask_app.py / admin_overhaul.py  # Original Python source (kept for reference)
└── package.json           # Workspace root
```

## 🔄 Logic Preservation Guarantee

- `calculateBoxes()` in `frontend/src/lib/packing.ts:18-150` is line-for-line equivalent to `core.py:144-256`
- `BOX_TOLERANCE`, `CATEGORIES`, `ITEM_UOM`, `BOX_CAPACITY`, `OUTLET_INFO`, `KODE_BARANG`, `ITEM_WEIGHT_GRAMS` sync from cloud via `sync_master_data()` behavior → `frontend → /api/master_data` fallback chain (Cloud → Local Cache → Hardcoded)
- Multipliers (`Beef Patty ×18` etc.) in `store/usePackingStore.ts` match `core.py:add_item/subtract_item`
- Delivery No format & WIB timezone in `lib/packing.ts:getNextDeliveryNumber` mirrors `core.py:get_next_delivery_number`

## 🛠️ Quick Start

### Backend
```bash
cd backend
cp .env.example .env   # set PORT, ADMIN_SECRET, SUPABASE_URL etc if you have Supabase
npm install
npm run dev            # http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api → :4000)
```

### Supabase (when project is created)
1. Create Supabase project → copy URL + anon/service keys into `backend/.env`
2. In Supabase SQL Editor: paste & run `supabase/schema.sql`
3. (Optional) `supabase link --project-ref YOUR_REF` + `supabase db push`

The backend auto-falls back to `backend/data/*.json` when Supabase env is absent, so it works immediately without Supabase.

## 🔌 API Parity (flask_app.py → Express)

| Flask Endpoint | Express Equivalent |
|---|---|
| `GET /api/master_data` | ✅ |
| `POST /api/master_data` (admin) | ✅ |
| `GET/POST /api/current_stock` | ✅ |
| `GET/POST /api/checkers` | ✅ |
| `GET/POST /api/packing_status` + `PUT /api/packing_status/:dn` | ✅ + override |
| `GET/POST /scan/<path:do>` HTML gate | ✅ `GET /scan/*` + `POST /api/scan/:dn` |
| `GET/POST /api/outbound_manifests` | ✅ |
| `GET/POST /api/inbound_logs` + planner/queue/draft | ✅ |
| `GET/POST /api/audit_logs` | ✅ |
| `GET/POST /api/staff_roster` + OT logs | ✅ |
| `GET /check` + `/register_user` etc. | ✅ |
| `POST /api/wallet_info` etc. | ✅ Mock Midtrans |

## 🧪 Verify Logic

```bash
# run typecheck
npm run typecheck --workspace=frontend
npm run typecheck --workspace=backend

# compare koli calculation
# In browser console:
# import { calculateBoxes, FALLBACK_MASTER_DATA } from '/src/lib/packing'
# calculateBoxes({ "Beef Patty Small": {qty:36, note:"BGB"} }, FALLBACK_MASTER_DATA)
```

## 📦 Export

Packing list & labels export client-side via `ExcelJS` (replaces `openpyxl`). QR via `qrcode` lib. Server upload mirrored at `POST /api/upload_packing_list`.

## 🔐 Auth

- Bearer `JESTA-SECURE-99X` header expected (existing `API_HEADERS`)
- Admin secret `majesta93` for master deploy / user manage
- Web login uses PINs `123456` (Admin) / `654321` (Manager) matching `admin_overhaul.py:ROLES`

---

**Original Python sources preserved** for audit. WebApp is add-on, not destructive. Logic unchanged.

*Made by A. Majesta P. — Production-Live v2.0*
