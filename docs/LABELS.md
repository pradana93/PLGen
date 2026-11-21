# Labels

Label sheet layouts, geometry model and the visual verification recipe.
Read this before changing `src/lib/labelSheets.ts` or the 6-up path in
`src/lib/exportExcel.ts`.

---

## 1. The three templates

| Template | Per A4 | Orientation | Grid | File | Filename suffix |
|---|---|---|---|---|---|
| `standard` (default) | 6 | portrait | 2 across x 3 down | `exportExcel.ts` (original body) | *(none)* |
| `medium` | 4 | portrait | 2 across x 2 down | `labelSheets.ts` | `_MEDIUM_` |
| `large` | 2 | landscape | 2 across x 1 down | `labelSheets.ts` | `_LARGE_` |

Filenames look like `BBT - SRENGSENG_MEDIUM_06112026.xlsx`. The distinct
suffixes are deliberate — Drive uploads and ZIP bundles must not collide with
the standard file.

### Dispatch

```ts
exportLabels(outlet, boxes, master, opts?: { skipDownload?: boolean; template?: LabelTemplate })
```

- `opts` omitted, or `template: "standard"` -> the original 6-up body runs
  **unchanged**. This must stay byte-identical; it is the production default.
- `template: "medium" | "large"` -> delegates to `exportSizedLabels()`.
- Both paths return `{ blob, filename }`, so the Drive and ZIP callers need no
  special handling.

### Preference

`src/lib/labelPrefs.ts` stores the choice in `localStorage`:

- key: `plgen-label-size`
- values: `"standard" | "medium" | "large"`, anything else falls back to standard
- deliberately per browser, mirroring `plgen-export-dest` in `drive.ts`
- UI: profile menu in `src/App.tsx`, options from `LABEL_TEMPLATE_OPTIONS`
- callers: `Dashboard.tsx` (local + Drive paths) and `DashboardV2.tsx`

---

## 2. Label anatomy (11 logical rows)

Rows are relative to the label block (`r0`). Both sized templates draw the same
content; only sizes differ.

| Rows | Content | Style |
|---|---|---|
| 0-1 | Outlet name (merged, 2 rows) | Arial Black, bold, centred, wrapped |
| 2 | `KOLI  <n> / <total>` | Arial bold, centred |
| 3-4 | Receiver address (merged, 2 rows) | Arial, centred, wrapped |
| 5 | `PENERIMA` / receiver name | dark fill, bold |
| 6 | `NO. HP` / receiver phone | dark fill, bold |
| 7 | `PENGIRIM` / `BURGER BANGOR` | navy `#2C3E50`, white |
| 8 | `NO. HP` / `082125627591` | navy `#2C3E50`, white |
| 9 | `WAJIB VIDEO UNBOXING` warning banner | Arial Black, white on red `#FF0000` |
| 10 | Warning detail + `Tgl Kirim: <date>` | bold, dark red on `#FFE4E6` |

The warning banner and detail are **required** — they are the unboxing-claim
policy, not decoration. Never remove or shrink them to make room.

---

## 3. Geometry model (why the heights are computed)

Excel merged rows never auto-grow. If text wraps to more lines than the row
height allows, it spills over the neighbouring block and prints clipped. So the
row heights are **derived from the text each label actually carries** for the
given outlet, not tuned to one sample address.

### Width

`colWidth` is in Excel character units, but a merged block spans
`labelCols * colWidth` characters — not `labelCols` characters. Getting this
wrong was the original Medium/Large overlap bug.

```ts
colWidthPt(chars)  = (chars * 7 + 5) * 0.75          // px -> pt
labelWidthPt       = colWidthPt(labelCols * colWidth) - 8
valueWidthPt       = colWidthPt((labelCols - labelSpan) * colWidth) - 6
```

`labelSpan` is how many columns the `PENERIMA` / `PENGIRIM` caption occupies;
the value cell gets the remainder.

### Text measurement

`charEm()` gives a conservative advance width per character family
(uppercase 0.70 em regular / 0.82 em Arial Black, digits 0.56/0.66, spaces 0.28,
punctuation 0.28). `textWidthPt()` sums it and `wrappedLines()` greedily wraps
inside `widthPt`, honouring `\n` and hard-splitting over-long words.

### Height

```ts
blockHeightPt(lines, sizePt) = ceil(lines * sizePt * 1.32) + 5
```

1.32 is the line box factor; +5 pt is padding. Then, per label:

- outlet name: `outletTotal = max(cfg[0]+cfg[1], blockHeightPt(...))`, split
  evenly across rows 0 and 1
- address: same, split across rows 3 and 4
- receiver name / `BURGER BANGOR`: one `pairHeight` shared by rows 5-8
  (computed against `valueWidthPt`, Arial bold)
- koli line, banner (row 9), detail + date (row 10): each
  `max(cfg[i], blockHeightPt(...))`

Every label on a sheet carries the same outlet and address, so one height set is
correct for all columns and all koli.

### Current CFG values

`src/lib/labelSheets.ts` -> `CFG`. Heights are **minimums**; the computed value
can only make rows taller.

| | medium | large |
|---|---|---|
| `labelCols` | 4 | 6 |
| `colWidth` | 12 | 12 |
| `labelSpan` | 2 | 2 |
| `heights` | `[30,30,24,30,30,40,40,40,40,24,46]` | `[44,44,30,40,40,48,48,48,48,42,56]` |
| outlet / koli font | 22 / 16 | 24 / 20 |
| addr / cap font | 13 / 13 | 16 / 16 |
| value / banner font | 12.5 / 15 | 19 / 20 |
| detail font | 10 | 12 |
| gap rows between blocks | 1 | 0 |
| `startRow` | 2 | 2 |
| margins (l/r/t/b) | .25 / .25 / .35 / .35 | .25 / .25 / .30 / .30 |

---

## 4. Pitfalls

- **Do not "simplify" the width math back to column counts.** `labelCols` is a
  count; text width needs character units (`labelCols * colWidth`).
- **`fitToPage = true` does not save you.** It scales the printed page, but a
  row that is too short still clips its merged text.
- **Arial Black is much wider** than Arial at the same point size — the
  `black: true` branch in `charEm()` exists for the outlet name and banner.
- **The ⚠️ emoji in the banner inflates the line box** in Excel. The banner row
  is height-computed with the 1.32 factor plus padding for that reason; if you
  remove the emoji, keep the height logic as is (cheap safety margin).
- **Fonts differ between Windows Excel, Mac Excel and LibreOffice.** Verification
  is done with Windows Excel (see below); leave headroom rather than shaving
  heights to the pixel.
- **Do not touch the 6-up body.** `exportLabels` without a template must stay
  byte-identical.
- **`src/lib/labelSheets.ts` is the only place sized layouts belong.** No layout
  logic in pages, no PDF rendering path.

---

## 5. Visual verification recipe

`typecheck`/`build` cannot see an overlap. For any layout change, render the
actual sheet to PDF and look at it. All artifacts go to a temp dir, never the repo.

**1. Generate sample workbooks** (long outlet name + long address):

```ts
// scripts are throwaway — run with: npx tsx gen-labels.ts
import { exportSizedLabels } from "./src/lib/labelSheets";
import { FALLBACK_MASTER_DATA } from "./src/lib/packing";
import { writeFileSync } from "node:fs";

const OUT = "C:/Users/USER/AppData/Local/Temp/opencode/labelcheck/";
const master: any = {
  ...FALLBACK_MASTER_DATA,
  OUTLET_INFO: {
    "BBT - SRENGSENG": {
      name: "BBT - SRENGSENG",
      phone: "081234567890",
      address:
        "Jl. Raya Srengseng No. 12, RT.3/RW.5, Srengseng, Kec. Kembangan, Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11630",
    },
    "BBT - BINTARO": {
      name: "BBT - BINTARO",
      phone: "081298765432",
      address:
        "Ruko Golden Boulevard Blok B No. 8, Jl. Pahlawan Seribu, Lengkong Gudang, Serpong, Kota Tangerang Selatan, Banten 15310",
    },
  },
};
const boxes = Array.from({ length: 4 }, (_, i) => ({ BOX_ID: i + 1 }) as any);

for (const outlet of ["BBT - SRENGSENG", "BBT - BINTARO"]) {
  for (const template of ["medium", "large"] as const) {
    const { blob } = await exportSizedLabels(outlet, boxes, master, template, {
      skipDownload: true,
    });
    const safe = outlet.replace(/[^A-Za-z0-9]+/g, "_");
    writeFileSync(OUT + `${safe}__${template}.xlsx`, Buffer.from(await blob.arrayBuffer()));
  }
}
```

**2. Convert to PDF with real Excel** (Excel COM, Windows only):

```powershell
$dir = "C:\Users\USER\AppData\Local\Temp\opencode\labelcheck"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
Get-ChildItem "$dir\*.xlsx" | ForEach-Object {
  $wb = $excel.Workbooks.Open($_.FullName)
  $wb.ExportAsFixedFormat(0, ($_.FullName -replace "\.xlsx$", ".pdf"))
  $wb.Close($false)
}
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
```

**3. Rasterize and inspect each page** (e.g. `pdftoppm -png -r 110 file.pdf page`).
Check every page at 100%:

- [ ] outlet name on one line (or cleanly wrapped, never overlapping KOLI)
- [ ] address fully inside rows 3-4, no spill into `PENERIMA`
- [ ] `PENERIMA` / `PENGIRIM` values not clipped at the right edge
- [ ] `KOLI n / total` readable
- [ ] red `WAJIB VIDEO UNBOXING` banner fully visible, white text not cut
- [ ] detail sentence + `Tgl Kirim` both inside row 10
- [ ] thick outer border unbroken; blocks on one sheet do not touch

If any check fails, adjust the computed height (or CFG minimum), never the
packing data.

---

## 6. Change history

| Date | Change |
|---|---|
| 2026-11-06 | Fixed Medium/Large overlap: width math now uses character units, heights derived from text metrics; CFG heights retuned. `ebab53c`, merged `a9825ee` |
| 2026-11-04 | Added Medium (4-up) + Large (2-up) templates, profile-menu selection, `plgen-label-size` preference. PR #3, `8b3c1c9` |
| 2026-10-16 | Red warning band with white text on row 9 |
| 2026-10-15 | Unboxing warning moved onto row 9 with delivery date; height raised to fit |
