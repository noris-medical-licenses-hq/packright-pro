import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  Minus,
  Pencil,
  Replace,
  ShieldAlert,
  Upload,
  X,
  AlertCircle,
  CheckCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import type { ShipmentLine } from "@/lib/types";
import { parseExcelFile, formatFileSize } from "@/lib/import/ExcelParser";
import type { ParseResult } from "@/lib/import/ExcelParser";
import { autoDetectColumns, applyColumnMap, getMappingStatus, FIELD_DEFINITIONS } from "@/lib/import/ColumnMapper";
import type { ColumnMap, MappableField } from "@/lib/import/ColumnMapper";
import { validateRows } from "@/lib/import/RowValidator";
import type { ImportError } from "@/lib/import/RowValidator";
import { previewSessionImpact } from "@/lib/import/ActiveSessionManager";
import type { SessionImpact } from "@/lib/import/ActiveSessionManager";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "ייבוא קובץ — Packing Control Center" },
      { name: "description", content: "ייבוא קובץ Excel להחלפת ההפעלה הפעילה" },
    ],
  }),
  component: ReplaceSessionPage,
});

// ─── types ────────────────────────────────────────────────────────────────────

// "mapping" is an exception-only step — normal Priority exports never reach it
type Step = "select" | "analyzing" | "mapping" | "review" | "confirm";

type Diff = {
  added: ShipmentLine[];
  removed: ShipmentLine[];
  qtyChanged: { key: string; before: ShipmentLine; after: ShipmentLine }[];
  modified: { before: ShipmentLine; after: ShipmentLine; changes: ("sku" | "workOrder" | "batch")[] }[];
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function keyOf(l: ShipmentLine) {
  return `${l.deliveryNumber}|${l.workOrder}|${l.batch}|${l.sku}`;
}

function computeDiff(oldLines: ShipmentLine[], newLines: ShipmentLine[]): Diff {
  const oldMap = new Map(oldLines.map((l) => [keyOf(l), l]));
  const newMap = new Map(newLines.map((l) => [keyOf(l), l]));

  const added: ShipmentLine[] = [];
  const removed: ShipmentLine[] = [];
  const qtyChanged: Diff["qtyChanged"] = [];

  for (const [k, n] of newMap) {
    const o = oldMap.get(k);
    if (!o) added.push(n);
    else if (o.quantity !== n.quantity) qtyChanged.push({ key: k, before: o, after: n });
  }
  for (const [k, o] of oldMap) {
    if (!newMap.has(k)) removed.push(o);
  }

  const modified: Diff["modified"] = [];
  const matchedAddedKeys = new Set<string>();
  const stillRemoved: ShipmentLine[] = [];
  for (const r of removed) {
    const candidate = added.find(
      (a) =>
        !matchedAddedKeys.has(keyOf(a)) &&
        a.deliveryNumber === r.deliveryNumber &&
        a.description === r.description &&
        a.quantity === r.quantity,
    );
    if (candidate) {
      const changes: ("sku" | "workOrder" | "batch")[] = [];
      if (candidate.sku !== r.sku) changes.push("sku");
      if (candidate.workOrder !== r.workOrder) changes.push("workOrder");
      if (candidate.batch !== r.batch) changes.push("batch");
      if (changes.length) {
        modified.push({ before: r, after: candidate, changes });
        matchedAddedKeys.add(keyOf(candidate));
        continue;
      }
    }
    stillRemoved.push(r);
  }
  const finalAdded = added.filter((a) => !matchedAddedKeys.has(keyOf(a)));
  return { added: finalAdded, removed: stillRemoved, qtyChanged, modified };
}

// Human-readable labels for all mappable fields (used in MappingStep preview table)
const FIELD_LABEL: Record<MappableField, string> = {
  sku: 'מק"ט',
  description: "תיאור",
  workOrder: "פקודת עבודה",
  batch: "אצווה",
  quantity: "כמות",
  unit: "יח'",
  deliveryNumber: "מסמך",
  customerNumber: "לקוח",
  customerName: "שם לקוח",
  currency: "מטבע",
  unitPrice: "מחיר",
  totalAmount: "סכום",
  destinationCountry: "ארץ יעד",
  packingStatus: "סטטוס",
  date: "תאריך",
};

// ─── shared utility component ─────────────────────────────────────────────────

function DescCell({ text }: { text: string }) {
  if (!text) return <span className="text-muted-foreground/50 italic text-xs">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="line-clamp-2 text-xs leading-snug cursor-default max-w-[36ch]">{text}</div>
      </TooltipTrigger>
      <TooltipContent side="top" dir="rtl" className="max-w-sm leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

function ReplaceSessionPage() {
  const navigate = useNavigate();
  const { lines, allocations, cartons, activeFile, replaceSession } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingLines, setPendingLines] = useState<ShipmentLine[] | null>(null);
  const [pendingErrors, setPendingErrors] = useState<ImportError[]>([]);
  const [reviewFromMapping, setReviewFromMapping] = useState(false);
  const [ack, setAck] = useState(false);

  const diff = useMemo(() => (pendingLines ? computeDiff(lines, pendingLines) : null), [lines, pendingLines]);
  const packedCount = useMemo(() => new Set(allocations.map((a) => a.lineId)).size, [allocations]);
  const sessionImpact = useMemo(() => previewSessionImpact(allocations, cartons), [allocations, cartons]);

  async function pickFile(file: File) {
    setPendingName(file.name);
    setParseError(null);
    setStep("analyzing");
    try {
      const result = await parseExcelFile(file);
      const detectedMap = autoDetectColumns(result.headers);
      setParseResult(result);
      setColumnMap(detectedMap);

      const status = getMappingStatus(detectedMap);
      if (status.isComplete) {
        // Happy path: all required fields detected — skip mapping UI entirely
        const mapped = applyColumnMap(result.rows, detectedMap);
        const { valid, errors } = validateRows(mapped);
        setPendingLines(valid);
        setPendingErrors(errors);
        setReviewFromMapping(false);
        setStep("review");
      } else {
        // Exception: required columns missing or ambiguous — show mapping screen
        setStep("mapping");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "שגיאה בניתוח הקובץ");
      setStep("select");
    }
  }

  function handleMappingContinue(validLines: ShipmentLine[], errors: ImportError[]) {
    setPendingLines(validLines);
    setPendingErrors(errors);
    setReviewFromMapping(true);
    setStep("review");
  }

  function reset() {
    setStep("select");
    setPendingName(null);
    setPendingLines(null);
    setPendingErrors([]);
    setParseResult(null);
    setParseError(null);
    setColumnMap({});
    setReviewFromMapping(false);
    setAck(false);
  }

  function doReplace() {
    if (!pendingLines || !pendingName) return;
    replaceSession(pendingLines, pendingName);
    reset();
    navigate({ to: "/packing" });
  }

  return (
    <AppShell title="ייבוא קובץ Excel">
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5 max-w-6xl mx-auto w-full">

        {/* Active file banner */}
        <section className="bg-card rounded-xl ring-1 ring-black/5 p-5 flex items-center gap-4">
          <div className="size-12 bg-cyan-50 ring-1 ring-cyan-200/60 rounded-lg grid place-items-center shrink-0">
            <FileSpreadsheet className="size-5 text-cyan-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">קובץ פעיל בהפעלה הנוכחית</div>
            <div className="text-base font-semibold truncate">{activeFile?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {activeFile && (
                <>
                  נטען: {new Date(activeFile.loadedAt).toLocaleString("he-IL")} · {activeFile.lineCount} שורות · {activeFile.totalQty.toLocaleString()} יח׳
                </>
              )}
            </div>
          </div>
          <div className="text-left shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">התקדמות נוכחית</div>
            <div className="text-base font-semibold tabular-nums">
              {packedCount} / {lines.length} שורות בעבודה
            </div>
          </div>
        </section>

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Parse error banner */}
        {parseError && (
          <div className="bg-red-50 ring-1 ring-red-200/60 rounded-lg px-4 py-3 flex items-start gap-3">
            <AlertCircle className="size-4 text-red-600 mt-0.5 shrink-0" />
            <div className="text-sm text-red-800">
              <span className="font-semibold">שגיאת ניתוח: </span>{parseError}
            </div>
          </div>
        )}

        {/* ── step: select ── */}
        {step === "select" && (
          <section className="bg-card rounded-xl ring-1 ring-black/5 p-8">
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-brand-accent transition-colors rounded-xl p-10 flex flex-col items-center text-center gap-3 cursor-pointer"
            >
              <div className="size-14 bg-secondary rounded-full flex items-center justify-center">
                <Upload className="size-6 text-brand-accent" />
              </div>
              <div className="text-base font-semibold">בחר קובץ Excel להחלפת ההפעלה</div>
              <div className="text-xs text-muted-foreground max-w-md">
                קבצי .xlsx ו-.xls נתמכים. המערכת תנתח אוטומטית את הכותרות ותציג תצוגה מקדימה לפני האישור.
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </section>
        )}

        {/* ── step: analyzing ── */}
        {step === "analyzing" && (
          <section className="bg-card rounded-xl ring-1 ring-black/5 p-12 flex flex-col items-center gap-3">
            <div className="size-10 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-sm font-semibold">מנתח קובץ...</div>
            <div className="text-xs text-muted-foreground font-mono">{pendingName}</div>
          </section>
        )}

        {/* ── step: mapping (exception only) ── */}
        {step === "mapping" && parseResult && (
          <MappingStep
            parseResult={parseResult}
            columnMap={columnMap}
            onColumnMapChange={setColumnMap}
            onContinue={handleMappingContinue}
            onCancel={reset}
          />
        )}

        {/* ── step: review ── */}
        {step === "review" && parseResult && pendingLines !== null && pendingName && (
          <ReviewView
            parseResult={parseResult}
            pendingName={pendingName}
            pendingLines={pendingLines}
            oldCount={lines.length}
            importErrors={pendingErrors}
            diff={diff!}
            impact={sessionImpact}
            cancelLabel={reviewFromMapping ? "חזור למיפוי" : "ביטול"}
            onCancel={reviewFromMapping ? () => setStep("mapping") : reset}
            onProceed={() => setStep("confirm")}
          />
        )}

        {/* ── step: confirm ── */}
        {step === "confirm" && diff && pendingLines && pendingName && (
          <ConfirmDialog
            pendingName={pendingName}
            diff={diff}
            impact={sessionImpact}
            ack={ack}
            setAck={setAck}
            onCancel={() => setStep("review")}
            onConfirm={doReplace}
          />
        )}

      </div>
    </AppShell>
  );
}

// ─── StepIndicator ─────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  // Exception path — mapping required
  if (step === "mapping") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {(["1 · בחירת קובץ", "2 · ניתוח"] as const).map((label) => (
          <div key={label} className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-md text-xs font-medium ring-1 bg-cyan-50 text-cyan-700 ring-cyan-200/60">
              {label}
            </div>
            <div className="w-4 h-px bg-border" />
          </div>
        ))}
        <div className="px-3 py-1.5 rounded-md text-xs font-medium ring-1 bg-amber-50 text-amber-700 ring-amber-300/60 flex items-center gap-1.5">
          <AlertTriangle className="size-3" />
          מיפוי ידני נדרש
        </div>
        {(["3 · תצוגה מקדימה", "4 · אישור"] as const).map((label) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-4 h-px bg-border" />
            <div className="px-3 py-1.5 rounded-md text-xs font-medium ring-1 bg-secondary text-muted-foreground ring-transparent">
              {label}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Normal 4-step path
  const steps: { id: Exclude<Step, "mapping">; label: string }[] = [
    { id: "select", label: "1 · בחירת קובץ" },
    { id: "analyzing", label: "2 · ניתוח" },
    { id: "review", label: "3 · תצוגה מקדימה" },
    { id: "confirm", label: "4 · אישור" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-md text-xs font-medium ring-1 ${
              i === idx
                ? "bg-brand text-primary-foreground ring-brand"
                : i < idx
                  ? "bg-cyan-50 text-cyan-700 ring-cyan-200/60"
                  : "bg-secondary text-muted-foreground ring-transparent"
            }`}
          >
            {s.label}
          </div>
          {i < steps.length - 1 && <div className="w-4 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

// ─── ReviewView ────────────────────────────────────────────────────────────────

const REVIEW_PREVIEW_COLS: { key: keyof ShipmentLine; label: string; numeric?: boolean }[] = [
  { key: "sku", label: 'מק"ט' },
  { key: "description", label: "תיאור" },
  { key: "workOrder", label: 'פק"ע' },
  { key: "batch", label: "אצווה" },
  { key: "quantity", label: "כמות", numeric: true },
  { key: "unit", label: "יח'" },
  { key: "deliveryNumber", label: "מסמך" },
];

function ReviewView({
  parseResult,
  pendingLines,
  oldCount,
  importErrors,
  diff,
  impact,
  cancelLabel,
  onCancel,
  onProceed,
}: {
  parseResult: ParseResult;
  pendingName: string;
  pendingLines: ShipmentLine[];
  oldCount: number;
  importErrors: ImportError[];
  diff: Diff;
  impact: SessionImpact;
  cancelLabel: string;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const summary = useMemo(() => {
    const v = pendingLines;
    return {
      valid: v.length,
      invalid: parseResult.rowCount - v.length,
      workOrders: new Set(v.map((l) => l.workOrder)).size,
      batches: new Set(v.map((l) => l.batch)).size,
      skus: new Set(v.map((l) => l.sku)).size,
      totalQty: v.reduce((s, l) => s + l.quantity, 0),
    };
  }, [pendingLines, parseResult.rowCount]);

  const previewLines = pendingLines.slice(0, 50);

  return (
    <section className="flex flex-col gap-4">

      {/* ── file metadata ── */}
      <div className="bg-card rounded-xl ring-1 ring-black/5 p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="sm:col-span-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">קובץ חדש</div>
          <div className="text-sm font-semibold font-mono truncate" title={parseResult.fileName}>
            {parseResult.fileName}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">גודל</div>
          <div className="text-sm font-semibold">{formatFileSize(parseResult.fileSize)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">זמן העלאה</div>
          <div className="text-sm font-semibold tabular-nums">
            {new Date(parseResult.uploadedAt).toLocaleString("he-IL")}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">גיליון</div>
          <div className="text-sm font-semibold font-mono truncate" title={parseResult.activeSheet}>
            {parseResult.activeSheet}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">שורות / עמודות</div>
          <div className="text-sm font-semibold tabular-nums">
            {parseResult.rowCount.toLocaleString()} / {parseResult.headers.length}
          </div>
        </div>
      </div>

      {/* ── import summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-green-50 ring-1 ring-green-200/60 rounded-lg px-4 py-3 lg:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-green-700 mb-1">שורות לייבוא</div>
          <div className="text-2xl font-bold tabular-nums text-green-700">{summary.valid.toLocaleString()}</div>
          {summary.invalid > 0 && (
            <div className="text-[11px] text-red-600 mt-0.5 tabular-nums">{summary.invalid} הושמטו</div>
          )}
        </div>
        <div className="bg-card ring-1 ring-black/5 rounded-lg px-4 py-3">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">פקודות עבודה</div>
          <div className="text-xl font-bold tabular-nums">{summary.workOrders.toLocaleString()}</div>
        </div>
        <div className="bg-card ring-1 ring-black/5 rounded-lg px-4 py-3">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">אצוות</div>
          <div className="text-xl font-bold tabular-nums">{summary.batches.toLocaleString()}</div>
        </div>
        <div className="bg-card ring-1 ring-black/5 rounded-lg px-4 py-3">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">מק"טים ייחודיים</div>
          <div className="text-xl font-bold tabular-nums">{summary.skus.toLocaleString()}</div>
        </div>
        <div className="bg-card ring-1 ring-black/5 rounded-lg px-4 py-3">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">סה"כ כמות</div>
          <div className="text-xl font-bold tabular-nums">{summary.totalQty.toLocaleString()}</div>
        </div>
      </div>

      {/* ── diff counts (vs active session) ── */}
      {oldCount > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <SummaryCard icon={Plus} label="שורות חדשות" value={diff.added.length} tone="add" />
          <SummaryCard icon={Minus} label="שורות שהוסרו" value={diff.removed.length} tone="remove" />
          <SummaryCard icon={Pencil} label="שינויי כמות" value={diff.qtyChanged.length} tone="qty" />
          <SummaryCard icon={ArrowLeftRight} label='שינויי מק"ט/פק"ע/אצווה' value={diff.modified.length} tone="mod" />
        </div>
      )}

      {/* ── validation errors ── */}
      {importErrors.length > 0 && (
        <div className="bg-amber-50 ring-1 ring-amber-200/60 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200/60 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span className="text-sm font-semibold text-amber-800">
              שורות שהושמטו ({importErrors.length})
            </span>
            <span className="text-xs text-amber-700 mr-auto">
              {summary.valid.toLocaleString()} שורות תקינות יייובאו
            </span>
          </div>
          <div className="max-h-44 overflow-auto divide-y divide-amber-100">
            {importErrors.slice(0, 25).map((e, i) => (
              <div key={i} className="px-5 py-2 text-xs text-amber-800 flex items-start gap-3">
                <span className="font-mono font-semibold text-amber-600 shrink-0 tabular-nums">שורה {e.row}</span>
                <span className="font-semibold text-amber-700 shrink-0 min-w-[80px]">{e.field}</span>
                <span>{e.message}</span>
              </div>
            ))}
            {importErrors.length > 25 && (
              <div className="px-5 py-2 text-xs text-amber-600 text-center">
                +{importErrors.length - 25} שגיאות נוספות
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── session impact warning ── */}
      {impact.requiresConfirmation && (
        <div className="bg-amber-50 ring-1 ring-amber-200/60 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="size-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 flex-1">
            <div className="font-semibold mb-1">שים לב — קיימת עבודה בהפעלה הנוכחית שתאבד</div>
            <div className="flex gap-4">
              <span>{impact.packedLineCount} שורות ארוזות</span>
              <span>{impact.openCartonCount} קרטונים פתוחים</span>
              <span>{impact.closedCartonCount} קרטונים סגורים</span>
            </div>
          </div>
        </div>
      )}

      {/* ── preview table ── */}
      <div className="bg-card rounded-xl ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">תצוגה מקדימה</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            מציג {previewLines.length.toLocaleString()} מתוך {summary.valid.toLocaleString()} שורות תקינות
          </span>
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-right text-sm min-w-max">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-[11px] text-muted-foreground border-b border-border">
                <th className="py-2 px-3 font-medium w-10 text-center">#</th>
                {REVIEW_PREVIEW_COLS.map((col) => (
                  <th key={col.key} className="py-2 px-3 font-medium whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewLines.map((line, i) => (
                <tr key={line.id} className={`border-b border-border/50 ${i % 2 !== 0 ? "bg-secondary/20" : ""}`}>
                  <td className="py-1.5 px-3 text-center text-[11px] text-muted-foreground tabular-nums">
                    {i + 1}
                  </td>
                  {REVIEW_PREVIEW_COLS.map((col) => {
                    const val = line[col.key];
                    const str = val !== null && val !== undefined ? String(val) : "";
                    if (col.key === "description") {
                      return (
                        <td key={col.key} className="py-1.5 px-3 align-top">
                          <DescCell text={str} />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col.key}
                        className={`py-1.5 px-3 text-xs whitespace-nowrap ${
                          col.numeric ? "tabular-nums font-semibold" : "font-mono"
                        } ${!str ? "text-muted-foreground/40" : ""}`}
                      >
                        {str || "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── diff detail sections (only when replacing an existing session) ── */}
      {oldCount > 0 && (
        <>
          <DiffSection title="שורות חדשות (יתווספו)" tone="add" lines={diff.added.map((l) => ({ a: l }))} renderQty={(a) => a.quantity} />
          <DiffSection title="שורות שהוסרו (יימחקו)" tone="remove" lines={diff.removed.map((l) => ({ a: l }))} renderQty={(a) => a.quantity} />
          <DiffSection
            title="שינויי כמות"
            tone="qty"
            lines={diff.qtyChanged.map((x) => ({ a: x.after, b: x.before }))}
            renderQty={(a, b) => `${b!.quantity} → ${a.quantity}`}
          />
          <ModifiedSection items={diff.modified} />
        </>
      )}

      {/* ── actions ── */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-zinc-200"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onProceed}
          disabled={summary.valid === 0}
          className="px-5 py-2 bg-brand text-primary-foreground rounded-md text-sm font-semibold hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          המשך לאישור החלפה <Replace className="size-4" />
        </button>
      </div>
    </section>
  );
}

// ─── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Plus;
  label: string;
  value: number;
  tone: "add" | "remove" | "qty" | "mod";
}) {
  const cls = {
    add: "bg-green-50 text-green-700 ring-green-200/60",
    remove: "bg-red-50 text-red-700 ring-red-200/60",
    qty: "bg-amber-50 text-amber-700 ring-amber-200/60",
    mod: "bg-cyan-50 text-cyan-700 ring-cyan-200/60",
  }[tone];
  return (
    <div className={`rounded-lg ring-1 px-4 py-3 ${cls}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value.toLocaleString()}</div>
    </div>
  );
}

// ─── DiffSection ───────────────────────────────────────────────────────────────

function DiffSection({
  title,
  tone,
  lines,
  renderQty,
}: {
  title: string;
  tone: "add" | "remove" | "qty";
  lines: { a: ShipmentLine; b?: ShipmentLine }[];
  renderQty: (a: ShipmentLine, b?: ShipmentLine) => string | number;
}) {
  if (!lines.length) return null;
  const bar = tone === "add" ? "bg-green-500" : tone === "remove" ? "bg-red-400" : "bg-amber-500";
  return (
    <div className="bg-card rounded-xl ring-1 ring-black/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className={`block w-1.5 h-4 rounded-full ${bar}`} />
          {title}
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">{lines.length}</span>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[11px] text-muted-foreground border-b border-border">
              <th className="py-2 px-4 font-medium">מק"ט</th>
              <th className="py-2 px-2 font-medium">תיאור</th>
              <th className="py-2 px-2 font-medium">פק"ע</th>
              <th className="py-2 px-2 font-medium">אצווה</th>
              <th className="py-2 px-4 font-medium text-center">כמות</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2 px-4 font-mono text-xs text-brand-accent">{row.a.sku}</td>
                <td className="py-2 px-2"><DescCell text={row.a.description} /></td>
                <td className="py-2 px-2 font-mono text-xs text-muted-foreground">{row.a.workOrder}</td>
                <td className="py-2 px-2 font-mono text-xs text-muted-foreground">{row.a.batch}</td>
                <td className="py-2 px-4 text-center tabular-nums font-semibold">{renderQty(row.a, row.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ModifiedSection ───────────────────────────────────────────────────────────

function ModifiedSection({ items }: { items: Diff["modified"] }) {
  if (!items.length) return null;
  const labelMap = { sku: 'מק"ט', workOrder: 'פק"ע', batch: "אצווה" } as const;
  return (
    <div className="bg-card rounded-xl ring-1 ring-black/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="block w-1.5 h-4 rounded-full bg-cyan-500" />
          שינויי מק"ט / פק"ע / אצווה
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[11px] text-muted-foreground border-b border-border">
              <th className="py-2 px-4 font-medium">שדה</th>
              <th className="py-2 px-2 font-medium">לפני</th>
              <th className="py-2 px-2 font-medium">אחרי</th>
              <th className="py-2 px-2 font-medium">תיאור פריט</th>
              <th className="py-2 px-4 font-medium text-center">כמות</th>
            </tr>
          </thead>
          <tbody>
            {items.flatMap((it, i) =>
              it.changes.map((ch, j) => (
                <tr key={`${i}-${j}`} className="border-b border-border/50">
                  <td className="py-2 px-4">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/50">
                      {labelMap[ch]}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs">{it.before[ch]}</td>
                  <td className="py-2 px-2 font-mono text-xs font-semibold">{it.after[ch]}</td>
                  <td className="py-2 px-2"><DescCell text={it.after.description} /></td>
                  <td className="py-2 px-4 text-center tabular-nums">{it.after.quantity}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MappingStep (exception screen) ───────────────────────────────────────────

const PREVIEW_FIELD_ORDER: MappableField[] = [
  "sku", "description", "workOrder", "batch", "quantity", "unit",
  "deliveryNumber", "customerName", "customerNumber",
  "currency", "destinationCountry", "date",
];

function MappingStep({
  parseResult,
  columnMap,
  onColumnMapChange,
  onContinue,
  onCancel,
}: {
  parseResult: ParseResult;
  columnMap: ColumnMap;
  onColumnMapChange: (m: ColumnMap) => void;
  onContinue: (lines: ShipmentLine[], errors: ImportError[]) => void;
  onCancel: () => void;
}) {
  const mappedRows = useMemo(
    () => applyColumnMap(parseResult.rows, columnMap),
    [parseResult.rows, columnMap],
  );

  const validation = useMemo(() => validateRows(mappedRows), [mappedRows]);
  const mappingStatus = getMappingStatus(columnMap);

  const errorRowSet = useMemo(
    () => new Set(validation.errors.map((e) => e.row - 2)),
    [validation.errors],
  );

  const summary = useMemo(() => {
    const v = validation.valid;
    return {
      valid: v.length,
      invalid: parseResult.rowCount - v.length,
      deliveries: new Set(v.map((l) => l.deliveryNumber).filter((x) => x !== "—")).size,
      workOrders: new Set(v.map((l) => l.workOrder)).size,
      batches: new Set(v.map((l) => l.batch)).size,
      skus: new Set(v.map((l) => l.sku)).size,
      totalQty: v.reduce((s, l) => s + l.quantity, 0),
    };
  }, [validation.valid, parseResult.rowCount]);

  const previewCols = PREVIEW_FIELD_ORDER.filter((f) => !!columnMap[f]);
  const previewRows = mappedRows.slice(0, 50);

  return (
    <section className="flex flex-col gap-4">

      {/* Exception banner */}
      <div className="bg-amber-50 ring-1 ring-amber-300/60 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-amber-800">לא ניתן לזהות אוטומטית את כל שדות החובה</div>
          <div className="text-xs text-amber-700 mt-1">
            קובץ זה שונה מפורמט Priority הסטנדרטי. מפה ידנית את העמודות החסרות כדי להמשיך.
          </div>
        </div>
      </div>

      {/* ── file metadata card ── */}
      <div className="bg-card rounded-xl ring-1 ring-black/5 p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="sm:col-span-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">שם קובץ</div>
          <div className="text-sm font-semibold font-mono truncate" title={parseResult.fileName}>
            {parseResult.fileName}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">גודל</div>
          <div className="text-sm font-semibold">{formatFileSize(parseResult.fileSize)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">זמן העלאה</div>
          <div className="text-sm font-semibold tabular-nums">
            {new Date(parseResult.uploadedAt).toLocaleString("he-IL")}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">שם גיליון</div>
          <div className="text-sm font-semibold font-mono truncate" title={parseResult.activeSheet}>
            {parseResult.activeSheet}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">שורות / עמודות</div>
          <div className="text-sm font-semibold tabular-nums">
            {parseResult.rowCount.toLocaleString()} / {parseResult.headers.length}
          </div>
        </div>
      </div>

      {/* ── two-column: mapping table + summary ── */}
      <div className="grid grid-cols-[1fr_260px] gap-4 items-start">

        {/* Column mapping table */}
        <div className="bg-card rounded-xl ring-1 ring-black/5 overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">מיפוי עמודות</h3>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 shrink-0 ${
                mappingStatus.isComplete
                  ? "bg-green-50 text-green-700 ring-green-200/60"
                  : "bg-amber-50 text-amber-700 ring-amber-200/60"
              }`}
            >
              {mappingStatus.mappedRequired}/{mappingStatus.totalRequired} שדות חובה ממופים
            </span>
          </div>
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="text-[11px] text-muted-foreground border-b border-border bg-secondary/30">
                <th className="py-2 px-4 font-medium text-right">שדה יעד</th>
                <th className="py-2 px-4 font-medium text-right">עמודת מקור בקובץ</th>
                <th className="py-2 px-3 font-medium text-center w-12"></th>
              </tr>
            </thead>
            <tbody>
              {FIELD_DEFINITIONS.map((def) => {
                const mapped = columnMap[def.field];
                return (
                  <tr key={def.field} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-2 px-4">
                      <span className="text-sm font-medium">{def.label}</span>
                      {def.required && <span className="mr-1 text-[10px] text-red-500 font-bold">*</span>}
                    </td>
                    <td className="py-2 px-4">
                      <select
                        value={mapped ?? ""}
                        onChange={(e) =>
                          onColumnMapChange({
                            ...columnMap,
                            [def.field]: e.target.value || undefined,
                          })
                        }
                        className="w-full text-sm border border-input rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        dir="ltr"
                      >
                        <option value="">— לא ממופה —</option>
                        {parseResult.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {mapped ? (
                        <CheckCheck className="size-4 text-green-600 mx-auto" />
                      ) : def.required ? (
                        <AlertCircle className="size-4 text-amber-500 mx-auto" />
                      ) : (
                        <div className="size-3 rounded-full border border-border mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right column: summary + detected columns */}
        <div className="flex flex-col gap-3">

          <div className="bg-card rounded-xl ring-1 ring-black/5 p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-3">
              סיכום ייבוא
            </div>
            <div className="flex flex-col gap-2">
              <SummaryRow label="שורות תקינות" value={summary.valid} valueClass="text-green-700" />
              {summary.invalid > 0 && (
                <SummaryRow label="שורות עם שגיאות" value={summary.invalid} valueClass="text-red-600" />
              )}
              <div className="border-t border-border pt-2 flex flex-col gap-2">
                {summary.deliveries > 0 && (
                  <SummaryRow label="משלוחים" value={summary.deliveries} />
                )}
                <SummaryRow label="פקודות עבודה" value={summary.workOrders} />
                <SummaryRow label="אצוות" value={summary.batches} />
                <SummaryRow label='מק"טים ייחודיים' value={summary.skus} />
                <div className="border-t border-border pt-2">
                  <SummaryRow label='סה"כ כמות' value={summary.totalQty} valueClass="text-base font-bold" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl ring-1 ring-black/5 p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
              עמודות שזוהו ({parseResult.headers.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {parseResult.headers.map((h) => (
                <span
                  key={h}
                  className="text-[10px] font-mono px-1.5 py-0.5 bg-secondary rounded ring-1 ring-black/5 truncate max-w-[120px]"
                  title={h}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>

          {!mappingStatus.isComplete && (
            <div className="bg-amber-50 ring-1 ring-amber-200/60 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                מפה את כל שדות החובה (*) כדי להמשיך.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── validation warnings ── */}
      {validation.errors.length > 0 && (
        <div className="bg-amber-50 ring-1 ring-amber-200/60 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200/60 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span className="text-sm font-semibold text-amber-800">
              אזהרות ייבוא ({validation.errors.length})
            </span>
            <span className="text-xs text-amber-700 mr-auto">
              {validation.valid.length.toLocaleString()} שורות תקינות יייובאו
            </span>
          </div>
          <div className="max-h-44 overflow-auto divide-y divide-amber-100">
            {validation.errors.slice(0, 25).map((e, i) => (
              <div key={i} className="px-5 py-2 text-xs text-amber-800 flex items-start gap-3">
                <span className="font-mono font-semibold text-amber-600 shrink-0 tabular-nums">שורה {e.row}</span>
                <span className="font-semibold text-amber-700 shrink-0 min-w-[80px]">{e.field}</span>
                <span>{e.message}</span>
              </div>
            ))}
            {validation.errors.length > 25 && (
              <div className="px-5 py-2 text-xs text-amber-600 text-center">
                +{validation.errors.length - 25} שגיאות נוספות לא מוצגות
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 50-row preview ── */}
      <div className="bg-card rounded-xl ring-1 ring-black/5 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">תצוגה מקדימה</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            מציג {Math.min(50, parseResult.rowCount)} מתוך {parseResult.rowCount.toLocaleString()} שורות
          </span>
        </div>
        {previewCols.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            מפה לפחות עמודה אחת כדי לראות תצוגה מקדימה
          </div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-right text-sm min-w-max">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-[11px] text-muted-foreground border-b border-border">
                  <th className="py-2 px-3 font-medium w-10 text-center">#</th>
                  {previewCols.map((col) => (
                    <th key={col} className="py-2 px-3 font-medium whitespace-nowrap">
                      {FIELD_LABEL[col]}
                      <span className="mr-1 text-[10px] font-normal text-muted-foreground/50 font-mono">
                        {columnMap[col]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => {
                  const hasError = errorRowSet.has(i);
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border/50 ${
                        hasError ? "bg-red-50" : i % 2 !== 0 ? "bg-secondary/20" : ""
                      }`}
                    >
                      <td className="py-1.5 px-3 text-center text-[11px] text-muted-foreground tabular-nums">
                        {i + 2}
                      </td>
                      {previewCols.map((col) => {
                        const raw = row[col];
                        const val = raw !== null && raw !== undefined ? String(raw) : "";
                        if (col === "description") {
                          return (
                            <td key={col} className="py-1.5 px-3 align-top">
                              <DescCell text={val} />
                            </td>
                          );
                        }
                        const isNum = col === "quantity" || col === "unitPrice" || col === "totalAmount";
                        return (
                          <td
                            key={col}
                            className={`py-1.5 px-3 text-xs whitespace-nowrap ${
                              isNum ? "tabular-nums font-semibold" : "font-mono"
                            } ${!val ? "text-muted-foreground/40" : ""}`}
                          >
                            {val || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── actions ── */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-zinc-200"
        >
          ביטול
        </button>
        <button
          onClick={() => onContinue(validation.valid, validation.errors)}
          disabled={!mappingStatus.isComplete || validation.valid.length === 0}
          className="px-5 py-2 bg-brand text-primary-foreground rounded-md text-sm font-semibold hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          המשך לתצוגה מקדימה
          <ArrowLeftRight className="size-4" />
        </button>
      </div>
    </section>
  );
}

// ─── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  valueClass = "text-sm font-semibold",
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value.toLocaleString()}</span>
    </div>
  );
}

// ─── ConfirmDialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  pendingName,
  diff,
  impact,
  ack,
  setAck,
  onCancel,
  onConfirm,
}: {
  pendingName: string;
  diff: Diff;
  impact: SessionImpact;
  ack: boolean;
  setAck: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className="bg-card rounded-xl ring-1 ring-black/10 w-full max-w-lg p-6 flex flex-col gap-4 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-red-50 ring-1 ring-red-200/60 rounded-lg grid place-items-center">
              <ShieldAlert className="size-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold">אישור החלפת קובץ פעיל</h3>
              <p className="text-xs text-muted-foreground">פעולה זו אינה הפיכה.</p>
            </div>
          </div>
          <button onClick={onCancel} className="size-8 grid place-items-center hover:bg-secondary rounded">
            <X className="size-4" />
          </button>
        </div>

        <div className="bg-secondary rounded-lg p-3 text-sm">
          <div className="text-xs text-muted-foreground">קובץ חדש</div>
          <div className="font-mono font-semibold truncate">{pendingName}</div>
        </div>

        {impact.requiresConfirmation && (
          <div className="bg-red-50 ring-1 ring-red-200/60 rounded-lg p-3 flex flex-col gap-2">
            <div className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" />
              עבודה קיימת שתאבד
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-red-100/50 rounded-md py-2">
                <div className="text-base font-bold text-red-700 tabular-nums">{impact.packedLineCount}</div>
                <div className="text-[10px] text-red-600">שורות ארוזות</div>
              </div>
              <div className="bg-red-100/50 rounded-md py-2">
                <div className="text-base font-bold text-red-700 tabular-nums">{impact.openCartonCount}</div>
                <div className="text-[10px] text-red-600">קרטונים פתוחים</div>
              </div>
              <div className="bg-red-100/50 rounded-md py-2">
                <div className="text-base font-bold text-red-700 tabular-nums">{impact.closedCartonCount}</div>
                <div className="text-[10px] text-red-600">קרטונים סגורים</div>
              </div>
            </div>
          </div>
        )}

        <ul className="text-xs text-foreground/80 space-y-1.5 list-disc pr-5">
          <li>יתווספו <span className="font-semibold text-green-700 tabular-nums">{diff.added.length}</span> שורות חדשות.</li>
          <li>יוסרו <span className="font-semibold text-red-700 tabular-nums">{diff.removed.length}</span> שורות.</li>
          <li>יעודכנו כמויות ב-<span className="font-semibold text-amber-700 tabular-nums">{diff.qtyChanged.length}</span> שורות.</li>
          <li><span className="font-semibold text-cyan-700 tabular-nums">{diff.modified.length}</span> שורות עם שינויי מק"ט / פק"ע / אצווה.</li>
        </ul>

        <label className="flex items-start gap-2 bg-secondary rounded-md p-3 cursor-pointer text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span>אני מאשר/ת שהקובץ החדש יחליף את ההפעלה הפעילה{impact.totalCartonCount > 0 ? " והקרטונים הקיימים יימחקו" : ""}.</span>
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-zinc-200">
            ביטול
          </button>
          <button
            onClick={onConfirm}
            disabled={!ack}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="size-4" /> החלף קובץ פעיל
          </button>
        </div>
      </div>
    </div>
  );
}
