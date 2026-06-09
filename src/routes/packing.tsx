import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Plus,
  Search,
  Package,
  X,
  ExternalLink,
  AlertTriangle,
  Trash2,
  MoveRight,
  PackageCheck,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CartonStatusBadge } from "@/components/StatusBadge";
import { getCartonTotalQty, getLineStatus, getPackedForLine, useStore } from "@/lib/store";
import type { Carton, ShipmentLine } from "@/lib/types";

export const Route = createFileRoute("/packing")({
  head: () => ({
    meta: [
      { title: "שולחן אריזה — Packing Control Center" },
      { name: "description", content: "שולחן עבודה לאריזת משלוחים ברמת שורת מוצר" },
    ],
  }),
  component: PackingWorkspace,
});

type Draft = { id: string; cartonId: string | "__new__"; quantity: number; newNumber?: string };
type SortMode = "status" | "wo" | "sku";

function PackingWorkspace() {
  const {
    lines, cartons, allocations,
    createCarton, allocate, updateAllocation, removeAllocation, moveAllocation, setCartonStatus, deleteCarton,
  } = useStore();

  // ── search
  const [woSearch, setWoSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [descSearch, setDescSearch] = useState("");

  // ── view controls
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const [groupByWo, setGroupByWo] = useState(false);
  const [showCartons, setShowCartons] = useState(false);

  // ── pack modal
  const [packLineId, setPackLineId] = useState<string | null>(null);

  // ── keyboard navigation
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  // ── quick-pack: active carton target
  const [activeCartonId, setActiveCartonId] = useState<string | null>(null);
  const openCartons = useMemo(() => cartons.filter((c) => c.status !== "closed"), [cartons]);

  // Auto-select single open carton; clear if it gets closed
  useEffect(() => {
    setActiveCartonId((cur) => {
      const stillOpen = openCartons.find((c) => c.id === cur);
      if (cur && !stillOpen) return null;
      if (!cur && openCartons.length === 1) return openCartons[0].id;
      return cur;
    });
  }, [openCartons]);

  // ── performance: O(M) allocation map instead of O(N×M) per-line scans
  const packedByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations) m.set(a.lineId, (m.get(a.lineId) ?? 0) + a.quantity);
    return m;
  }, [allocations]);

  // ── filter
  const filteredLines = useMemo(() => {
    const wo = woSearch.trim();
    const sku = skuSearch.trim().toLowerCase();
    const desc = descSearch.trim();
    if (!wo && !sku && !desc) return lines;
    return lines.filter((l) => {
      if (wo && !l.workOrder.includes(wo)) return false;
      if (sku && !l.sku.toLowerCase().includes(sku)) return false;
      if (desc && !l.description.includes(desc)) return false;
      return true;
    });
  }, [lines, woSearch, skuSearch, descSearch]);

  // ── sort
  const sortedLines = useMemo(() => {
    const arr = [...filteredLines];
    if (sortMode === "status") {
      const order: Record<string, number> = { none: 0, partial: 1, full: 2 };
      arr.sort(
        (a, b) =>
          order[getLineStatus(a, packedByLine.get(a.id) ?? 0)] -
          order[getLineStatus(b, packedByLine.get(b.id) ?? 0)],
      );
    } else if (sortMode === "wo") {
      arr.sort((a, b) => a.workOrder.localeCompare(b.workOrder, "he"));
    } else {
      arr.sort((a, b) => a.sku.localeCompare(b.sku));
    }
    return arr;
  }, [filteredLines, sortMode, packedByLine]);

  // ── WO groups (only when groupByWo is on)
  const woGroups = useMemo(() => {
    if (!groupByWo) return null;
    const map = new Map<string, ShipmentLine[]>();
    for (const l of sortedLines) {
      const arr = map.get(l.workOrder) ?? [];
      arr.push(l);
      map.set(l.workOrder, arr);
    }
    // Sort groups: most incomplete first
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const pctA = a.reduce((s, l) => s + (packedByLine.get(l.id) ?? 0), 0) / a.reduce((s, l) => s + l.quantity, 0);
      const pctB = b.reduce((s, l) => s + (packedByLine.get(l.id) ?? 0), 0) / b.reduce((s, l) => s + l.quantity, 0);
      return (isNaN(pctA) ? 0 : pctA) - (isNaN(pctB) ? 0 : pctB);
    });
  }, [groupByWo, sortedLines, packedByLine]);

  // ── overall progress
  const progress = useMemo(() => {
    const totalLines = lines.length;
    const packedLines = lines.filter((l) => getLineStatus(l, packedByLine.get(l.id) ?? 0) === "full").length;
    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
    const packedQty = Array.from(packedByLine.values()).reduce((s, v) => s + v, 0);
    return {
      totalLines, packedLines,
      remainingLines: totalLines - packedLines,
      totalQty, packedQty,
      remainingQty: totalQty - packedQty,
      pct: totalQty ? Math.round((packedQty / totalQty) * 100) : 0,
    };
  }, [lines, packedByLine]);

  const hasFilter = woSearch || skuSearch || descSearch;
  const packLine = packLineId ? lines.find((l) => l.id === packLineId) ?? null : null;
  const activeCarton = activeCartonId ? cartons.find((c) => c.id === activeCartonId) : null;

  // ── flat navigable list (follows current sort/group order)
  const flatRows = useMemo(
    () => (woGroups ? woGroups.flatMap(([, ls]) => ls.slice().sort((a, b) => {
      const o: Record<string, number> = { none: 0, partial: 1, full: 2 };
      return o[getLineStatus(a, packedByLine.get(a.id) ?? 0)] - o[getLineStatus(b, packedByLine.get(b.id) ?? 0)];
    })) : sortedLines),
    [woGroups, sortedLines, packedByLine],
  );

  // Auto-select first row when filter is active and current selection is gone
  useEffect(() => {
    if (!hasFilter) { setSelectedLineId(null); return; }
    if (flatRows.length === 0) { setSelectedLineId(null); return; }
    if (!flatRows.find((l) => l.id === selectedLineId)) setSelectedLineId(flatRows[0].id);
  }, [flatRows, hasFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll selected row into view
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedLineId]);

  function navigateRow(delta: number) {
    const idx = flatRows.findIndex((l) => l.id === selectedLineId);
    const newIdx = Math.max(0, Math.min(flatRows.length - 1, idx < 0 ? 0 : idx + delta));
    setSelectedLineId(flatRows[newIdx]?.id ?? null);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { clearSearch(); e.preventDefault(); return; }
    if (e.key === "ArrowDown") { navigateRow(1); e.preventDefault(); return; }
    if (e.key === "ArrowUp") { navigateRow(-1); e.preventDefault(); return; }
    if (e.key === "Enter" && selectedLineId) {
      const line = flatRows.find((l) => l.id === selectedLineId);
      if (line) { activeCartonId ? quickPack(line) : setPackLineId(line.id); }
      e.preventDefault();
    }
  }

  function clearSearch() {
    setWoSearch("");
    setSkuSearch("");
    setDescSearch("");
  }

  function quickPack(line: ShipmentLine) {
    if (!activeCartonId) return;
    const packed = packedByLine.get(line.id) ?? 0;
    const remaining = line.quantity - packed;
    if (remaining <= 0) return;
    allocate(line.id, activeCartonId, remaining);
  }

  function renderLine(l: ShipmentLine) {
    const packed = packedByLine.get(l.id) ?? 0;
    const remaining = l.quantity - packed;
    const status = getLineStatus(l, packed);
    const isSelected = l.id === selectedLineId;
    const rowBg = isSelected
      ? "bg-brand-accent/8 ring-1 ring-inset ring-brand-accent/30"
      : status === "full" ? "bg-green-50/50" : status === "partial" ? "bg-amber-50/40" : "";
    const barColor =
      status === "full" ? "bg-green-500" : status === "partial" ? "bg-amber-500" : "bg-red-400";

    return (
      <tr
        key={l.id}
        ref={isSelected ? selectedRowRef : null}
        onClick={() => setSelectedLineId(l.id)}
        className={`group border-b border-border/60 hover:bg-secondary/30 transition-colors cursor-pointer ${rowBg}`}
      >
        {/* Action */}
        <td className="py-3 px-4 text-center">
          {remaining > 0 ? (
            <div className="flex items-center gap-1 justify-center">
              <button
                onClick={() => (activeCartonId ? quickPack(l) : setPackLineId(l.id))}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  activeCartonId
                    ? "bg-brand-accent text-white hover:bg-cyan-700"
                    : "bg-brand text-primary-foreground hover:bg-zinc-800"
                }`}
              >
                {activeCartonId ? <Zap className="size-3.5" /> : <PackageCheck className="size-3.5" />}
                אריזה
              </button>
              {/* When quick-pack active, show modal fallback button */}
              {activeCartonId && (
                <button
                  onClick={() => setPackLineId(l.id)}
                  title="פתח חלון אריזה"
                  className="size-7 grid place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <PackageCheck className="size-3.5" />
                </button>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-green-700 bg-green-100/60">
              <CheckCircle2 className="size-3.5" />
              הושלם
            </span>
          )}
        </td>
        {/* Status bar */}
        <td className="py-3 px-3">
          <span className={`block w-2 h-8 rounded-full ${barColor}`} />
        </td>
        {/* SKU */}
        <td className="py-3 px-2 font-mono text-[13px] font-semibold text-brand-accent whitespace-nowrap">{l.sku}</td>
        {/* Description */}
        <td className="py-3 px-3 text-pretty max-w-[38ch] font-medium text-foreground">{l.description}</td>
        {/* Work Order */}
        <td className="py-3 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{l.workOrder}</td>
        {/* Batch */}
        <td className="py-3 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{l.batch}</td>
        {/* Original qty */}
        <td className="py-3 px-3 text-center tabular-nums text-muted-foreground">{l.quantity.toLocaleString()}</td>
        {/* Packed */}
        <td className={`py-3 px-3 text-center tabular-nums font-semibold ${packed > 0 ? "text-green-700" : "text-zinc-400"}`}>
          {packed.toLocaleString()}
        </td>
        {/* Remaining */}
        <td className={`py-3 px-3 text-center tabular-nums font-semibold ${remaining === 0 ? "text-zinc-400" : "text-amber-700"}`}>
          {remaining.toLocaleString()}
        </td>
      </tr>
    );
  }

  return (
    <AppShell
      title="שולחן אריזה"
      headerRight={
        <button
          onClick={() => setShowCartons((s) => !s)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ring-1 transition-colors ${
            showCartons
              ? "bg-brand text-primary-foreground ring-brand"
              : "bg-secondary ring-black/5 hover:bg-zinc-200"
          }`}
        >
          <Package className="size-3.5" />
          קרטונים ({cartons.length})
        </button>
      }
    >
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Main workspace ── */}
        <section className="flex-1 flex flex-col overflow-hidden min-w-0 bg-card">

          {/* Search bar */}
          <div className="px-4 py-3 border-b border-border shrink-0 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                value={woSearch}
                onChange={(e) => setWoSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder='חיפוש פקודת עבודה (פק"ע)...'
                className="w-full bg-secondary/60 ring-1 ring-black/5 rounded-lg pr-10 pl-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-accent/40 focus:bg-card transition-shadow"
              />
            </div>
            <div className="relative w-44">
              <input
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder='מק"ט...'
                className="w-full bg-secondary/60 ring-1 ring-black/5 rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-accent/40 focus:bg-card transition-shadow"
              />
            </div>
            <div className="relative w-52">
              <input
                value={descSearch}
                onChange={(e) => setDescSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="תיאור פריט..."
                className="w-full bg-secondary/60 ring-1 ring-black/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-accent/40 focus:bg-card transition-shadow"
              />
            </div>
            {hasFilter && (
              <button
                onClick={clearSearch}
                className="size-9 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="נקה חיפוש (Esc)"
              >
                <X className="size-4" />
              </button>
            )}
            {/* Keyboard hint — only when filter active and results exist */}
            {hasFilter && flatRows.length > 0 && (
              <div className="text-[10px] text-muted-foreground/70 shrink-0 leading-tight tabular-nums hidden lg:block">
                ↑↓ ניווט<br />Enter אריזה<br />Esc ניקוי
              </div>
            )}
          </div>

          {/* Controls row */}
          <div className="px-4 py-2 border-b border-border bg-secondary/20 shrink-0 flex items-center gap-4 flex-wrap">

            {/* Sort */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold ml-2 shrink-0">מיון:</span>
              {(["status", "wo", "sku"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSortMode(m)}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                    sortMode === m
                      ? "bg-card ring-1 ring-black/10 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {m === "status" ? "סטטוס" : m === "wo" ? 'פק"ע' : 'מק"ט'}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border shrink-0" />

            {/* Group by WO */}
            <button
              onClick={() => setGroupByWo((s) => !s)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                groupByWo
                  ? "bg-brand text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-zinc-200"
              }`}
            >
              קיבוץ לפי פק"ע
            </button>

            <div className="h-4 w-px bg-border shrink-0" />

            {/* Quick-pack carton selector */}
            <div className="flex items-center gap-2">
              <Zap className={`size-3.5 shrink-0 ${activeCartonId ? "text-brand-accent" : "text-muted-foreground"}`} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold shrink-0">קרטון יעד:</span>
              {openCartons.length > 0 ? (
                <select
                  value={activeCartonId ?? ""}
                  onChange={(e) => setActiveCartonId(e.target.value || null)}
                  className="text-xs bg-card ring-1 ring-black/5 rounded px-2 py-1 outline-none focus:ring-brand-accent cursor-pointer"
                >
                  <option value="">— ללא (פתח חלון) —</option>
                  {openCartons.map((c) => (
                    <option key={c.id} value={c.id}>{c.number}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted-foreground italic">אין קרטונים פתוחים</span>
              )}
              {activeCarton && (
                <span className="text-[10px] bg-brand-accent/10 text-brand-accent px-2 py-0.5 rounded-full ring-1 ring-brand-accent/20 font-medium whitespace-nowrap shrink-0">
                  ⚡ אריזה מהירה אל {activeCarton.number}
                </span>
              )}
            </div>

            {/* Result count — pushed right */}
            <div className="mr-auto text-[11px] text-muted-foreground tabular-nums">
              {hasFilter
                ? `${filteredLines.length.toLocaleString()} / ${lines.length.toLocaleString()} שורות`
                : `${lines.length.toLocaleString()} שורות`}
            </div>
          </div>

          {/* Progress header */}
          <div className="px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="min-w-[100px]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">שורות ארוזות</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums text-green-700">{progress.packedLines.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">/ {progress.totalLines.toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{progress.remainingLines.toLocaleString()} נותרו</div>
              </div>
              <div className="h-12 w-px bg-border shrink-0" />
              <div className="min-w-[130px]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">כמות ארוזה</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums text-green-700">{progress.packedQty.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">/ {progress.totalQty.toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{progress.remainingQty.toLocaleString()} יח׳ נותרו</div>
              </div>
              <div className="h-12 w-px bg-border shrink-0" />
              <div className="flex items-center gap-4 flex-1 min-w-[200px]">
                <div className="text-3xl font-bold tabular-nums text-brand-accent shrink-0">{progress.pct}%</div>
                <div className="flex-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                    <span className="font-semibold">התקדמות אריזה</span>
                    {progress.pct === 100 && (
                      <span className="text-green-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> הושלם
                      </span>
                    )}
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progress.pct === 100 ? "bg-green-500" : "bg-brand-accent"}`}
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-right border-separate border-spacing-0">
              <thead className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--color-border)]">
                <tr className="text-xs font-medium text-muted-foreground">
                  <th className="py-3 px-4 font-medium text-center w-32">פעולה</th>
                  <th className="py-3 px-3 font-medium w-3"></th>
                  <th className="py-3 px-2 font-medium">מק״ט</th>
                  <th className="py-3 px-3 font-medium">תיאור</th>
                  <th className="py-3 px-3 font-medium">פק״ע</th>
                  <th className="py-3 px-3 font-medium">אצווה</th>
                  <th className="py-3 px-3 font-medium text-center">כמות מקורית</th>
                  <th className="py-3 px-3 font-medium text-center">נארז</th>
                  <th className="py-3 px-3 font-medium text-center">נותר</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {!filteredLines.length ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">
                      {lines.length === 0
                        ? "אין שורות בהפעלה הנוכחית. ייבא קובץ Excel כדי להתחיל."
                        : "לא נמצאו שורות התואמות את החיפוש."}
                    </td>
                  </tr>
                ) : woGroups ? (
                  // Grouped view
                  woGroups.map(([wo, woLines]) => {
                    const woTotalQty = woLines.reduce((s, l) => s + l.quantity, 0);
                    const woPackedQty = woLines.reduce((s, l) => s + (packedByLine.get(l.id) ?? 0), 0);
                    const woPackedLines = woLines.filter(
                      (l) => getLineStatus(l, packedByLine.get(l.id) ?? 0) === "full",
                    ).length;
                    const woPct = woTotalQty ? Math.round((woPackedQty / woTotalQty) * 100) : 0;
                    return (
                      <Fragment key={wo}>
                        {/* WO group header */}
                        <tr className="bg-secondary/50 border-b border-border">
                          <td colSpan={9} className="py-2 px-4">
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-sm font-bold text-foreground">{wo}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {woPackedLines}/{woLines.length} שורות
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {woPackedQty.toLocaleString()}/{woTotalQty.toLocaleString()} יח׳
                              </span>
                              <div className="flex items-center gap-2 flex-1 max-w-48">
                                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${woPct === 100 ? "bg-green-500" : "bg-brand-accent"}`}
                                    style={{ width: `${woPct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{woPct}%</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {/* Lines in this WO (sorted by status within group) */}
                        {[...woLines]
                          .sort((a, b) => {
                            const o: Record<string, number> = { none: 0, partial: 1, full: 2 };
                            return (
                              o[getLineStatus(a, packedByLine.get(a.id) ?? 0)] -
                              o[getLineStatus(b, packedByLine.get(b.id) ?? 0)]
                            );
                          })
                          .map(renderLine)}
                      </Fragment>
                    );
                  })
                ) : (
                  // Flat view
                  sortedLines.map(renderLine)
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Cartons panel (collapsible) ── */}
        {showCartons && (
          <aside className="w-72 border-r border-border bg-surface-muted flex flex-col shrink-0">
            <div className="p-3 flex items-center justify-between border-b border-border">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                קרטונים <span className="font-normal">({cartons.length})</span>
              </h2>
              <button
                onClick={() => createCarton()}
                className="size-7 bg-brand text-primary-foreground rounded-md flex items-center justify-center hover:bg-zinc-800 transition-colors"
                title="קרטון חדש"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {cartons.map((c) => {
                const qty = getCartonTotalQty(allocations, c.id);
                const skuCount = new Set(allocations.filter((a) => a.cartonId === c.id).map((a) => a.lineId)).size;
                const missingWeight = !c.weight;
                const missingDims = !(c.length && c.width && c.height);
                const isActive = c.id === activeCartonId;
                return (
                  <div
                    key={c.id}
                    onClick={() => c.status !== "closed" && setActiveCartonId(c.id === activeCartonId ? null : c.id)}
                    className={`bg-card rounded-lg ring-1 p-3 flex flex-col gap-2 cursor-pointer transition-all ${
                      isActive
                        ? "ring-brand-accent ring-2"
                        : c.status === "closed"
                          ? "opacity-70 ring-black/5 cursor-default"
                          : "ring-black/5 hover:ring-black/10"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          {isActive && <Zap className="size-3 text-brand-accent" />}
                          <span className="text-[10px] font-bold text-muted-foreground tracking-wider">{c.number}</span>
                        </div>
                        <Link
                          to="/cartons/$cartonId"
                          params={{ cartonId: c.id }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-semibold text-brand-accent hover:underline flex items-center gap-1"
                        >
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`לסגור את ${c.number}?`)) setCartonStatus(c.id, "closed");
                          }}
                          className="flex-1 text-[11px] bg-brand text-primary-foreground py-1 rounded font-medium hover:bg-zinc-800"
                        >
                          סגור
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCartonStatus(c.id, "packing");
                          }}
                          className="flex-1 text-[11px] bg-secondary text-foreground py-1 rounded font-medium hover:bg-zinc-200"
                        >
                          פתח
                        </button>
                      )}
                      {qty === 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`למחוק את ${c.number}?`)) deleteCarton(c.id);
                          }}
                          className="size-6 grid place-items-center bg-secondary hover:bg-red-50 hover:text-destructive rounded transition-colors"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => createCarton()}
                className="border-2 border-dashed border-border rounded-lg py-4 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-brand-accent hover:text-brand-accent transition-colors"
              >
                <Package className="size-4" />
                <span className="text-[11px] font-medium">+ קרטון חדש</span>
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Pack modal */}
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

// ─────────────────────────────────────────────────────────────────────────────
// PackModal (unchanged logic, autoFocus quantity input added)
// ─────────────────────────────────────────────────────────────────────────────

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

  const nextSuggested = useMemo(() => {
    const nums = cartons.map((c) => { const m = c.number.match(/(\d+)/); return m ? Number(m[1]) : 0; });
    return `CARTON-${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
  }, [cartons]);

  const allocatedTotal = drafts.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
  const remainingToAllocate = remaining - allocatedTotal;
  const valid = allocatedTotal > 0 && allocatedTotal <= remaining && drafts.every((d) => d.quantity > 0 && Boolean(d.cartonId));

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function addRow() {
    setDrafts((ds) => [...ds, { id: nextDraftId(), cartonId: "__new__", quantity: Math.max(0, remaining - ds.reduce((s, d) => s + d.quantity, 0)) }]);
  }
  function removeRow(id: string) {
    setDrafts((ds) => (ds.length === 1 ? ds : ds.filter((d) => d.id !== id)));
  }
  function confirmPack() {
    const rows = mode === "single" ? drafts.slice(0, 1) : drafts;
    for (const d of rows) {
      if (d.quantity <= 0) continue;
      let cartonId = d.cartonId;
      if (cartonId === "__new__") { const c = onCreateCarton(d.newNumber?.trim() || undefined); cartonId = c.id; }
      onAllocate(cartonId, d.quantity);
    }
    onClose();
  }
  function switchMode(m: "single" | "split") {
    setMode(m);
    if (m === "single") setDrafts((ds) => [{ ...(ds[0] ?? { id: nextDraftId(), cartonId: openCartons[0]?.id ?? "__new__", quantity: remaining }), quantity: remaining }]);
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
            <button onClick={() => switchMode("single")} className={`px-3 py-1.5 text-xs font-medium rounded ${mode === "single" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>קרטון יחיד</button>
            <button onClick={() => switchMode("split")} className={`px-3 py-1.5 text-xs font-medium rounded ${mode === "split" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>פיצול בין קרטונים</button>
          </div>
        </div>

        <div className="px-5 pt-3 pb-2 overflow-y-auto flex flex-col gap-2">
          {(mode === "single" ? drafts.slice(0, 1) : drafts).map((d, idx) => (
            <DraftRow
              key={d.id} index={idx} draft={d} cartons={openCartons}
              nextSuggested={nextSuggested} onChange={(p) => updateDraft(d.id, p)}
              onRemove={mode === "split" && drafts.length > 1 ? () => removeRow(d.id) : undefined}
              maxQty={remaining} autoFocus={idx === 0}
            />
          ))}
          {mode === "split" && (
            <button onClick={addRow} className="text-xs py-2 border border-dashed border-border rounded-md hover:border-brand-accent hover:text-brand-accent text-muted-foreground transition-colors">
              + הוסף הקצאה לקרטון
            </button>
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
                      <input type="number" min={1} value={a.quantity} onChange={(e) => onUpdateAlloc(a.id, Math.max(0, Number(e.target.value)))}
                        className="w-20 bg-card ring-1 ring-border rounded px-2 py-1 text-sm tabular-nums text-center outline-none focus:ring-brand-accent" />
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
            <button onClick={confirmPack} disabled={!valid}
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
  index, draft, cartons, nextSuggested, onChange, onRemove, maxQty, autoFocus,
}: {
  index: number; draft: Draft; cartons: Carton[]; nextSuggested: string;
  onChange: (patch: Partial<Draft>) => void; onRemove?: () => void; maxQty: number; autoFocus?: boolean;
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
            {cartons.map((c) => <option key={c.id} value={c.id}>{c.number}{c.status === "packing" ? " · באריזה" : ""}</option>)}
            <option value="__new__">+ צור קרטון חדש</option>
          </select>
        </div>
        <div className="w-32">
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">כמות</label>
          <input
            type="number" min={1} max={maxQty} value={draft.quantity}
            autoFocus={autoFocus}
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
          <input type="text" value={draft.newNumber ?? nextSuggested} onChange={(e) => onChange({ newNumber: e.target.value })}
            className="flex-1 bg-card ring-1 ring-border rounded px-2 py-1 text-xs font-mono outline-none focus:ring-brand-accent" />
          <span className="text-[10px] text-muted-foreground">משקל וממדים יוזנו מאוחר יותר</span>
        </div>
      )}
    </div>
  );
}
