import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Printer } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getCartonTotalQty, useStore } from "@/lib/store";

export const Route = createFileRoute("/delivery-note")({
  head: () => ({ meta: [{ title: "תעודת משלוח — Packing Control Center" }, { name: "description", content: "תצוגה מקדימה וייצוא תעודת משלוח" }] }),
  component: DeliveryNote,
});

function DeliveryNote() {
  const { lines, cartons, allocations } = useStore();
  const deliveries = useMemo(() => Array.from(new Set(lines.map((l) => l.deliveryNumber))), [lines]);
  const [selected, setSelected] = useState<string>(deliveries[0] ?? "");

  const dLines = lines.filter((l) => l.deliveryNumber === selected);
  const customer = dLines[0];
  const allocsForDelivery = allocations.filter((a) => dLines.some((l) => l.id === a.lineId));
  const usedCartons = cartons.filter((c) => allocsForDelivery.some((a) => a.cartonId === c.id));
  const totalQty = dLines.reduce((s, l) => s + l.quantity, 0);
  const packedQty = allocsForDelivery.reduce((s, a) => s + a.quantity, 0);

  function exportExcel() {
    const rows = usedCartons.flatMap((c) =>
      allocsForDelivery.filter((a) => a.cartonId === c.id).map((a) => {
        const line = lines.find((l) => l.id === a.lineId)!;
        return {
          "מס׳ קרטון": c.number,
          "פק״ע": line.workOrder, "אצווה": line.batch,
          "מק״ט": line.sku, "תיאור": line.description,
          "כמות": a.quantity, "יחידה": line.unit,
          "משקל קרטון (ק״ג)": c.weight ?? "",
          "ממדים": c.length && c.width && c.height ? `${c.length}x${c.width}x${c.height}` : "",
        };
      })
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DeliveryNote");
    XLSX.writeFile(wb, `delivery-note-${selected}.xlsx`);
  }

  return (
    <AppShell title="תעודת משלוח"
      headerRight={
        <div className="flex gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="bg-card ring-1 ring-border rounded-md px-3 py-1.5 text-sm outline-none">
            {deliveries.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm bg-secondary text-foreground py-1.5 px-3 rounded-md hover:bg-zinc-200"><Printer className="size-3.5" />הדפס</button>
          <button onClick={exportExcel} className="flex items-center gap-1.5 text-sm bg-brand text-primary-foreground py-1.5 px-4 rounded-md hover:bg-zinc-800"><Download className="size-3.5" />ייצוא Excel</button>
        </div>
      }
    >
      <div className="flex-1 overflow-auto p-6">
        {!customer ? (
          <div className="text-center text-muted-foreground py-20">בחר משלוח</div>
        ) : (
          <div className="max-w-4xl mx-auto bg-card rounded-lg ring-1 ring-black/5 p-8 flex flex-col gap-6">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">תעודת משלוח</div>
                <div className="text-3xl font-bold tracking-tight mt-1">{selected}</div>
              </div>
              <div className="text-left text-xs text-muted-foreground">
                <div>תאריך: {new Date().toLocaleDateString("he-IL")}</div>
                <div>הופק על ידי: Packing Control Center</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-muted rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">לקוח</div>
                <div className="font-semibold">{customer.customerName}</div>
                <div className="text-xs text-muted-foreground mt-1">מס׳ לקוח: {customer.customerNumber}</div>
                <div className="text-xs text-muted-foreground">יעד: {customer.destinationCountry}</div>
              </div>
              <div className="bg-surface-muted rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">סיכום אריזה</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-xl font-bold tabular-nums">{usedCartons.length}</div><div className="text-[10px] text-muted-foreground">קרטונים</div></div>
                  <div><div className="text-xl font-bold tabular-nums text-cyan-700">{packedQty.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">נארז</div></div>
                  <div><div className="text-xl font-bold tabular-nums">{totalQty.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">סה״כ</div></div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">קרטונים ותכולה</h3>
              <div className="flex flex-col gap-4">
                {usedCartons.map((c) => {
                  const cAllocs = allocsForDelivery.filter((a) => a.cartonId === c.id);
                  return (
                    <div key={c.id} className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-surface-muted px-4 py-2 flex justify-between items-center">
                        <div className="font-mono text-sm font-semibold">{c.number}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {getCartonTotalQty(allocations, c.id).toLocaleString()} יח׳ · {c.weight?.toFixed(2) ?? "—"} ק״ג · {c.length && c.width && c.height ? `${c.length}×${c.width}×${c.height} ס״מ` : "ממדים לא הוגדרו"}
                        </div>
                      </div>
                      <table className="w-full text-right text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-card">
                            <th className="py-2 px-3 font-medium">מק״ט</th>
                            <th className="py-2 px-3 font-medium">תיאור</th>
                            <th className="py-2 px-3 font-medium">פק״ע / אצווה</th>
                            <th className="py-2 px-3 font-medium text-center">כמות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cAllocs.map((a) => {
                            const l = lines.find((x) => x.id === a.lineId)!;
                            return (
                              <tr key={a.id} className="border-t border-border/50">
                                <td className="py-2 px-3 font-mono text-xs">{l.sku}</td>
                                <td className="py-2 px-3">{l.description}</td>
                                <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{l.workOrder} / {l.batch}</td>
                                <td className="py-2 px-3 text-center tabular-nums font-medium">{a.quantity.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                {!usedCartons.length && <div className="text-center text-muted-foreground py-8 border border-dashed border-border rounded-lg">אין קרטונים שהוקצו למשלוח זה</div>}
              </div>
            </div>

            <div className="border-t border-border pt-4 grid grid-cols-3 gap-8 text-xs text-muted-foreground">
              <div><div className="border-b border-border pb-6 mb-1"></div>חתימת אורז</div>
              <div><div className="border-b border-border pb-6 mb-1"></div>חתימת בודק</div>
              <div><div className="border-b border-border pb-6 mb-1"></div>חתימת נהג</div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}