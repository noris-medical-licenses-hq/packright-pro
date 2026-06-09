import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Plus, Search, Package, X, ExternalLink, AlertTriangle, Trash2, MoveRight, PackageCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CartonStatusBadge, LineStatusBadge } from "@/components/StatusBadge";
import { getCartonTotalQty, getLineStatus, getPackedForLine, useStore } from "@/lib/store";
import type { Carton, ShipmentLine } from "@/lib/types";

export const Route = createFileRoute("/packing")({
  head: () => ({ meta: [{ title: "שולחן אריזה — Packing Control Center" }, { name: "description", content: "שולחן עבודה לאריזת משלוחים ברמת שורת מוצר" }] }),
  component: PackingWorkspace,
});

type Draft = { id: string; cartonId: string | "__new__"; quantity: number; newNumber?: string };

function PackingWorkspace() {
  const { lines, cartons, allocations, createCarton, allocate, updateAllocation, removeAllocation, moveAllocation, setCartonStatus, deleteCarton } = useStore();

  const [search, setSearch] = useState("");
  const [expandedDeliv, setExpandedDeliv] = useState<Record<string, boolean>>({});
  const [expandedWO, setExpandedWO] = useState<Record<string, boolean>>({});
  const [selectedBatch, setSelectedBatch] = useState<{ wo: string; batch: string } | null>(null);
  const [packLineId, setPackLineId] = useState<string | null>(null);

  // Tree
  const tree = useMemo(() => {
    const filtered = lines.filter((l) =>
      !search ||
      l.deliveryNumber.includes(search) || l.workOrder.includes(search) ||
      l.batch.includes(search) || l.sku.includes(search) || l.description.includes(search)
    );
    const m = new Map<string, Map<string, Map<string, ShipmentLine[]>>>();
    for (const l of filtered) {
      let d = m.get(l.deliveryNumber); if (!d) { d = new Map(); m.set(l.deliveryNumber, d); }
      let w = d.get(l.workOrder); if (!w) { w = new Map(); d.set(l.workOrder, w); }
      let b = w.get(l.batch); if (!b) { b = []; w.set(l.batch, b); }
      b.push(l);
    }
    return m;
  }, [lines, search]);

  useEffect(() => {
    if (selectedBatch) return;
    const first = lines[0];
    if (first) {
      setExpandedDeliv({ [first.deliveryNumber]: true });
      setExpandedWO({ [first.workOrder]: true });
      setSelectedBatch({ wo: first.workOrder, batch: first.batch });
    }
  }, [lines, selectedBatch]);

  const visibleLines = useMemo(() => {
    if (!selectedBatch) return [];
    return lines.filter((l) => l.workOrder === selectedBatch.wo && l.batch === selectedBatch.batch);
  }, [lines, selectedBatch]);

  function progressOf(group: ShipmentLine[]) {
    const total = group.reduce((s, l) => s + l.quantity, 0);
    const packed = group.reduce((s, l) => s + getPackedForLine(allocations, l.id), 0);
    return { total, packed, pct: total ? Math.round((packed / total) * 100) : 0 };
  }
  function dotColor(packed: number, total: number) {
    if (packed === 0) return "bg-red-400";
    if (packed >= total) return "bg-green-500";
    return "bg-amber-500";
  }

  const totals = useMemo(() => {
    const total = lines.reduce((s, l) => s + l.quantity, 0);
    const packed = allocations.reduce((s, a) => s + a.quantity, 0);
    return { total, packed, remaining: total - packed, pct: total ? Math.round((packed / total) * 100) : 0 };
  }, [lines, allocations]);

  const packLine = packLineId ? lines.find((l) => l.id === packLineId) ?? null : null;

  return (
    <AppShell
      title="שולחן אריזה"
      headerRight={
        selectedBatch && (
          <div className="flex items-center gap-2">
            <div className="bg-secondary px-3 py-1 rounded-md ring-1 ring-black/5 text-xs font-medium text-muted-foreground">{selectedBatch.wo}</div>
            <div className="bg-secondary px-3 py-1 rounded-md ring-1 ring-black/5 text-xs font-medium text-muted-foreground">{selectedBatch.batch}</div>
          </div>
        )
      }
    >
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Tree */}
        <aside className="w-64 border-l border-border bg-surface-muted flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text" placeholder="חיפוש משלוח / פק״ע / מק״ט..."
                className="w-full bg-card ring-1 ring-black/5 rounded-md pr-8 pl-3 py-1.5 text-sm outline-none focus:ring-brand-accent/30 transition-shadow"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {Array.from(tree.entries()).map(([deliv, wos]) => {
              const open = expandedDeliv[deliv] ?? false;
              const allLines = Array.from(wos.values()).flatMap((b) => Array.from(b.values()).flat());
              const p = progressOf(allLines);
              return (
                <div key={deliv} className="rounded-md">
                  <button onClick={() => setExpandedDeliv((s) => ({ ...s, [deliv]: !open }))}
                    className={`w-full text-right p-2 rounded-md transition-colors ${open ? "bg-secondary" : "hover:bg-secondary/50"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {open ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronLeft className="size-3 text-muted-foreground" />}
                        <span className="text-xs font-semibold">{deliv}</span>
                      </div>
                      <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full font-medium tabular-nums">{p.pct}%</span>
                    </div>
                  </button>
                  {open && (
                    <div className="pr-3 flex flex-col gap-0.5 border-r border-border mt-1 mr-2">
                      {Array.from(wos.entries()).map(([wo, batches]) => {
                        const woOpen = expandedWO[wo] ?? true;
                        const wLines = Array.from(batches.values()).flat();
                        const pw = progressOf(wLines);
                        return (
                          <div key={wo}>
                            <button onClick={() => setExpandedWO((s) => ({ ...s, [wo]: !woOpen }))} className="w-full text-right py-1 px-1 hover:bg-secondary/40 rounded">
                              <div className="flex items-center gap-2">
                                <div className={`size-1.5 rounded-full ${dotColor(pw.packed, pw.total)}`} />
                                <span className="text-xs font-medium text-foreground">{wo}</span>
                                <span className="mr-auto text-[10px] text-muted-foreground tabular-nums">{pw.packed}/{pw.total}</span>
                              </div>
                            </button>
                            {woOpen && (
                              <div className="pr-4 flex flex-col gap-0.5">
                                {Array.from(batches.entries()).map(([batch, bLines]) => {
                                  const pb = progressOf(bLines);
                                  const active = selectedBatch?.wo === wo && selectedBatch?.batch === batch;
                                  return (
                                    <button key={batch} onClick={() => setSelectedBatch({ wo, batch })}
                                      className={`text-right py-1 px-2 rounded text-xs flex items-center justify-between transition-colors ${active ? "bg-brand-accent/10 text-brand-accent font-medium" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"}`}>
                                      <span>{batch}</span>
                                      <span className="text-[10px] tabular-nums">{pb.packed}/{pb.total}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: Lines grid (primary workspace) */}
        <section className="flex-1 flex flex-col bg-card overflow-hidden min-w-0">
          <div className="p-4 flex items-center justify-between shrink-0 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold">שורות אריזה {selectedBatch && `— ${selectedBatch.wo} / ${selectedBatch.batch}`}</h2>
              {visibleLines[0] && <p className="text-xs text-muted-foreground mt-0.5">לקוח: <span className="text-foreground font-medium">{visibleLines[0].customerName}</span> · יעד: {visibleLines[0].destinationCountry}</p>}
            </div>
            <div className="text-xs text-muted-foreground">בחר שורה ולחץ <span className="font-semibold text-foreground">אריזה</span> כדי לפתוח חלון הקצאה</div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-right border-separate border-spacing-0">
              <thead className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--color-border)]">
                <tr className="text-xs font-medium text-muted-foreground">
                  <th className="py-3 px-4 font-medium w-2">סטטוס</th>
                  <th className="py-3 px-2 font-medium">מק״ט</th>
                  <th className="py-3 px-3 font-medium">תיאור</th>
                  <th className="py-3 px-3 font-medium">פק״ע</th>
                  <th className="py-3 px-3 font-medium">אצווה</th>
                  <th className="py-3 px-3 font-medium text-center">כמות מקורית</th>
                  <th className="py-3 px-3 font-medium text-center">נארז</th>
                  <th className="py-3 px-3 font-medium text-center">נותר</th>
                  <th className="py-3 px-3 font-medium text-center">סטטוס אריזה</th>
                  <th className="py-3 px-4 font-medium text-center w-28">פעולה</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {visibleLines.map((l) => {
                  const packed = getPackedForLine(allocations, l.id);
                  const remaining = l.quantity - packed;
                  const status = getLineStatus(l, packed);
                  const bar = status === "full" ? "bg-green-500" : status === "partial" ? "bg-amber-500" : "bg-red-400";
                  return (
                    <tr key={l.id} className="group transition-colors border-b border-border/60 hover:bg-surface-muted">
                      <td className="py-3 px-4"><span className={`block w-1.5 h-8 rounded-full ${bar}`} /></td>
                      <td className="py-3 px-2 font-mono text-[13px] font-semibold text-brand-accent whitespace-nowrap">{l.sku}</td>
                      <td className="py-3 px-3 text-pretty max-w-[40ch] font-medium text-foreground">{l.description}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{l.workOrder}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{l.batch}</td>
                      <td className="py-3 px-3 text-center tabular-nums">{l.quantity.toLocaleString()}</td>
                      <td className={`py-3 px-3 text-center tabular-nums font-semibold ${packed > 0 ? "text-cyan-700" : "text-zinc-400"}`}>{packed.toLocaleString()}</td>
                      <td className={`py-3 px-3 text-center tabular-nums ${remaining === 0 ? "text-zinc-400" : "text-amber-700 font-semibold"}`}>{remaining.toLocaleString()}</td>
                      <td className="py-3 px-3 text-center"><LineStatusBadge status={status} /></td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setPackLineId(l.id)}
                          disabled={remaining === 0}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-brand text-primary-foreground hover:bg-zinc-800 disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
                        >
                          <PackageCheck className="size-3.5" />
                          {remaining === 0 ? "הושלם" : "אריזה"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!visibleLines.length && (
                  <tr><td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">בחר אצווה מהעץ להצגת שורות</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right: secondary cartons panel */}
        <aside className="w-72 border-r border-border bg-surface-muted flex flex-col shrink-0">
          <div className="p-3 flex items-center justify-between border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">קרטונים <span className="font-normal">({cartons.length})</span></h2>
            <button onClick={() => createCarton()} className="size-7 bg-brand text-primary-foreground rounded-md flex items-center justify-center hover:bg-zinc-800 transition-colors" title="קרטון חדש">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {cartons.map((c) => {
              const items = allocations.filter((a) => a.cartonId === c.id);
              const qty = getCartonTotalQty(allocations, c.id);
              const skuCount = new Set(items.map((a) => a.lineId)).size;
              const missingWeight = !c.weight;
              const missingDims = !(c.length && c.width && c.height);
              return (
                <div key={c.id} className={`bg-card rounded-lg ring-1 p-3 flex flex-col gap-2 ${c.status === "closed" ? "opacity-70 ring-black/5" : "ring-black/5 hover:ring-black/10"} transition-shadow`}>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-muted-foreground tracking-wider">{c.number}</span>
                      <Link to="/cartons/$cartonId" params={{ cartonId: c.id }} className="text-xs font-semibold text-brand-accent hover:underline flex items-center gap-1">
                        פרטים <ExternalLink className="size-3" />
                      </Link>
                    </div>
                    <CartonStatusBadge status={c.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                    <div className="bg-surface-muted px-1.5 py-1 rounded">
                      <div className="text-muted-foreground">פריטים</div>
                      <div className="font-semibold tabular-nums text-foreground">{qty}</div>
                    </div>
                    <div className="bg-surface-muted px-1.5 py-1 rounded">
                      <div className="text-muted-foreground">מק״טים</div>
                      <div className="font-semibold tabular-nums text-foreground">{skuCount}</div>
                    </div>
                    <div className="bg-surface-muted px-1.5 py-1 rounded">
                      <div className="text-muted-foreground">משקל</div>
                      <div className="font-semibold tabular-nums text-foreground">{c.weight ? `${c.weight}` : "—"}</div>
                    </div>
                  </div>
                  {(missingWeight || missingDims) && c.status !== "closed" && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 ring-1 ring-amber-200/50 px-2 py-1 rounded">
                      <AlertTriangle className="size-3" />
                      {missingWeight && missingDims ? "חסר משקל וממדים" : missingWeight ? "חסר משקל" : "חסרים ממדים"}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    {c.status !== "closed" ? (
                      <button onClick={() => { if (confirm(`לסגור את ${c.number}?`)) setCartonStatus(c.id, "closed"); }} className="flex-1 text-[11px] bg-brand text-primary-foreground py-1 rounded font-medium hover:bg-zinc-800">סגור</button>
                    ) : (
                      <button onClick={() => setCartonStatus(c.id, "packing")} className="flex-1 text-[11px] bg-secondary text-foreground py-1 rounded font-medium hover:bg-zinc-200">פתח</button>
                    )}
                    {qty === 0 && (
                      <button onClick={() => { if (confirm(`למחוק את ${c.number}?`)) deleteCarton(c.id); }} className="size-6 grid place-items-center bg-secondary hover:bg-red-50 hover:text-destructive rounded transition-colors"><X className="size-3" /></button>
                    )}
                  </div>
                </div>
              );
            })}
            <button onClick={() => createCarton()} className="border-2 border-dashed border-border rounded-lg py-4 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-brand-accent hover:text-brand-accent transition-colors">
              <Package className="size-4" />
              <span className="text-[11px] font-medium">+ קרטון חדש</span>
            </button>
          </div>
        </aside>
      </div>

      <footer className="h-12 border-t border-border bg-card px-6 flex items-center gap-6 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">התקדמות אריזה כוללת:</span>
          <div className="w-48 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-brand-accent transition-all" style={{ width: `${totals.pct}%` }} />
          </div>
          <span className="font-semibold tabular-nums">{totals.pct}%</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-4 text-muted-foreground tabular-nums">
          <span>נארזו: <span className="text-foreground font-medium">{totals.packed.toLocaleString()}</span></span>
          <span>נותרו: <span className="text-foreground font-medium">{totals.remaining.toLocaleString()}</span></span>
          <span>סה״כ: <span className="text-foreground font-medium">{totals.total.toLocaleString()} יח׳</span></span>
        </div>
      </footer>

      {packLine && (
        <PackModal
          key={packLine.id}
          line={packLine}
          cartons={cartons}
          existingAllocs={allocations.filter((a) => a.lineId === packLine.id)}
          onClose={() => setPackLineId(null)}
          onCreateCarton={(num) => createCarton(num || undefined)}
          onAllocate={(cartonId, qty) => allocate(packLine.id, cartonId, qty)}
          onUpdateAlloc={updateAllocation}
          onRemoveAlloc={removeAllocation}
          onMoveAlloc={moveAllocation}
        />
      )}
    </AppShell>
  );
}

function nextDraftId() { return `D${Math.random().toString(36).slice(2, 8)}`; }

function PackModal({
  line, cartons, existingAllocs,
  onClose, onCreateCarton, onAllocate, onUpdateAlloc, onRemoveAlloc, onMoveAlloc,
}: {
  line: ShipmentLine;
  cartons: Carton[];
  existingAllocs: { id: string; cartonId: string; quantity: number }[];
  onClose: () => void;
  onCreateCarton: (number?: string) => Carton;
  onAllocate: (cartonId: string, qty: number) => void;
  onUpdateAlloc: (id: string, qty: number) => void;
  onRemoveAlloc: (id: string) => void;
  onMoveAlloc: (id: string, cartonId: string) => void;
}) {
  const packed = existingAllocs.reduce((s, a) => s + a.quantity, 0);
  const remaining = line.quantity - packed;
  const openCartons = cartons.filter((c) => c.status !== "closed");

  const [mode, setMode] = useState<"single" | "split">("single");
  const [drafts, setDrafts] = useState<Draft[]>([
    { id: nextDraftId(), cartonId: openCartons[0]?.id ?? "__new__", quantity: remaining },
  ]);

  // suggest next carton number for newly created
  const nextSuggested = useMemo(() => {
    const nums = cartons.map((c) => {
      const m = c.number.match(/(\d+)/);
      return m ? Number(m[1]) : 0;
    });
    const max = Math.max(0, ...nums);
    return `CARTON-${String(max + 1).padStart(3, "0")}`;
  }, [cartons]);

  const allocatedTotal = drafts.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
  const remainingToAllocate = remaining - allocatedTotal;
  const valid = allocatedTotal > 0 && allocatedTotal <= remaining && drafts.every((d) => d.quantity > 0 && (d.cartonId !== "" || d.cartonId === "__new__"));

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function addRow() {
    setDrafts((ds) => [...ds, { id: nextDraftId(), cartonId: "__new__", quantity: Math.max(0, remaining - ds.reduce((s, d) => s + d.quantity, 0)) }]);
  }
  function removeRow(id: string) {
    setDrafts((ds) => (ds.length === 1 ? ds : ds.filter((d) => d.id !== id)));
  }

  function confirm() {
    const rows = mode === "single" ? drafts.slice(0, 1) : drafts;
    for (const d of rows) {
      if (d.quantity <= 0) continue;
      let cartonId = d.cartonId;
      if (cartonId === "__new__") {
        const c = onCreateCarton(d.newNumber?.trim() || undefined);
        cartonId = c.id;
      }
      onAllocate(cartonId, d.quantity);
    }
    onClose();
  }

  // when switching to single, collapse
  function switchMode(m: "single" | "split") {
    setMode(m);
    if (m === "single") {
      setDrafts((ds) => [{ ...(ds[0] ?? { id: nextDraftId(), cartonId: openCartons[0]?.id ?? "__new__", quantity: remaining }), quantity: remaining }]);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} dir="rtl" className="bg-card rounded-xl ring-1 ring-black/10 w-full max-w-2xl flex flex-col shadow-xl max-h-[90vh]">
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-bold">Pack Item — אריזת פריט</div>
            <h3 className="text-lg font-semibold mt-1">{line.sku}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{line.description}</p>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center hover:bg-secondary rounded"><X className="size-4" /></button>
        </div>

        <div className="grid grid-cols-4 gap-2 px-5 pt-4">
          <Stat label="פק״ע" value={line.workOrder} mono />
          <Stat label="אצווה" value={line.batch} mono />
          <Stat label="כמות מקורית" value={line.quantity.toLocaleString()} />
          <Stat label="נותר לאריזה" value={remaining.toLocaleString()} highlight />
        </div>

        <div className="px-5 pt-4">
          <div className="inline-flex bg-secondary rounded-md p-0.5">
            <button onClick={() => switchMode("single")} className={`px-3 py-1.5 text-xs font-medium rounded ${mode === "single" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
              קרטון יחיד
            </button>
            <button onClick={() => switchMode("split")} className={`px-3 py-1.5 text-xs font-medium rounded ${mode === "split" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
              פיצול בין קרטונים
            </button>
          </div>
        </div>

        <div className="px-5 pt-3 pb-2 overflow-y-auto flex flex-col gap-2">
          {(mode === "single" ? drafts.slice(0, 1) : drafts).map((d, idx) => (
            <DraftRow
              key={d.id}
              index={idx}
              draft={d}
              cartons={openCartons}
              nextSuggested={nextSuggested}
              onChange={(p) => updateDraft(d.id, p)}
              onRemove={mode === "split" && drafts.length > 1 ? () => removeRow(d.id) : undefined}
              maxQty={remaining}
            />
          ))}

          {mode === "split" && (
            <div className="flex gap-2 pt-1">
              <button onClick={addRow} className="flex-1 text-xs py-2 border border-dashed border-border rounded-md hover:border-brand-accent hover:text-brand-accent text-muted-foreground transition-colors">
                + הוסף הקצאה לקרטון
              </button>
            </div>
          )}

          {existingAllocs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">הקצאות קיימות לשורה זו</div>
              <div className="flex flex-col gap-1.5">
                {existingAllocs.map((a) => {
                  const c = cartons.find((cc) => cc.id === a.cartonId);
                  return (
                    <div key={a.id} className="flex items-center gap-2 bg-surface-muted rounded-md px-3 py-2 text-sm">
                      <span className="font-mono text-xs text-brand-accent flex-1">{c?.number ?? "—"}</span>
                      <input type="number" min={1} value={a.quantity}
                        onChange={(e) => onUpdateAlloc(a.id, Math.max(0, Number(e.target.value)))}
                        className="w-20 bg-card ring-1 ring-border rounded px-2 py-1 text-sm tabular-nums text-center outline-none focus:ring-brand-accent"
                      />
                      <select value={a.cartonId} onChange={(e) => onMoveAlloc(a.id, e.target.value)}
                        className="bg-card ring-1 ring-border rounded px-2 py-1 text-xs outline-none focus:ring-brand-accent">
                        {openCartons.map((cc) => <option key={cc.id} value={cc.id}>העבר → {cc.number}</option>)}
                      </select>
                      <button onClick={() => onRemoveAlloc(a.id)} title="הסר מקרטון" className="size-7 grid place-items-center hover:bg-red-50 hover:text-destructive rounded transition-colors">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-3 bg-surface-muted/40 rounded-b-xl">
          {mode === "split" ? (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">הוקצה: <span className="text-foreground font-semibold tabular-nums">{allocatedTotal.toLocaleString()}</span></span>
              <span className={`font-semibold tabular-nums ${remainingToAllocate < 0 ? "text-destructive" : remainingToAllocate === 0 ? "text-green-700" : "text-amber-700"}`}>
                נותר להקצות: {remainingToAllocate.toLocaleString()}
              </span>
            </div>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-zinc-200">ביטול</button>
            <button onClick={confirm} disabled={!valid}
              className="px-5 py-2 bg-brand text-primary-foreground rounded-md text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1.5">
              <PackageCheck className="size-4" /> אשר אריזה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${highlight ? "bg-cyan-50/60 ring-cyan-200/60" : "bg-surface-muted ring-black/5"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${mono ? "font-mono" : ""} ${highlight ? "text-cyan-700" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function DraftRow({
  index, draft, cartons, nextSuggested, onChange, onRemove, maxQty,
}: {
  index: number;
  draft: Draft;
  cartons: Carton[];
  nextSuggested: string;
  onChange: (patch: Partial<Draft>) => void;
  onRemove?: () => void;
  maxQty: number;
}) {
  const isNew = draft.cartonId === "__new__";
  return (
    <div className="bg-card ring-1 ring-black/5 rounded-md p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="size-6 grid place-items-center rounded bg-secondary text-[11px] font-bold text-muted-foreground">{index + 1}</div>
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">קרטון</label>
          <select value={draft.cartonId} onChange={(e) => onChange({ cartonId: e.target.value })}
            className="w-full bg-card ring-1 ring-border rounded px-2 py-1.5 text-sm outline-none focus:ring-brand-accent">
            {cartons.map((c) => <option key={c.id} value={c.id}>{c.number} {c.status === "packing" ? "· באריזה" : ""}</option>)}
            <option value="__new__">+ צור קרטון חדש</option>
          </select>
        </div>
        <div className="w-32">
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">כמות</label>
          <input type="number" min={1} max={maxQty} value={draft.quantity}
            onChange={(e) => onChange({ quantity: Math.max(0, Number(e.target.value)) })}
            className="w-full bg-card ring-1 ring-border rounded px-2 py-1.5 text-sm font-semibold tabular-nums text-center outline-none focus:ring-brand-accent"
          />
        </div>
        {onRemove && (
          <button onClick={onRemove} title="הסר שורה" className="self-end size-8 grid place-items-center hover:bg-red-50 hover:text-destructive rounded transition-colors">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {isNew && (
        <div className="flex items-center gap-2 pr-8">
          <MoveRight className="size-3.5 text-muted-foreground" />
          <label className="text-[11px] text-muted-foreground">מס׳ קרטון:</label>
          <input type="text" value={draft.newNumber ?? nextSuggested}
            onChange={(e) => onChange({ newNumber: e.target.value })}
            className="flex-1 bg-card ring-1 ring-border rounded px-2 py-1 text-xs font-mono outline-none focus:ring-brand-accent" />
          <span className="text-[10px] text-muted-foreground">משקל וממדים יוזנו מאוחר יותר</span>
        </div>
      )}
    </div>
  );
}