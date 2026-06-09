import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Plus, Search, Package, X, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CartonStatusBadge, LineStatusBadge } from "@/components/StatusBadge";
import { getCartonTotalQty, getLineStatus, getPackedForLine, useStore } from "@/lib/store";
import type { Carton, ShipmentLine } from "@/lib/types";

export const Route = createFileRoute("/packing")({
  head: () => ({ meta: [{ title: "שולחן אריזה — Packing Control Center" }, { name: "description", content: "שולחן עבודה לאריזת משלוחים — עץ פק״ע, שורות אריזה וקרטונים" }] }),
  component: PackingWorkspace,
});

function PackingWorkspace() {
  const { lines, cartons, allocations, createCarton, allocate, setCartonStatus, deleteCarton } = useStore();

  const [search, setSearch] = useState("");
  const [expandedDeliv, setExpandedDeliv] = useState<Record<string, boolean>>({});
  const [expandedWO, setExpandedWO] = useState<Record<string, boolean>>({});
  const [selectedBatch, setSelectedBatch] = useState<{ wo: string; batch: string } | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dragOverCarton, setDragOverCarton] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<{ lineId: string; cartonId: string } | null>(null);
  const [assignQty, setAssignQty] = useState(0);

  // Tree structure
  const tree = useMemo(() => {
    const filtered = lines.filter((l) =>
      !search ||
      l.deliveryNumber.includes(search) || l.workOrder.includes(search) ||
      l.batch.includes(search) || l.sku.includes(search) || l.customerName.includes(search)
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

  // Default open first delivery
  useState(() => {
    const first = lines[0];
    if (first) {
      setExpandedDeliv({ [first.deliveryNumber]: true });
      setExpandedWO({ [first.workOrder]: true });
      setSelectedBatch({ wo: first.workOrder, batch: first.batch });
    }
  });

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
    if (packed === 0) return "bg-zinc-300";
    if (packed >= total) return "bg-green-500";
    return "bg-amber-500";
  }

  function toggleLineSelect(id: string) {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function onDropOnCarton(carton: Carton) {
    setDragOverCarton(null);
    const lineId = draggingLineId;
    setDraggingLineId(null);
    if (!lineId || carton.status === "closed") return;
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    const remaining = line.quantity - getPackedForLine(allocations, lineId);
    setAssignFor({ lineId, cartonId: carton.id });
    setAssignQty(remaining);
  }

  function confirmAssign() {
    if (!assignFor || assignQty <= 0) return setAssignFor(null);
    allocate(assignFor.lineId, assignFor.cartonId, assignQty);
    setAssignFor(null);
    setSelectedLineIds(new Set());
  }

  const assignLine = assignFor ? lines.find((l) => l.id === assignFor.lineId) : null;
  const assignCarton = assignFor ? cartons.find((c) => c.id === assignFor.cartonId) : null;
  const assignRemaining = assignLine ? assignLine.quantity - getPackedForLine(allocations, assignLine.id) : 0;

  const totals = useMemo(() => {
    const total = lines.reduce((s, l) => s + l.quantity, 0);
    const packed = allocations.reduce((s, a) => s + a.quantity, 0);
    return { total, packed, remaining: total - packed, pct: total ? Math.round((packed / total) * 100) : 0 };
  }, [lines, allocations]);

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
        {/* Left: Shipment Tree */}
        <aside className="w-72 border-l border-border bg-surface-muted flex flex-col shrink-0">
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
                  <button
                    onClick={() => setExpandedDeliv((s) => ({ ...s, [deliv]: !open }))}
                    className={`w-full text-right p-2 rounded-md transition-colors ${open ? "bg-secondary" : "hover:bg-secondary/50"}`}
                  >
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
                                    <button
                                      key={batch}
                                      onClick={() => setSelectedBatch({ wo, batch })}
                                      className={`text-right py-1 px-2 rounded text-xs flex items-center justify-between transition-colors ${active ? "bg-brand-accent/10 text-brand-accent font-medium" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"}`}
                                    >
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

        {/* Center: Lines Grid */}
        <section className="flex-1 flex flex-col bg-card overflow-hidden min-w-0">
          <div className="p-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-sm font-semibold">שורות אריזה {selectedBatch && `— ${selectedBatch.wo} / ${selectedBatch.batch}`}</h2>
              {visibleLines[0] && <p className="text-xs text-muted-foreground mt-0.5">לקוח: <span className="text-foreground font-medium">{visibleLines[0].customerName}</span> · יעד: {visibleLines[0].destinationCountry}</p>}
            </div>
            <div className="text-xs text-muted-foreground">{selectedLineIds.size > 0 ? `${selectedLineIds.size} שורות נבחרו · גרור לקרטון` : "טיפ: גרור שורה לקרטון להקצאה"}</div>
          </div>
          <div className="flex-1 overflow-auto px-4">
            <table className="w-full text-right border-separate border-spacing-0">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-xs font-medium text-muted-foreground border-b border-border">
                  <th className="py-3 pr-2 w-8"></th>
                  <th className="py-3 px-2 font-medium">מק״ט</th>
                  <th className="py-3 px-3 font-medium">תיאור</th>
                  <th className="py-3 px-3 font-medium text-center">כמות</th>
                  <th className="py-3 px-3 font-medium text-center">נארז</th>
                  <th className="py-3 px-3 font-medium text-center">נותר</th>
                  <th className="py-3 pl-2 font-medium text-left">סטטוס</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {visibleLines.map((l) => {
                  const packed = getPackedForLine(allocations, l.id);
                  const remaining = l.quantity - packed;
                  const status = getLineStatus(l, packed);
                  const selected = selectedLineIds.has(l.id);
                  return (
                    <tr
                      key={l.id}
                      draggable={status !== "full"}
                      onDragStart={() => setDraggingLineId(l.id)}
                      onDragEnd={() => setDraggingLineId(null)}
                      className={`group transition-colors border-b border-border/50 cursor-grab active:cursor-grabbing ${selected ? "bg-cyan-50/40" : "hover:bg-surface-muted"}`}
                    >
                      <td className="py-3 pr-2"><input type="checkbox" checked={selected} onChange={() => toggleLineSelect(l.id)} className="rounded border-border" /></td>
                      <td className="py-3 px-2 font-mono text-xs text-brand-accent">{l.sku}</td>
                      <td className="py-3 px-3 text-pretty max-w-[44ch]">{l.description}</td>
                      <td className="py-3 px-3 text-center tabular-nums">{l.quantity.toLocaleString()}</td>
                      <td className={`py-3 px-3 text-center tabular-nums font-semibold ${packed > 0 ? "text-cyan-700" : "text-zinc-400"}`}>{packed.toLocaleString()}</td>
                      <td className={`py-3 px-3 text-center tabular-nums ${remaining === 0 ? "text-zinc-400" : "text-amber-700 font-medium"}`}>{remaining.toLocaleString()}</td>
                      <td className="py-3 pl-2 text-left"><LineStatusBadge status={status} /></td>
                    </tr>
                  );
                })}
                {!visibleLines.length && (
                  <tr><td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">בחר אצווה מהעץ להצגת שורות</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right: Cartons */}
        <aside className="w-80 border-r border-border bg-surface-muted flex flex-col shrink-0">
          <div className="p-4 flex items-center justify-between border-b border-border">
            <h2 className="text-sm font-semibold">קרטונים <span className="text-muted-foreground font-normal">({cartons.length})</span></h2>
            <button onClick={() => createCarton()} className="size-8 bg-brand text-primary-foreground rounded-md flex items-center justify-center hover:bg-zinc-800 transition-colors" title="קרטון חדש">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {cartons.map((c) => {
              const items = allocations.filter((a) => a.cartonId === c.id);
              const qty = getCartonTotalQty(allocations, c.id);
              const dragOver = dragOverCarton === c.id;
              return (
                <div
                  key={c.id}
                  onDragOver={(e) => { e.preventDefault(); setDragOverCarton(c.id); }}
                  onDragLeave={() => setDragOverCarton(null)}
                  onDrop={() => onDropOnCarton(c)}
                  className={`bg-card rounded-xl ring-1 p-4 flex flex-col gap-3 transition-all ${dragOver ? "ring-2 ring-brand-accent scale-[1.02]" : "ring-black/5 hover:ring-black/10"} ${c.status === "closed" ? "opacity-70" : ""}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">{c.number}</span>
                      <Link to="/cartons/$cartonId" params={{ cartonId: c.id }} className="text-sm font-semibold text-brand-accent hover:underline flex items-center gap-1">
                        פרטים <ExternalLink className="size-3" />
                      </Link>
                    </div>
                    <CartonStatusBadge status={c.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-surface-muted p-2 rounded-md">
                      <div className="text-muted-foreground">משקל ק״ג</div>
                      <div className="text-foreground font-medium tabular-nums">{c.weight?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div className="bg-surface-muted p-2 rounded-md">
                      <div className="text-muted-foreground">פריטים</div>
                      <div className="text-foreground font-medium tabular-nums">{qty.toLocaleString()} ב-{items.length}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground italic">
                    {c.length && c.width && c.height ? `ממדים: ${c.length}×${c.width}×${c.height} ס״מ` : "ממדים לא הוגדרו"}
                  </div>
                  <div className="flex gap-2 pt-1">
                    {c.status !== "closed" ? (
                      <button onClick={() => { if (confirm(`לסגור את ${c.number}?`)) setCartonStatus(c.id, "closed"); }} className="flex-1 text-xs bg-brand text-primary-foreground py-1.5 rounded font-medium hover:bg-zinc-800">סגור קרטון</button>
                    ) : (
                      <button onClick={() => setCartonStatus(c.id, "packing")} className="flex-1 text-xs bg-secondary text-foreground py-1.5 rounded font-medium hover:bg-zinc-200">פתח מחדש</button>
                    )}
                    <button onClick={() => { if (confirm(`למחוק את ${c.number}?`)) deleteCarton(c.id); }} className="size-7 grid place-items-center bg-secondary hover:bg-red-50 hover:text-destructive rounded transition-colors"><X className="size-3.5" /></button>
                  </div>
                </div>
              );
            })}
            <button onClick={() => createCarton()} className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-brand-accent hover:text-brand-accent transition-colors">
              <Package className="size-5" />
              <span className="text-xs font-medium">+ קרטון חדש</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Footer progress */}
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

      {/* Assignment modal */}
      {assignFor && assignLine && assignCarton && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAssignFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-xl ring-1 ring-black/10 w-full max-w-md p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">הקצאת כמות לקרטון</div>
                <h3 className="text-lg font-semibold mt-1">{assignCarton.number}</h3>
              </div>
              <button onClick={() => setAssignFor(null)} className="size-7 grid place-items-center hover:bg-secondary rounded"><X className="size-4" /></button>
            </div>
            <div className="bg-surface-muted rounded-lg p-3 flex flex-col gap-1.5">
              <div className="font-mono text-sm text-brand-accent">{assignLine.sku}</div>
              <div className="text-sm">{assignLine.description}</div>
              <div className="text-xs text-muted-foreground tabular-nums">זמין לאריזה: <span className="font-semibold text-foreground">{assignRemaining.toLocaleString()}</span> {assignLine.unit}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">כמות לאריזה</label>
              <input
                type="number" min={1} max={assignRemaining} value={assignQty}
                onChange={(e) => setAssignQty(Math.max(0, Math.min(assignRemaining, Number(e.target.value))))}
                autoFocus
                className="w-full mt-1 bg-card ring-1 ring-border rounded-md px-3 py-2 text-lg font-semibold tabular-nums outline-none focus:ring-brand-accent"
              />
              <div className="flex gap-1.5 mt-2">
                {[25, 50, 75, 100].map((p) => (
                  <button key={p} onClick={() => setAssignQty(Math.floor((assignRemaining * p) / 100))} className="flex-1 text-[11px] py-1 bg-secondary hover:bg-zinc-200 rounded">{p}%</button>
                ))}
                <button onClick={() => setAssignQty(assignRemaining)} className="flex-1 text-[11px] py-1 bg-secondary hover:bg-zinc-200 rounded">הכל</button>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setAssignFor(null)} className="flex-1 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-zinc-200">ביטול</button>
              <button onClick={confirmAssign} disabled={assignQty <= 0} className="flex-1 py-2 bg-brand text-primary-foreground rounded-md text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50">אשר הקצאה</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}