import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import type { ImportEntry, ShipmentLine } from "@/lib/types";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "מרכז ייבוא — Packing Control Center" }, { name: "description", content: "ייבוא קובץ Excel ממערכת Priority ERP" }] }),
  component: ImportPage,
});

const REQUIRED = ["deliveryNumber", "workOrder", "batch", "sku", "quantity"];

// Map common Hebrew/English Priority column headers
const headerMap: Record<string, keyof ShipmentLine> = {
  "מספר משלוח": "deliveryNumber", "DeliveryNumber": "deliveryNumber", "delivery": "deliveryNumber",
  "מספר לקוח": "customerNumber", "CustomerNumber": "customerNumber",
  "שם לקוח": "customerName", "CustomerName": "customerName",
  "פקודת עבודה": "workOrder", "WorkOrder": "workOrder",
  "אצווה": "batch", "Batch": "batch",
  "מק\"ט": "sku", "SKU": "sku", "Item": "sku",
  "תיאור": "description", "Description": "description",
  "כמות": "quantity", "Quantity": "quantity",
  "יחידה": "unit", "Unit": "unit",
  "מטבע": "currency", "Currency": "currency",
  "מחיר": "unitPrice", "UnitPrice": "unitPrice",
  "סכום": "totalAmount", "TotalAmount": "totalAmount",
  "יעד": "destinationCountry", "Country": "destinationCountry",
  "תאריך": "date", "Date": "date",
};

function ImportPage() {
  const { imports, addLines } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [lastSummary, setLastSummary] = useState<ImportEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const lines: ShipmentLine[] = rows.map((row, i) => {
        const mapped: Partial<ShipmentLine> = {};
        for (const [key, val] of Object.entries(row)) {
          const k = headerMap[key.trim() as keyof typeof headerMap];
          if (k) (mapped as Record<string, unknown>)[k] = val;
        }
        return {
          id: `IMP${Date.now()}_${i}`,
          deliveryNumber: String(mapped.deliveryNumber ?? ""),
          customerNumber: String(mapped.customerNumber ?? ""),
          customerName: String(mapped.customerName ?? ""),
          workOrder: String(mapped.workOrder ?? ""),
          batch: String(mapped.batch ?? ""),
          sku: String(mapped.sku ?? ""),
          description: String(mapped.description ?? ""),
          quantity: Number(mapped.quantity ?? 0),
          unit: String(mapped.unit ?? "יח'"),
          currency: String(mapped.currency ?? "USD"),
          unitPrice: Number(mapped.unitPrice ?? 0),
          totalAmount: Number(mapped.totalAmount ?? 0),
          destinationCountry: String(mapped.destinationCountry ?? ""),
          date: String(mapped.date ?? new Date().toISOString().slice(0, 10)),
        } as ShipmentLine;
      }).filter((l) => REQUIRED.every((k) => (l as Record<string, unknown>)[k]));

      if (!lines.length) throw new Error("לא נמצאו רשומות תקינות בקובץ");

      const entry: ImportEntry = {
        id: `I${Date.now()}`,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        deliveries: new Set(lines.map((l) => l.deliveryNumber)).size,
        workOrders: new Set(lines.map((l) => l.workOrder)).size,
        batches: new Set(lines.map((l) => `${l.workOrder}|${l.batch}`)).size,
        skus: new Set(lines.map((l) => l.sku)).size,
        totalQty: lines.reduce((s, l) => s + l.quantity, 0),
        status: "success",
      };
      addLines(lines, entry);
      setLastSummary(entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בעיבוד הקובץ");
    } finally {
      setParsing(false);
    }
  }

  return (
    <AppShell title="מרכז ייבוא נתונים">
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const f = e.dataTransfer.files[0]; if (f) handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`bg-card rounded-xl ring-1 ring-black/5 border-2 border-dashed p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-brand-accent bg-cyan-50/30" : "border-border hover:border-zinc-300"}`}
        >
          <div className="size-14 bg-secondary rounded-full flex items-center justify-center">
            <Upload className="size-6 text-brand-accent" />
          </div>
          <div className="text-base font-semibold">גרור קובץ Excel לכאן או לחץ לבחירה</div>
          <div className="text-xs text-muted-foreground">תומך ב-.xlsx / .xls — ייצוא תקני מ-Priority ERP</div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {parsing && <div className="text-xs text-brand-accent">מעבד...</div>}
          {error && <div className="text-xs text-destructive flex items-center gap-2"><AlertCircle className="size-3.5" />{error}</div>}
        </div>

        {lastSummary && (
          <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="size-4 text-green-600" />
              <h2 className="text-sm font-semibold">סיכום ייבוא אחרון</h2>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[
                ["רשומות", lastSummary.totalQty.toLocaleString()],
                ["משלוחים", lastSummary.deliveries],
                ["פק״ע", lastSummary.workOrders],
                ["אצוות", lastSummary.batches],
                ["מק״טים", lastSummary.skus],
              ].map(([l, v]) => (
                <div key={l} className="bg-surface-muted rounded p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{l}</div>
                  <div className="text-lg font-bold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
          <h2 className="text-sm font-semibold mb-3">היסטוריית ייבוא</h2>
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-medium">תאריך</th>
                <th className="py-2 font-medium">שם קובץ</th>
                <th className="py-2 font-medium text-center">משלוחים</th>
                <th className="py-2 font-medium text-center">פק״ע</th>
                <th className="py-2 font-medium text-center">אצוות</th>
                <th className="py-2 font-medium text-center">מק״טים</th>
                <th className="py-2 font-medium text-center">סה״כ</th>
                <th className="py-2 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} className="border-b border-border/50 hover:bg-surface-muted">
                  <td className="py-3 text-xs tabular-nums text-muted-foreground">{new Date(i.uploadedAt).toLocaleString("he-IL")}</td>
                  <td className="py-3 flex items-center gap-2"><FileSpreadsheet className="size-4 text-green-700" />{i.fileName}</td>
                  <td className="py-3 text-center tabular-nums">{i.deliveries}</td>
                  <td className="py-3 text-center tabular-nums">{i.workOrders}</td>
                  <td className="py-3 text-center tabular-nums">{i.batches}</td>
                  <td className="py-3 text-center tabular-nums">{i.skus}</td>
                  <td className="py-3 text-center tabular-nums">{i.totalQty.toLocaleString()}</td>
                  <td className="py-3"><span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-green-200/50">הושלם</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}