import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Trash2, ArrowLeftRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CartonStatusBadge } from "@/components/StatusBadge";
import { getCartonItems, getCartonTotalQty, useStore } from "@/lib/store";

export const Route = createFileRoute("/cartons/$cartonId")({
  head: () => ({ meta: [{ title: "פרטי קרטון — Packing Control Center" }, { name: "description", content: "עריכת פרטי קרטון, ממדים, משקל ותכולה" }] }),
  component: CartonDetail,
});

function CartonDetail() {
  const { cartonId } = Route.useParams();
  const navigate = useNavigate();
  const { cartons, allocations, lines, updateCarton, setCartonStatus, deleteCarton, updateAllocation, removeAllocation, moveAllocation } = useStore();
  const carton = cartons.find((c) => c.id === cartonId);
  const [moveFor, setMoveFor] = useState<string | null>(null);

  if (!carton) {
    return (
      <AppShell title="קרטון לא נמצא">
        <div className="p-8"><Link to="/packing" className="text-brand-accent hover:underline">חזרה לשולחן אריזה</Link></div>
      </AppShell>
    );
  }

  const cartonNonNull = carton;
  const items = getCartonItems(allocations, lines, cartonId);
  const totalQty = getCartonTotalQty(allocations, cartonId);

  function field(label: string, key: "length" | "width" | "height" | "weight", suffix: string) {
    return (
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</label>
        <div className="flex items-center gap-1 mt-1">
          <input
            type="number" step={key === "weight" ? 0.01 : 1} min={0}
            value={(cartonNonNull[key] as number | undefined) ?? ""}
            onChange={(e) => updateCarton(cartonNonNull.id, { [key]: Number(e.target.value) || undefined })}
            className="flex-1 bg-card ring-1 ring-border rounded-md px-3 py-2 text-base tabular-nums outline-none focus:ring-brand-accent"
          />
          <span className="text-xs text-muted-foreground">{suffix}</span>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title={`קרטון ${carton.number}`}
      headerRight={
        <div className="flex gap-2">
          <button onClick={() => navigate({ to: "/packing" })} className="flex items-center gap-1 text-sm bg-secondary text-foreground py-1.5 px-3 rounded-md hover:bg-zinc-200"><ArrowRight className="size-3.5" />חזרה</button>
          {carton.status !== "closed" ? (
            <button onClick={() => { if (confirm(`לסגור את ${carton.number}?`)) setCartonStatus(carton.id, "closed"); }} className="text-sm bg-brand text-primary-foreground py-1.5 px-4 rounded-md hover:bg-zinc-800">סגור קרטון</button>
          ) : (
            <button onClick={() => setCartonStatus(carton.id, "packing")} className="text-sm bg-secondary text-foreground py-1.5 px-4 rounded-md hover:bg-zinc-200">פתח מחדש</button>
          )}
        </div>
      }
    >
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">קרטון</div>
              <div className="text-2xl font-bold tracking-tight">{carton.number}</div>
              <div className="text-xs text-muted-foreground mt-1">נוצר: {new Date(carton.createdAt).toLocaleString("he-IL")}</div>
            </div>
            <CartonStatusBadge status={carton.status} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {field("אורך", "length", "ס״מ")}
            {field("רוחב", "width", "ס״מ")}
            {field("גובה", "height", "ס״מ")}
            {field("משקל", "weight", "ק״ג")}
          </div>
          <div className="mt-4">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">הערות</label>
            <textarea
              value={carton.notes ?? ""}
              onChange={(e) => updateCarton(carton.id, { notes: e.target.value })}
              rows={2}
              className="w-full mt-1 bg-card ring-1 ring-border rounded-md px-3 py-2 text-sm outline-none focus:ring-brand-accent"
              placeholder="הוסף הערות לאריזה..."
            />
          </div>
        </div>

        <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">תכולת קרטון <span className="text-muted-foreground font-normal">({items.length} פריטים · {totalQty.toLocaleString()} יח׳)</span></h2>
          </div>
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-medium">פק״ע</th>
                <th className="py-2 font-medium">אצווה</th>
                <th className="py-2 font-medium">מק״ט</th>
                <th className="py-2 font-medium">תיאור</th>
                <th className="py-2 font-medium text-center">כמות</th>
                <th className="py-2 font-medium text-left">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ allocation, line }) => (
                <tr key={allocation.id} className="border-b border-border/50 hover:bg-surface-muted">
                  <td className="py-3 font-mono text-xs">{line.workOrder}</td>
                  <td className="py-3 font-mono text-xs">{line.batch}</td>
                  <td className="py-3 font-mono text-xs text-brand-accent">{line.sku}</td>
                  <td className="py-3 text-pretty max-w-[40ch]">{line.description}</td>
                  <td className="py-3 text-center">
                    {carton.status !== "closed" ? (
                      <input
                        type="number" min={0}
                        value={allocation.quantity}
                        onChange={(e) => updateAllocation(allocation.id, Number(e.target.value))}
                        className="w-20 bg-card ring-1 ring-border rounded px-2 py-1 text-center tabular-nums outline-none focus:ring-brand-accent"
                      />
                    ) : <span className="tabular-nums font-medium">{allocation.quantity.toLocaleString()}</span>}
                  </td>
                  <td className="py-3 text-left">
                    {carton.status !== "closed" && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setMoveFor(allocation.id)} className="size-7 grid place-items-center bg-secondary hover:bg-zinc-200 rounded" title="העבר"><ArrowLeftRight className="size-3.5" /></button>
                        <button onClick={() => { if (confirm("למחוק הקצאה?")) removeAllocation(allocation.id); }} className="size-7 grid place-items-center bg-secondary hover:bg-red-50 hover:text-destructive rounded" title="מחק"><Trash2 className="size-3.5" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-sm text-muted-foreground">הקרטון ריק</div>
                      <div className="text-xs text-muted-foreground/70">
                        בחר קרטון זה כ"קרטון יעד" בשולחן האריזה ולחץ "אריזה" על השורות הרצויות
                      </div>
                      <Link to="/packing" className="text-xs text-brand-accent hover:underline mt-1">
                        ← עבור לשולחן האריזה
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-start">
          <button onClick={() => { if (confirm(`למחוק את ${carton.number}?`)) { deleteCarton(carton.id); navigate({ to: "/packing" }); } }} className="text-xs text-destructive hover:underline">מחק קרטון</button>
        </div>
      </div>

      {moveFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMoveFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-xl ring-1 ring-black/10 w-full max-w-sm p-5">
            <h3 className="text-base font-semibold mb-3">העבר הקצאה לקרטון</h3>
            <div className="flex flex-col gap-1.5 max-h-64 overflow-auto">
              {cartons.filter((c) => c.id !== cartonId && c.status !== "closed").map((c) => (
                <button key={c.id} onClick={() => { moveAllocation(moveFor, c.id); setMoveFor(null); }} className="text-right p-3 bg-surface-muted hover:bg-secondary rounded flex items-center justify-between">
                  <span className="font-mono text-xs">{c.number}</span>
                  <CartonStatusBadge status={c.status} />
                </button>
              ))}
            </div>
            <button onClick={() => setMoveFor(null)} className="w-full mt-3 py-2 bg-secondary rounded text-sm">ביטול</button>
          </div>
        </div>
      )}
    </AppShell>
  );
}