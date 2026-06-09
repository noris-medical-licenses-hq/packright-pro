# Excel Import Engine V1

**Status:** Implemented  
**Date:** 2026-06-09  
**Scope:** Client-side Excel import pipeline — no backend required

---

## Architecture

The import pipeline is split into four pure-logic modules under `src/lib/import/` and one orchestrating UI route (`src/routes/import.tsx`).

```
File (browser)
    │
    ▼
ExcelParser          → ParseResult (raw rows + metadata)
    │
    ▼
ColumnMapper         → ColumnMap (field → source header)
    │
    ▼
RowValidator         → ValidationResult (ShipmentLine[] + ImportError[])
    │
    ▼
ActiveSessionManager → SessionImpact (packed lines, carton counts)
    │
    ▼
store.replaceSession → persisted session in localStorage
```

### Module responsibilities

| Module | File | Responsibility |
|--------|------|----------------|
| ExcelParser | `src/lib/import/ExcelParser.ts` | Reads `File` → `ParseResult` via SheetJS (xlsx) |
| ColumnMapper | `src/lib/import/ColumnMapper.ts` | Maps Excel headers → domain fields; auto-detects Hebrew + English |
| RowValidator | `src/lib/import/RowValidator.ts` | Validates mapped rows; produces valid `ShipmentLine[]` + error list |
| ActiveSessionManager | `src/lib/import/ActiveSessionManager.ts` | Computes impact of replacing the active session |

---

## Import Flow (5 steps)

```
1. Select       Upload .xlsx or .xls file
2. Analyzing    ExcelParser reads raw bytes → ParseResult
3. Mapping      User verifies/adjusts column mapping → live 50-row preview
4. Review       computeDiff compares new rows against current session
5. Confirm      previewSessionImpact shown → user acknowledges → replaceSession()
```

After confirmation, `store.replaceSession()` is called with the validated lines and the file name. The store stores an `ActiveFile` record (`name`, `loadedAt`, `lineCount`, `totalQty`) that is shown globally in the AppShell header on every screen.

---

## ParseResult

```typescript
interface ParseResult {
  fileName: string;       // original file name
  fileSize: number;       // bytes
  uploadedAt: string;     // ISO timestamp of when the file was picked
  sheets: string[];       // all sheet names in the workbook
  activeSheet: string;    // sheet that was parsed (first sheet by default)
  headers: string[];      // column headers from row 1
  rows: RawRow[];         // all data rows as { [header]: value }
  rowCount: number;       // rows.length
}
```

The parser uses `XLSX.read(Uint8Array, { type: "array", raw: true })` so numeric values remain as numbers (important for quantity validation).

---

## Supported Fields

| Field | Label | Required | Notes |
|-------|-------|----------|-------|
| `sku` | מק"ט | **Yes** | Item/article code |
| `description` | תיאור פריט | **Yes** | Item description |
| `workOrder` | פקודת עבודה | **Yes** | Work order number |
| `batch` | אצווה | **Yes** | Batch / lot number |
| `quantity` | כמות | **Yes** | Must be numeric > 0 |
| `deliveryNumber` | מסמך משלוח | No | Delivery document number |
| `customerNumber` | מספר לקוח | No | Customer code |
| `customerName` | שם לקוח | No | Customer display name |
| `unit` | יחידת מידה | No | UoM (defaults to `יח'`) |
| `currency` | מטבע | No | Currency code (defaults to `USD`) |
| `unitPrice` | מחיר יחידה | No | Price per unit |
| `totalAmount` | סכום כולל | No | Line total |
| `destinationCountry` | ארץ יעד | No | Destination country |
| `packingStatus` | סטטוס אריזה | No | ERP packing status (informational) |
| `date` | תאריך | No | Shipment / order date |

---

## Supported Hebrew Aliases (Priority ERP)

The auto-detection logic (`autoDetectColumns`) normalises headers (strips RTL marks, collapses whitespace, lower-cases) then tries three levels of matching: exact → header-contains-alias → alias-contains-header.

### By field

**מק"ט (SKU)**
`מק"ט`, `מקט`, `פריט`, `קוד פריט`, `מס' פריט`, `מספר פריט`, `קוד מוצר`

**תיאור (Description)**
`תיאור`, `תאור`, `תיאור פריט`, `שם פריט`, `שם מוצר`, `תיאור מוצר`, `תאור פריט`

**פקודת עבודה (Work Order)**
`פק"ע`, `פקע`, `פקודת עבודה`, `מס' פק"ע`, `מס פקע`, `מספר פקודת עבודה`, `צו עבודה`, `הזמנת עבודה`, `הז"ע`

**אצווה (Batch)**
`אצווה`, `אצוה`, `מנה`, `צווה`, `מס' אצווה`, `מספר אצווה`, `מס' מנה`, `מספר מנה`, `שליחה`

**כמות (Quantity)**
`כמות`, `כמות פקודה`, `כמות מוזמנת`, `כמות לאספקה`, `כמות לביצוע`, `כמות משלוח`, `כמות להפקה`

**מסמך משלוח (Delivery Number)**
`מסמך`, `מס' מסמך`, `מס מסמך`, `תעודת משלוח`, `מסמך מקור`, `מס' תעודה`, `תעודה`, `מספר מסמך`

**לקוח (Customer Number)**
`לקוח`, `מספר לקוח`, `מס' לקוח`, `מס לקוח`, `קוד לקוח`

**שם לקוח (Customer Name)**
`שם לקוח`, `שם הלקוח`

**יחידה (Unit)**
`יחידה`, `יח`, `יח'`, `יחידת מידה`, `יח' מידה`

**מטבע (Currency)**
`מטבע`, `קוד מטבע`

**מחיר יחידה (Unit Price)**
`מחיר יחידה`, `מחיר`, `מחיר ליחידה`, `מחיר נטו`

**סכום כולל (Total Amount)**
`סכום`, `סה"כ`, `סכום כולל`, `סכום שורה`, `ערך`

**ארץ יעד (Destination Country)**
`ארץ יעד`, `ארץ`, `מדינה`, `יעד`

**סטטוס אריזה (Packing Status)**
`סטטוס`, `סטטוס אריזה`, `מצב`, `מצב אריזה`

**תאריך (Date)**
`תאריך`, `תאריך משלוח`, `תאריך הפקה`, `תאריך פקודה`, `תאריך הזמנה`

---

## Validation Rules

All validation runs in `RowValidator.validateRows()`. Errors are non-fatal: they are surfaced as warnings in the UI, and only valid rows proceed to import.

| Field | Rule | Error Message |
|-------|------|---------------|
| `sku` | Required, non-empty string | מק"ט הוא שדה חובה |
| `description` | Required, non-empty string | תיאור הוא שדה חובה |
| `workOrder` | Required, non-empty string | פקודת עבודה היא שדה חובה |
| `batch` | Required, non-empty string | אצווה היא שדה חובה |
| `quantity` | Required, numeric, > 0 | כמות חייבת להיות מספר גדול מ-0 |

Rows that fail any required-field check are excluded from the imported session. The count of skipped rows is shown in the validation summary and again on the review step.

---

## Validation Summary Display

The mapping step shows a live summary that updates as the user adjusts column mappings:

| Metric | Source |
|--------|--------|
| Total rows | `ParseResult.rowCount` |
| Valid rows | `ValidationResult.valid.length` |
| Error rows | `ParseResult.rowCount - valid.length` |
| Unique deliveries | distinct `deliveryNumber` values |
| Unique work orders | distinct `workOrder` values |
| Unique batches | distinct `batch` values |
| Unique SKUs | distinct `sku` values |
| Total quantity | sum of `quantity` across valid rows |

---

## Active Session Storage

After a successful import, `store.replaceSession(lines, fileName)` is called. The store persists:

```typescript
// Zustand store — localStorage key: "packing-center-v3"
activeFile: {
  name: string;        // original file name
  loadedAt: string;    // ISO timestamp
  lineCount: number;   // count of valid imported rows
  totalQty: number;    // sum of quantity across all rows
}
lines: ShipmentLine[]; // the validated imported rows (replaces previous)
cartons: [];           // cleared on replacement
allocations: [];       // cleared on replacement
```

The `activeFile` banner is shown in the AppShell header on every screen, displaying: file name, row count, total quantity, and import timestamp.

---

## File Replacement Protection

Before the user can confirm a replacement, `previewSessionImpact(allocations, cartons)` computes:

| Field | Meaning |
|-------|---------|
| `packedLineCount` | Lines that have at least one allocation (work in progress) |
| `openCartonCount` | Cartons in `open` or `packing` status |
| `closedCartonCount` | Cartons in `closed` status |
| `requiresConfirmation` | `true` if any of the above > 0 |

When `requiresConfirmation` is true, the confirm dialog renders a red impact panel showing these three numbers before the user can check the acknowledgement checkbox.

---

## Known Limitations

| Limitation | Notes |
|-----------|-------|
| Single sheet only | Parser reads the first sheet; multi-sheet selection UI not yet built |
| No mapping persistence | The column map is not saved between sessions; auto-detection re-runs on each upload |
| No partial row recovery | Rows with any required-field error are dropped entirely; partial data is not salvaged |
| localStorage only | No server-side persistence; data is lost if browser storage is cleared |
| No import history detail | `ImportEntry` records store summary counts but not the raw rows; re-importing requires re-uploading the file |
| 500-entry audit cap | Audit log silently evicts old entries beyond 500 |

---

## File Locations

```
src/lib/import/
├── ExcelParser.ts          Raw file → ParseResult
├── ColumnMapper.ts         Header auto-detection + apply mapping
├── RowValidator.ts         Required-field validation → ShipmentLine[]
└── ActiveSessionManager.ts Session impact preview

src/routes/import.tsx       5-step import wizard UI
src/components/AppShell.tsx Active file banner (global, all screens)
src/lib/types.ts            ShipmentLine (packingStatus?: string added)
src/routes/__root.tsx       TooltipProvider added globally
```
