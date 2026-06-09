import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, FileSpreadsheet, Plus, Minus, Pencil, Replace, ShieldAlert, Upload, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import type { ShipmentLine } from "@/lib/types";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "החלפת קובץ פעיל — Packing Control Center" }, { name: "description", content: "תהליך מבוקר להחלפת קובץ ההזמנות הפעיל" }] }),
  component: ReplaceSessionPage,
});

type Step = "select" | "analyzing" | "review" | "confirm";

type Diff = {
  added: ShipmentLine[];
  removed: ShipmentLine[];
  qtyChanged: { key: string; before: ShipmentLine; after: ShipmentLine }[];
  modified: { before: ShipmentLine; after: ShipmentLine; changes: ("sku" | "workOrder" | "batch")[] }[];
};

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

  // Try to detect "modified" pairs by matching removed↔added on description+delivery
  const modified: Diff["modified"] = [];
  const stillRemoved: ShipmentLine[] = [];
  const matchedAddedKeys = new Set<string>();
  for (const r of removed) {
    const candidate = added.find(
      (a) => !matchedAddedKeys.has(keyOf(a)) && a.deliveryNumber === r.deliveryNumber && a.description === r.description && a.quantity === r.quantity,
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

function simulateNewFile(oldLines: ShipmentLine[]): ShipmentLine[] {
  // Until real Excel parsing is implemented, simulate a perturbed file so the diff UI is meaningful.
  const next: ShipmentLine[] = [];
  let id = 90000;
  oldLines.forEach((l, i) => {
    if (i % 11 === 0) return; // remove ~9%
    if (i % 7 === 0) {
      next.push({ ...l, quantity: Math.max(1, Math.round(l.quantity * 1.25)) }); // qty change
      return;
    }
    if (i % 13 === 0) {
      next.push({ ...l, sku: l.sku.slice(0, -1) + "X" }); // SKU change
      return;
    }
    if (i % 17 === 0) {
      next.push({ ...l, workOrder: l.workOrder.replace(/\d$/, "9") }); // WO change
      return;
    }
    if (i % 19 === 0) {
      next.push({ ...l, batch: l.batch.replace(/\d$/, "8") }); // batch change
      return;
    }
    next.push(l);
  });
  // add a few brand-new lines
  const first = oldLines[0];
  if (first) {
    for (let k = 0; k < 3; k++) {
      next.push({
        ...first,
        id: `NEW${id++}`,
        sku: `EI99900${k}00`,
        description: `פריט חדש שנוסף לקובץ דמו #${k + 1}`,
        quantity: 100 + k * 50,
        batch: first.batch,
      });
    }
  }
  return next;
}

function ReplaceSessionPage() {
  const navigate = useNavigate();
  const { lines, allocations, activeFile, replaceSession } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingLines, setPendingLines] = useState<ShipmentLine[] | null>(null);
  const [ack, setAck] = useState(false);

  const diff = useMemo(() => (pendingLines ? computeDiff(lines, pendingLines) : null), [lines, pendingLines]);
  const packedCount = useMemo(() => new Set(allocations.map((a) => a.lineId)).size, [allocations]);

  function pickFile(file: File) {
    setPendingName(file.name);
    setStep("analyzing");
    // Simulate parse + diff latency
    setTimeout(() => {
      setPendingLines(simulateNewFile(lines));
      setStep("review");
    }, 700);
  }

  function reset() {
    setStep("select");
    setPendingName(null);
    setPendingLines(null);
    setAck(false);
  }

  function doReplace() {
    if (!pendingLines || !pendingName) return;
    replaceSession(pendingLines, pendingName);
    reset();
    navigate({ to: "/packing" });
  }

  return (
    <AppShell title="החלפת קובץ פעיל">
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5 max-w-6xl mx-auto w-full">
        {/* Active file panel */}
        <section className="bg-card rounded-xl ring-1 ring-black/5 p-5 flex items-center gap-4">
          <div className="size-12 bg-cyan-50 ring-1 ring-cyan-200/60 rounded-lg grid place-items-center">
            <FileSpreadsheet className="size-5 text-cyan-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">קובץ פעיל בהפעלה הנוכחית</div>
            <div className="text-base font-semibold truncate">{activeFile?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {activeFile && <>נטען: {new Date(activeFile.loadedAt).toLocaleString("he-IL")} · {activeFile.lineCount} שורות · {activeFile.totalQty.toLocaleString()} יח׳</>}
            </div>
          </div>
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">התקדמות נוכחית</div>
            <div className="text-base font-semibold tabular-nums">{packedCount} / {lines.length} שורות בעבודה</div>
          </div>
        </section>

        {/* Workflow steps indicator */}
        <StepIndicator step={step} />

        {step === "select" && (
          <section className="bg-card rounded-xl ring-1 ring-black/5 p-8">
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-brand-accent transition-colors rounded-xl p-10 flex flex-col items-center text-center gap-3 cursor-pointer"
            >
              <div className="size-14 bg-secondary rounded-full flex items-center justify-center">
                <Upload className="size-6 text-brand-accent" />
              </div>
              <div className="text-base font-semibold">בחר קובץ Excel חדש להחלפת ההפעלה</div>
              <div className="text-xs text-muted-foreground max-w-md">
                לוגיקת קריאת Excel תוטמע בנפרד. כעת המערכת מדמה ניתוח קובץ כדי להציג את תהליך ההשוואה והאישור המבוקר.
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
              <button
                onClick={(e) => { e.stopPropagation(); pickFile(new File([], `simulated_new_file_${new Date().toISOString().slice(0,10)}.xlsx`)); }}
                className="mt-2 text-xs bg-secondary hover:bg-zinc-200 px-3 py-1.5 rounded-md font-medium"
              >
                הפעל ניתוח דמו ללא בחירת קובץ
              </button>
            </div>
          </section>
        )}

        {step === "analyzing" && (
          <section className="bg-card rounded-xl ring-1 ring-black/5 p-12 flex flex-col items-center gap-3">
            <div className="size-10 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-sm font-semibold">מנתח קובץ ומשווה להפעלה הפעילה...</div>
            <div className="text-xs text-muted-foreground">{pendingName}</div>
          </section>
        )}

        {step === "review" && diff && pendingLines && pendingName && (
          <ReviewView
            pendingName={pendingName}
            oldCount={lines.length}
            newCount={pendingLines.length}
            packedCount={packedCount}
            diff={diff}
            onCancel={reset}
            onProceed={() => setStep("confirm")}
          />
        )}

        {step === "confirm" && diff && pendingLines && pendingName && (
          <ConfirmDialog
            pendingName={pendingName}
            diff={diff}
            packedCount={packedCount}
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

function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "select", label: "1 · בחירת קובץ" },
    { id: "analyzing", label: "2 · ניתוח" },
    { id: "review", label: "3 · השוואה" },
    { id: "confirm", label: "4 · אישור והחלפה" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-md text-xs font-medium ring-1 ${i === idx ? "bg-brand text-primary-foreground ring-brand" : i < idx ? "bg-cyan-50 text-cyan-700 ring-cyan-200/60" : "bg-secondary text-muted-foreground ring-transparent"}`}>
            {s.label}
          </div>
          {i < steps.length - 1 && <div className="w-4 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof Plus; label: string; value: number; tone: "add" | "remove" | "qty" | "mod" }) {
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

function ReviewView({ pendingName, oldCount, newCount, packedCount, diff, onCancel, onProceed }: {
  pendingName: string; oldCount: number; newCount: number; packedCount: number; diff: Diff;
  onCancel: () => void; onProceed: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="bg-card rounded-xl ring-1 ring-black/5 p-5 flex items-center gap-4">
        <ArrowLeftRight className="size-5 text-brand-accent" />
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">השוואת קבצים</div>
          <div className="text-sm">
            <span className="font-medium">קובץ חדש:</span> <span className="font-mono">{pendingName}</span>
            <span className="text-muted-foreground"> ({newCount} שורות) </span>
            <span className="mx-2 text-muted-foreground">↔</span>
            <span className="font-medium">קובץ פעיל</span>
            <span className="text-muted-foreground"> ({oldCount} שורות)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <SummaryCard icon={Plus} label="שורות חדשות" value={diff.added.length} tone="add" />
        <SummaryCard icon={Minus} label="שורות שהוסרו" value={diff.removed.length} tone="remove" />
        <SummaryCard icon={Pencil} label="שינויי כמות" value={diff.qtyChanged.length} tone="qty" />
        <SummaryCard icon={ArrowLeftRight} label="שינויי מק״ט/פק״ע/אצווה" value={diff.modified.length} tone="mod" />
      </div>

      {packedCount > 0 && (
        <div className="bg-amber-50 ring-1 ring-amber-200/60 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="size-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800">
            <div className="font-semibold mb-0.5">שים לב — קיימות הקצאות אריזה פעילות ({packedCount} שורות)</div>
            <div>החלפת הקובץ תאפס את כל הקרטונים וההקצאות בהפעלה הנוכחית.</div>
          </div>
        </div>
      )}

      <DiffSection title="שורות חדשות (יתווספו)" tone="add" lines={diff.added.map((l) => ({ a: l }))} renderQty={(a) => a.quantity} />
      <DiffSection title="שורות שהוסרו (יימחקו)" tone="remove" lines={diff.removed.map((l) => ({ a: l }))} renderQty={(a) => a.quantity} />
      <DiffSection
        title="שינויי כמות"
        tone="qty"
        lines={diff.qtyChanged.map((x) => ({ a: x.after, b: x.before }))}
        renderQty={(a, b) => `${b!.quantity} → ${a.quantity}`}
      />
      <ModifiedSection items={diff.modified} />

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-zinc-200">ביטול</button>
        <button onClick={onProceed} className="px-5 py-2 bg-brand text-primary-foreground rounded-md text-sm font-semibold hover:bg-zinc-800 inline-flex items-center gap-1.5">
          המשך לאישור החלפה <Replace className="size-4" />
        </button>
      </div>
    </section>
  );
}

function DiffSection({ title, tone, lines, renderQty }: {
  title: string; tone: "add" | "remove" | "qty";
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
              <th className="py-2 px-4 font-medium">מק״ט</th>
              <th className="py-2 px-2 font-medium">תיאור</th>
              <th className="py-2 px-2 font-medium">פק״ע</th>
              <th className="py-2 px-2 font-medium">אצווה</th>
              <th className="py-2 px-4 font-medium text-center">כמות</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2 px-4 font-mono text-xs text-brand-accent">{row.a.sku}</td>
                <td className="py-2 px-2 max-w-[40ch] truncate">{row.a.description}</td>
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

function ModifiedSection({ items }: { items: Diff["modified"] }) {
  if (!items.length) return null;
  const labelMap = { sku: "מק״ט", workOrder: "פק״ע", batch: "אצווה" } as const;
  return (
    <div className="bg-card rounded-xl ring-1 ring-black/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="block w-1.5 h-4 rounded-full bg-cyan-500" />
          שינויי מק״ט / פק״ע / אצווה
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
            {items.flatMap((it, i) => it.changes.map((ch, j) => (
              <tr key={`${i}-${j}`} className="border-b border-border/50">
                <td className="py-2 px-4"><span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/50">{labelMap[ch]}</span></td>
                <td className="py-2 px-2 font-mono text-xs">{it.before[ch]}</td>
                <td className="py-2 px-2 font-mono text-xs font-semibold">{it.after[ch]}</td>
                <td className="py-2 px-2 max-w-[34ch] truncate">{it.after.description}</td>
                <td className="py-2 px-4 text-center tabular-nums">{it.after.quantity}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmDialog({ pendingName, diff, packedCount, ack, setAck, onCancel, onConfirm }: {
  pendingName: string; diff: Diff; packedCount: number; ack: boolean; setAck: (v: boolean) => void;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} dir="rtl" className="bg-card rounded-xl ring-1 ring-black/10 w-full max-w-lg p-6 flex flex-col gap-4 shadow-xl">
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
          <button onClick={onCancel} className="size-8 grid place-items-center hover:bg-secondary rounded"><X className="size-4" /></button>
        </div>

        <div className="bg-surface-muted rounded-lg p-3 text-sm">
          <div className="text-xs text-muted-foreground">קובץ חדש</div>
          <div className="font-mono font-semibold truncate">{pendingName}</div>
        </div>

        <ul className="text-xs text-foreground/80 space-y-1.5 list-disc pr-5">
          <li>יתווספו <span className="font-semibold text-green-700 tabular-nums">{diff.added.length}</span> שורות חדשות.</li>
          <li>יוסרו <span className="font-semibold text-red-700 tabular-nums">{diff.removed.length}</span> שורות.</li>
          <li>יעודכנו כמויות ב-<span className="font-semibold text-amber-700 tabular-nums">{diff.qtyChanged.length}</span> שורות.</li>
          <li><span className="font-semibold text-cyan-700 tabular-nums">{diff.modified.length}</span> שורות עם שינויי מק״ט / פק״ע / אצווה.</li>
          {packedCount > 0 && (
            <li className="text-red-700 font-medium">כל הקרטונים וההקצאות בהפעלה הנוכחית ({packedCount} שורות עם הקצאות) יימחקו.</li>
          )}
        </ul>

        <label className="flex items-start gap-2 bg-secondary rounded-md p-3 cursor-pointer text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span>אני מאשר/ת שהקובץ החדש יחליף את ההפעלה הפעילה והקרטונים הקיימים יימחקו.</span>
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-zinc-200">ביטול</button>
          <button onClick={onConfirm} disabled={!ack}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            <CheckCircle2 className="size-4" /> החלף קובץ פעיל
          </button>
        </div>
      </div>
    </div>
  );
}