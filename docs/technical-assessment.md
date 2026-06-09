# PackRight Pro — Technical Assessment Report

**Date:** 2026-06-09  
**Scope:** Full codebase analysis, pre-refactoring baseline  
**Status:** Read-only analysis — no code was modified

---

## 1. Current Architecture

### Framework

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 19.2.0 |
| Meta-Framework | TanStack Start | Latest |
| Language | TypeScript | 5.8.3 (strict) |
| Build Tool | Vite | 7.3.1 |
| Package Manager | Bun | Latest |
| Server Runtime | Nitro (via TanStack Start) | 3.0 |

TanStack Start is a full-stack React meta-framework layered on top of TanStack Router and Vite. It supports SSR and server functions (`createServerFn`), though the current application uses virtually none of these capabilities — the app is effectively a client-side SPA with localStorage persistence.

---

### Routing

File-based routing via TanStack Router. Route files live under `src/routes/`.

```
/                         → redirect to /packing
/packing                  → main workspace (555 lines)
/cartons/$cartonId        → carton detail & edit (161 lines)
/import                   → file replacement workflow (463 lines)
/delivery-note            → delivery document & Excel export (143 lines)
```

The route tree (`src/routeTree.gen.ts`) is auto-generated. The root layout (`__root.tsx`) wraps all routes in `AppShell` and provides the React Query client context.

---

### State Management

**Zustand 5.0.14** with `persist` middleware backed by `localStorage` (key: `packing-center-v3`).

A single store in `src/lib/store.ts` holds the entire application state:

```
PackingStore
├── lines[]           — ShipmentLine records loaded from Excel
├── cartons[]         — Physical carton entities
├── allocations[]     — Line-to-carton quantity mappings
├── imports[]         — Historical import records
├── audit[]           — Append-only audit log (capped at 500)
└── activeFile        — Metadata for the currently loaded file
```

Store actions: `addLines`, `replaceSession`, `createCarton`, `updateCarton`, `deleteCarton`, `setCartonStatus`, `allocate`, `updateAllocation`, `removeAllocation`, `moveAllocation`, `resetDemo`.

Helper selectors are plain functions co-located in `store.ts`: `getPackedForLine`, `getLineStatus`, `getCartonItems`, `getCartonTotalQty`.

**React Query 5.83.0** is installed and a client is wired into the root, but it is only used structurally — no actual queries or mutations are defined. All data access goes through Zustand.

---

### Data Layer

The application is **fully client-side with no backend**. There is no database, no API, no authentication. All persistence is through `localStorage` via Zustand's persist middleware.

Server-side capability exists (TanStack Start server functions) but is unused. The only server function in the codebase is an illustrative example (`src/lib/api/example.functions.ts`).

**Data flow:**
1. User uploads an Excel file (currently simulated, not parsed)
2. Parsed lines are stored in `store.lines`
3. All subsequent UI interactions (allocations, carton management) update the Zustand store
4. The store auto-persists to localStorage on every mutation
5. On reload, the store rehydrates from localStorage

---

### Component Structure

```
src/
├── components/
│   ├── AppShell.tsx          Layout: left nav icon bar + top header + main slot
│   ├── StatusBadge.tsx       Reusable color-coded status pills (line & carton variants)
│   └── ui/                   ~60 shadcn/ui components (Button, Dialog, Table, etc.)
├── hooks/
│   └── use-mobile.tsx        Responsive breakpoint hook (768px threshold)
├── lib/
│   ├── store.ts              Zustand store — single source of truth
│   ├── types.ts              TypeScript interfaces for all domain entities
│   ├── demo-data.ts          Seed data generator for demo mode
│   ├── utils.ts              cn() Tailwind class merge utility
│   └── config.server.ts      Server-side environment variable access
└── routes/                   Page components (see Routing above)
```

All non-trivial UI logic lives inside the route files rather than being extracted into dedicated feature components. `packing.tsx` at 555 lines is the clearest example — it embeds tree computation, modal logic, allocation forms, and carton panels all inline.

---

## 2. Existing Packing Workflow

### Current Screens

| Screen | Path | Purpose |
|--------|------|---------|
| Packing Workspace | `/packing` | Primary daily-use screen |
| Carton Detail | `/cartons/:id` | Edit dimensions, manage allocations |
| File Import | `/import` | Replace the active shipment file |
| Delivery Note | `/delivery-note` | View packed state, export to Excel |

---

### Current User Flow

```
[Load app]
    │
    ▼
[Demo data auto-loaded] ──OR── [User uploads Excel on /import]
    │
    ▼
[/packing — left sidebar: Delivery → Work Order → Batch tree]
    │
    ├── Select batch → center grid shows lines for that batch
    │       │
    │       ├── Click "Pack" on a line → PackModal opens
    │       │       ├── Single carton mode: pick existing or create new carton
    │       │       └── Split mode: add multiple rows, different cartons per row
    │       │
    │       └── Line status updates: none → partial → full (color-coded)
    │
    ├── Right panel: Carton cards with current allocations
    │       ├── Create new carton (auto-numbered)
    │       ├── Open carton detail → edit dimensions/weight
    │       └── Close carton (locks allocations)
    │
    └── Footer: global progress bar (total packed / total qty)

[/delivery-note]
    ├── Select delivery number
    ├── View per-carton breakdown
    └── Export to XLSX
```

---

### Existing Packing Logic

- A `ShipmentLine` has a fixed `quantity`. The user allocates units from this line into one or more cartons.
- An `Allocation` record ties `lineId` + `cartonId` + `quantity`. A single line can have multiple allocation records across different cartons (split allocation).
- Remaining quantity = `line.quantity - sum(allocations where lineId = line.id)`.
- The PackModal enforces that allocated quantity never exceeds remaining.
- Line status is computed on the fly:
  - `none` — no allocations exist
  - `partial` — allocated > 0 but < quantity
  - `full` — allocated === quantity
- Progress percentages for batches, work orders, and deliveries roll up from line statuses.

---

### Existing Carton Logic

- Cartons have three statuses: `open` → `packing` → `closed`.
- Status transitions:
  - A new carton starts as `open`.
  - On first allocation, status becomes `packing` (implicit, via store).
  - User explicitly closes a carton → `closed`. Allocations become read-only.
  - A closed carton can be reopened → returns to `packing`.
- Carton dimensions (L × W × H), weight, and notes are optional and editable on the detail screen while the carton is open.
- An empty carton can be deleted. A non-empty carton must have its allocations removed or moved first.
- Carton numbers are user-assigned strings; the UI suggests the next integer.

---

## 3. Technical Debt

### UX Issues

| Severity | Issue |
|----------|-------|
| High | All UI text is hardcoded Hebrew with no i18n abstraction — any copy change requires a code change |
| High | `/packing` is a 555-line monolithic route file with embedded modals, sidebar, grid, and carton panel — no separation of concerns |
| High | No loading state for file upload; the spinner is shown during a simulated delay, not real async work |
| Medium | Allocation is modal-driven with no drag-and-drop — adding items to multiple cartons in sequence requires repetitive clicks |
| Medium | No confirmation before deleting a carton |
| Medium | Carton number auto-suggestion is basic (max existing + 1); doesn't handle gaps or non-numeric names |
| Medium | No way to search or filter cartons on the packing screen when there are many |
| Low | Delivery note screen has no way to edit a carton after navigating to it from the report |
| Low | Print stylesheet exists but is not optimized |

---

### Code Issues

| Severity | Issue |
|----------|-------|
| High | Excel import is entirely simulated — `simulateNewFile()` creates fake mutations of current data, never reads a real file |
| High | `packing.tsx` (555 lines) mixes data computation, UI state, modals, and layout — should be decomposed into feature components |
| High | `import.tsx` (463 lines) has the diff algorithm, multi-step wizard state, and all review UI inline |
| Medium | No unit tests anywhere in the codebase |
| Medium | `recharts` is installed as a dependency but never used — dead weight |
| Medium | `react-hook-form` and `@hookform/resolvers` are installed but barely used (no schema-driven forms) |
| Medium | Audit log is capped at 500 entries with FIFO eviction — entries are silently lost with no user visibility |
| Medium | Demo data resets the entire session — there is no "load demo without destroying current session" path |
| Low | Helper selectors (`getPackedForLine`, etc.) are plain functions, not Zustand selectors — they recompute on every call rather than being memoized |
| Low | `store.ts` exports both the store hook and all helper functions from a single file — will grow unwieldy |
| Low | No JSDoc or inline comments on any store actions or helper functions |

---

### Data Model Issues

| Severity | Issue |
|----------|-------|
| High | No server-side persistence — losing the browser or clearing storage loses all work |
| High | `activeFile` in the store stores only metadata (name, date, row count); no reference to parsed content — the actual lines live separately in `store.lines` |
| Medium | `ShipmentLine` has no `fileId` foreign key — there is no way to know which import a line came from after the fact |
| Medium | `ImportEntry` stores summary stats but not the raw parsed rows — replaying or comparing against a previous import requires re-uploading |
| Medium | `Allocation.createdAt` is stored as a string from `new Date().toISOString()` — inconsistent with how `Carton.createdAt` is stored |
| Medium | Carton `status` transitions are not enforced by the type system — any string value would pass TypeScript if not for the union type |
| Low | No soft-delete for any entity — removal is permanent with no undo |
| Low | The audit log has no structured action type enum — actions are free-form Hebrew strings |

---

### Scalability Concerns

| Area | Concern |
|------|---------|
| Storage | `localStorage` cap is ~5–10 MB per origin; current demo is ~50 KB but a real shipment with 1,000+ lines and audit history could approach limits |
| Performance | All lines are held in a flat array in memory; filtering/aggregating for the tree view uses `useMemo` but no pagination or virtualization |
| Multi-user | The architecture is single-user, single-browser — no way for two warehouse operators to work the same session concurrently |
| Offline | No service worker or offline-first strategy despite being localStorage-backed |
| History | File import history (`store.imports`) grows unbounded — no cap or cleanup policy |
| Audit | Hard cap of 500 audit entries with silent eviction is too low for a full warehouse shift |

---

## 4. Refactoring Recommendations

### High Priority

1. **Implement real Excel parsing in `/import`.**  
   The most critical missing feature. `simulateNewFile()` must be replaced with actual `xlsx` parsing, column detection, and validation before the file comparison step can be trusted.

2. **Decompose `packing.tsx` into feature components.**  
   Extract: `PackingTree` (left sidebar), `LinesGrid` (center table), `PackModal` (allocation dialog), `CartonPanel` (right panel), `CartonCard`. Each should be a standalone file under `src/components/packing/`.

3. **Decompose `import.tsx` into feature components.**  
   Extract: `StepIndicator`, `FileDropzone`, `DiffReview`, `ConfirmReset` into `src/components/import/`.

4. **Add a `fileId` to `ShipmentLine`.**  
   Each import should produce a unique `fileId` stamped on every line it creates, enabling traceability and proper multi-file comparison later.

5. **Persist data server-side.**  
   For production use, the Zustand store should sync to a backend (Supabase or equivalent). The architecture already supports `createServerFn` — this is the natural extension point.

---

### Medium Priority

6. **Introduce a `usePackingStore` selector pattern.**  
   Move helper selectors (`getPackedForLine`, etc.) into Zustand selectors or `useMemo`-backed hooks so they benefit from React's render optimization.

7. **Add Zod schemas for all domain entities.**  
   Currently only server function inputs are validated. Adding Zod schemas to `ShipmentLine`, `Carton`, and `Allocation` would catch malformed Excel imports and bad state transitions early.

8. **Remove unused dependencies.**  
   `recharts` and heavy use of `react-hook-form` for minimal form work should be audited and trimmed.

9. **Add Vitest unit tests for the store and diff algorithm.**  
   The diff logic in `import.tsx` is the most complex business logic in the codebase and has no test coverage. It should be extracted and tested independently.

10. **Raise the audit log cap and add structured action types.**  
    Replace free-form Hebrew strings with a typed `ActionType` enum. Raise or remove the 500-entry cap, or implement server-side audit persistence.

---

### Low Priority

11. **Extract all Hebrew strings into a constants/i18n layer.**  
    Even without a full i18n framework, centralizing strings makes copy changes, search, and eventual translation manageable.

12. **Add virtualization to the lines grid.**  
    `react-virtual` or `@tanstack/react-virtual` (already a TanStack project) would handle 1,000+ line tables without performance degradation.

13. **Add a soft-delete pattern.**  
    Carton and allocation deletions are permanent. A `deletedAt` timestamp plus a recycle bin UI would prevent accidental data loss.

14. **Optimize the print stylesheet.**  
    The delivery note is a natural print document; CSS `@media print` rules should be formalized.

15. **Wire up dark mode.**  
    CSS custom properties for the theme are defined but the dark mode toggle is not implemented.

---

## 5. Excel Import Readiness Assessment

### Current Upload Implementation

The `/import` route has a full multi-step wizard UI (Select → Analyzing → Review → Confirm) but **the core parsing step is not implemented**.

```typescript
// src/routes/import.tsx — what actually happens on "upload"
const simulateNewFile = () => {
  // Takes current store.lines and randomly perturbs them
  // Returns fake "new" data — never reads from the uploaded file
};
```

The file input widget accepts `.xlsx` and `.xls` files and calls `simulateNewFile()` regardless of what was uploaded. The `xlsx` library is installed and available; it simply has not been wired to the file input.

**Assessment: Not implemented. The UI shell exists; the engine does not.**

---

### Current Data Model

The `ShipmentLine` interface maps cleanly to a typical shipment Excel structure:

```typescript
interface ShipmentLine {
  id: string                  // generated UUID
  deliveryNumber: string      // maps to: "מסמך" / "Delivery #"
  customerNumber: string      // maps to: "לקוח" / "Customer #"
  customerName: string        // maps to: "שם לקוח"
  workOrder: string           // maps to: "הזמנת עבודה" / "WO"
  batch: string               // maps to: "אצווה" / "Batch"
  sku: string                 // maps to: "פריט" / "SKU"
  description: string         // maps to: "תיאור"
  quantity: number            // maps to: "כמות"
  unit: string                // maps to: "יח'"
  currency: string            // maps to: "מטבע"
  unitPrice: number           // maps to: "מחיר יחידה"
  totalAmount: number         // maps to: "סכום"
  destinationCountry: string  // maps to: "ארץ יעד"
  date: string                // maps to: "תאריך"
}
```

The model is well-suited to a single-sheet shipment export from an ERP system (SAP, Priority, etc.). However there is no `fileId` field, so once lines are loaded there is no way to know which file they came from.

---

### Ability to Support Excel Preview

**Readiness: Medium.**

The `xlsx` library (`XLSX.read()`, `XLSX.utils.sheet_to_json()`) can parse an uploaded file into a raw array of row objects in ~10 lines of code. The `/import` route already has a review step with a table component that could display raw rows before column mapping. What is missing:

- Actual `FileReader` + `XLSX.read()` call on the uploaded `File` object
- A raw preview table component (not domain-typed, just raw headers/rows)
- Row count and sheet selector (for multi-sheet files)

No architectural blockers — this is an implementation gap only.

---

### Ability to Support Column Mapping

**Readiness: Low–Medium.**

There is no column mapping UI or logic anywhere in the codebase. What exists:

- The `ShipmentLine` interface defines the target schema
- The diff algorithm assumes lines are already typed as `ShipmentLine`

What needs to be built:

- A mapping step in the import wizard (between "Analyzing" and "Review")
- A `ColumnMap` type: `{ [targetField in keyof ShipmentLine]: string | null }` (source column name → target field)
- A transform function: `(rawRow: Record<string, unknown>, map: ColumnMap) => Partial<ShipmentLine>`
- Persistence of the last-used mapping per file structure (optional but high-value)
- Auto-detection heuristics for common Hebrew/English column names

This requires new UI (a mapping table component) and new logic, but no structural changes to the existing store or routing.

---

### Ability to Support File Comparison

**Readiness: High.**

The diff algorithm in `import.tsx` is already implemented and sophisticated:

- Composite key: `${deliveryNumber}|${workOrder}|${batch}|${sku}`
- Detects: new lines (added), removed lines, quantity changes, field-level modifications
- Matches "modified" pairs by description + delivery + quantity heuristic
- Renders a full diff UI with Added/Removed/Changed/Modified sections

The only blocker is that it currently compares `simulatedData` (fake) against `store.lines` (real). Once real Excel parsing is in place, the comparison engine works correctly as-is. The diff UI components (`DiffSection`, `ModifiedSection`, summary cards) are production-quality and only need the real input data.

**This is the most production-ready part of the import feature.**

---

### Summary Table

| Capability | Readiness | Blocker |
|-----------|-----------|---------|
| File upload UI (input + drag) | Ready | None |
| Excel parsing (XLSX library) | Not implemented | Missing `FileReader` + `XLSX.read()` call |
| Raw data preview | Not implemented | No preview component; no parser call |
| Column mapping UI | Not implemented | Requires new step + new components |
| Auto column detection | Not implemented | Requires heuristics per field |
| Data validation (Zod) | Not implemented | No schema for row validation |
| Diff / comparison engine | Ready (works with real data) | Only needs real input instead of simulated |
| Confirm + session replace | Ready | Works correctly today |

---

## 6. Proposed Architecture

### Overview

The future import system should be a pipeline with clearly separated stages. Each stage is independently testable and replaceable.

```
ExcelImportEngine
    │
    ├── 1. ExcelParser         — raw bytes → raw rows
    ├── 2. ColumnMapper        — raw rows + mapping config → typed domain rows
    ├── 3. Validator           — typed rows → validated rows + error list
    ├── 4. DiffEngine          — validated rows + current session → diff result
    └── 5. SessionCommitter    — diff result → store mutation (replaceSession)
```

---

### Excel Import Engine

**Location:** `src/lib/import/ImportEngine.ts`

Orchestrates the full pipeline. Exposes a single async function consumed by the import route.

```typescript
interface ImportEngineResult {
  status: "success" | "validation_error" | "parse_error";
  rawRows?: RawRow[];
  mappedRows?: Partial<ShipmentLine>[];
  validatedRows?: ShipmentLine[];
  errors?: ImportError[];
  diff?: DiffResult;
}

async function runImport(
  file: File,
  columnMap: ColumnMap,
  currentLines: ShipmentLine[]
): Promise<ImportEngineResult>
```

---

### Excel Parser

**Location:** `src/lib/import/ExcelParser.ts`

Responsible only for reading raw bytes and returning untyped row data. No domain knowledge.

```typescript
interface RawRow {
  [columnHeader: string]: string | number | null;
}

interface ParseResult {
  sheets: string[];
  activeSheet: string;
  headers: string[];
  rows: RawRow[];
  rowCount: number;
}

async function parseExcelFile(file: File): Promise<ParseResult>
```

Uses `XLSX.read(buffer, { type: "array" })` and `XLSX.utils.sheet_to_json()` internally. Returns headers and raw rows without any type coercion. Provides sheet names so the user can select the correct sheet for multi-sheet files.

---

### Column Mapper

**Location:** `src/lib/import/ColumnMapper.ts`

Transforms raw untyped rows into typed `ShipmentLine` objects using a user-provided (or auto-detected) mapping.

```typescript
type ColumnMap = {
  [K in keyof ShipmentLine]?: string; // target field → source header name
};

interface MappingResult {
  rows: Partial<ShipmentLine>[];
  unmappedFields: (keyof ShipmentLine)[];
  autoDetected: boolean;
}

function applyColumnMap(rows: RawRow[], map: ColumnMap): MappingResult
function autoDetectColumns(headers: string[]): ColumnMap
```

`autoDetectColumns` runs heuristics against known Hebrew and English column names for each `ShipmentLine` field. The detection result is shown to the user for confirmation before proceeding.

**Persistence:** The last successful `ColumnMap` per file fingerprint (SHA-256 of headers) is stored in `localStorage` under a separate key so repeat uploads of the same file format skip the mapping step.

---

### Validator

**Location:** `src/lib/import/Validator.ts`

Takes mapped (partially typed) rows and produces fully validated `ShipmentLine[]` or a structured error report.

```typescript
interface ImportError {
  row: number;
  field: keyof ShipmentLine;
  value: unknown;
  message: string;
}

interface ValidationResult {
  valid: ShipmentLine[];
  errors: ImportError[];
  hasFatal: boolean; // true if any error blocks import
}

function validateRows(rows: Partial<ShipmentLine>[]): ValidationResult
```

Uses Zod internally. A Zod schema for `ShipmentLine` (`ShipmentLineSchema`) is defined here and reused by the store for runtime safety. Non-fatal errors (e.g., missing optional fields) are shown as warnings; fatal errors (missing required fields, invalid types) block confirmation.

---

### Active Session Manager

**Location:** `src/lib/session/SessionManager.ts`

Encapsulates the logic for determining whether a session replacement is safe and executing it. Currently this logic is scattered between `import.tsx` and `store.ts`.

```typescript
interface SessionReplaceOptions {
  newLines: ShipmentLine[];
  fileMetadata: ImportEntry;
  forceReset: boolean; // skip safety checks
}

interface SessionReplaceResult {
  affectedAllocations: number;
  affectedCartons: number;
  requiresConfirmation: boolean;
}

function previewSessionReplace(
  newLines: ShipmentLine[],
  currentState: PackingStore
): SessionReplaceResult

function commitSessionReplace(
  options: SessionReplaceOptions,
  store: PackingStore
): void
```

`previewSessionReplace` is called before showing the confirmation step — it tells the UI how many packed items will be lost. `commitSessionReplace` calls `store.replaceSession()` and logs to audit.

---

### File Comparison Engine

**Location:** `src/lib/import/DiffEngine.ts`

Extracted and generalized from the current inline diff logic in `import.tsx`. Operates on arrays of `ShipmentLine` with no UI dependency.

```typescript
type DiffKey = string; // `${deliveryNumber}|${workOrder}|${batch}|${sku}`

interface DiffResult {
  added: ShipmentLine[];
  removed: ShipmentLine[];
  quantityChanged: QuantityChange[];
  fieldModified: FieldModification[];
  unchanged: ShipmentLine[];
  summary: DiffSummary;
}

interface QuantityChange {
  key: DiffKey;
  line: ShipmentLine;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
}

interface FieldModification {
  key: DiffKey;
  previousLine: ShipmentLine;
  newLine: ShipmentLine;
  changedFields: (keyof ShipmentLine)[];
}

interface DiffSummary {
  addedCount: number;
  removedCount: number;
  quantityChangedCount: number;
  fieldModifiedCount: number;
  totalLines: number;
  netQuantityDelta: number;
}

function computeDiff(
  currentLines: ShipmentLine[],
  incomingLines: ShipmentLine[]
): DiffResult
```

The existing composite key approach (`deliveryNumber|workOrder|batch|sku`) is preserved. The function is pure (no side effects) and directly unit-testable.

---

### Updated Import Wizard Flow

With the above components in place, the `/import` route becomes a thin orchestration layer:

```
Step 1 — Select File
    → FileDropzone uploads File object

Step 2 — Parse
    → ExcelParser.parseExcelFile(file)
    → Shows sheet selector if multi-sheet
    → Shows raw row count + first 5 rows preview

Step 3 — Map Columns
    → ColumnMapper.autoDetectColumns(headers) → pre-fills mapping
    → User reviews/adjusts mapping via ColumnMappingTable component
    → Saved to localStorage for next time

Step 4 — Validate
    → Validator.validateRows(mappedRows)
    → Shows error list if any
    → Blocks on fatal errors; warns on non-fatal

Step 5 — Review Diff
    → DiffEngine.computeDiff(currentLines, validatedRows)
    → Existing DiffReview UI (already production-quality)
    → SessionManager.previewSessionReplace() for impact summary

Step 6 — Confirm
    → Existing ConfirmDialog UI
    → SessionManager.commitSessionReplace()
```

---

### Directory Structure (Proposed)

```
src/
├── components/
│   ├── packing/
│   │   ├── PackingTree.tsx         (left sidebar)
│   │   ├── LinesGrid.tsx           (center table)
│   │   ├── PackModal.tsx           (allocation dialog)
│   │   ├── CartonPanel.tsx         (right panel)
│   │   └── CartonCard.tsx          (individual carton)
│   ├── import/
│   │   ├── FileDropzone.tsx
│   │   ├── SheetSelector.tsx
│   │   ├── RawPreviewTable.tsx
│   │   ├── ColumnMappingTable.tsx
│   │   ├── ValidationErrorList.tsx
│   │   ├── DiffReview.tsx          (extracted from import.tsx)
│   │   └── ConfirmReset.tsx
│   ├── AppShell.tsx
│   └── StatusBadge.tsx
├── lib/
│   ├── import/
│   │   ├── ImportEngine.ts
│   │   ├── ExcelParser.ts
│   │   ├── ColumnMapper.ts
│   │   ├── Validator.ts
│   │   └── DiffEngine.ts
│   ├── session/
│   │   └── SessionManager.ts
│   ├── store.ts
│   ├── types.ts
│   └── utils.ts
└── routes/
    ├── packing.tsx       (slim orchestration, delegates to components)
    ├── import.tsx        (slim wizard shell, delegates to components + lib)
    ├── cartons.$cartonId.tsx
    └── delivery-note.tsx
```

---

*End of Technical Assessment Report — no code was modified during this analysis.*
