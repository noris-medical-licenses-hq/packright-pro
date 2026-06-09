import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActiveFile, Allocation, AuditEntry, Carton, CartonStatus, ImportEntry, LineStatus, ShipmentLine } from "./types";
import { generateDemoAllocations, generateDemoAudit, generateDemoCartons, generateDemoImports, generateDemoLines } from "./demo-data";

interface State {
  lines: ShipmentLine[];
  cartons: Carton[];
  allocations: Allocation[];
  imports: ImportEntry[];
  audit: AuditEntry[];
  currentUser: string;
  activeFile: ActiveFile | null;

  addLines: (lines: ShipmentLine[], importEntry: ImportEntry) => void;
  replaceSession: (lines: ShipmentLine[], fileName: string) => void;
  createCarton: (number?: string) => Carton;
  updateCarton: (id: string, patch: Partial<Carton>) => void;
  deleteCarton: (id: string) => void;
  setCartonStatus: (id: string, status: CartonStatus) => void;
  allocate: (lineId: string, cartonId: string, quantity: number) => void;
  updateAllocation: (id: string, quantity: number) => void;
  removeAllocation: (id: string) => void;
  moveAllocation: (id: string, toCartonId: string) => void;
  resetDemo: () => void;
}

function seed() {
  const lines = generateDemoLines();
  const cartons = generateDemoCartons();
  const allocations = generateDemoAllocations(lines, cartons);
  const imports = generateDemoImports();
  const audit = generateDemoAudit();
  const activeFile: ActiveFile = {
    name: "shipment_export_2026-06-09.xlsx",
    loadedAt: new Date(Date.UTC(2026, 5, 9, 4, 0, 0)).toISOString(),
    lineCount: lines.length,
    totalQty: lines.reduce((s, l) => s + l.quantity, 0),
  };
  return { lines, cartons, allocations, imports, audit, activeFile };
}

function log(state: State, action: string, details: string): AuditEntry[] {
  return [
    { id: `AU${Date.now()}`, timestamp: new Date().toISOString(), user: state.currentUser, action, details },
    ...state.audit,
  ].slice(0, 500);
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seed(),
      currentUser: "אבי כהן",
      addLines: (newLines, importEntry) =>
        set((s) => ({
          lines: [...s.lines, ...newLines],
          imports: [importEntry, ...s.imports],
          audit: log(s, "ייבוא קובץ", importEntry.fileName),
        })),
      replaceSession: (newLines, fileName) =>
        set((s) => ({
          lines: newLines,
          cartons: [],
          allocations: [],
          activeFile: {
            name: fileName,
            loadedAt: new Date().toISOString(),
            lineCount: newLines.length,
            totalQty: newLines.reduce((sum, l) => sum + l.quantity, 0),
          },
          audit: log(s, "החלפת קובץ פעיל", `${fileName} (${newLines.length} שורות)`),
        })),
      createCarton: (manualNumber) => {
        const state = get();
        const nextNum = state.cartons.length + 1;
        const number = manualNumber ?? `CARTON-${String(nextNum).padStart(3, "0")}`;
        const carton: Carton = { id: `K${Date.now()}`, number, status: "open", createdAt: new Date().toISOString() };
        set((s) => ({ cartons: [...s.cartons, carton], audit: log(s, "יצירת קרטון", number) }));
        return carton;
      },
      updateCarton: (id, patch) =>
        set((s) => ({
          cartons: s.cartons.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          audit: log(s, "עדכון קרטון", `${s.cartons.find((c) => c.id === id)?.number}`),
        })),
      deleteCarton: (id) =>
        set((s) => ({
          cartons: s.cartons.filter((c) => c.id !== id),
          allocations: s.allocations.filter((a) => a.cartonId !== id),
          audit: log(s, "מחיקת קרטון", s.cartons.find((c) => c.id === id)?.number ?? ""),
        })),
      setCartonStatus: (id, status) =>
        set((s) => ({
          cartons: s.cartons.map((c) => (c.id === id ? { ...c, status, closedAt: status === "closed" ? new Date().toISOString() : c.closedAt } : c)),
          audit: log(s, status === "closed" ? "סגירת קרטון" : "שינוי סטטוס קרטון", s.cartons.find((c) => c.id === id)?.number ?? ""),
        })),
      allocate: (lineId, cartonId, quantity) => {
        const state = get();
        const line = state.lines.find((l) => l.id === lineId);
        const carton = state.cartons.find((c) => c.id === cartonId);
        if (!line || !carton || quantity <= 0) return;
        const packed = state.allocations.filter((a) => a.lineId === lineId).reduce((sum, a) => sum + a.quantity, 0);
        const available = line.quantity - packed;
        const qty = Math.min(quantity, available);
        if (qty <= 0) return;
        const alloc: Allocation = { id: `A${Date.now()}`, lineId, cartonId, quantity: qty, createdAt: new Date().toISOString() };
        set((s) => ({
          allocations: [...s.allocations, alloc],
          cartons: s.cartons.map((c) => (c.id === cartonId && c.status === "open" ? { ...c, status: "packing" } : c)),
          audit: log(s, "הקצאת כמות", `${line.sku} × ${qty} → ${carton.number}`),
        }));
      },
      updateAllocation: (id, quantity) =>
        set((s) => {
          const a = s.allocations.find((x) => x.id === id);
          if (!a) return s;
          const line = s.lines.find((l) => l.id === a.lineId);
          const other = s.allocations.filter((x) => x.lineId === a.lineId && x.id !== id).reduce((sum, x) => sum + x.quantity, 0);
          const max = (line?.quantity ?? 0) - other;
          const q = Math.max(0, Math.min(quantity, max));
          return {
            allocations: s.allocations.map((x) => (x.id === id ? { ...x, quantity: q } : x)),
            audit: log(s, "עדכון כמות", `${line?.sku} → ${q}`),
          };
        }),
      removeAllocation: (id) =>
        set((s) => {
          const a = s.allocations.find((x) => x.id === id);
          const line = s.lines.find((l) => l.id === a?.lineId);
          return {
            allocations: s.allocations.filter((x) => x.id !== id),
            audit: log(s, "מחיקת הקצאה", `${line?.sku ?? ""}`),
          };
        }),
      moveAllocation: (id, toCartonId) =>
        set((s) => ({
          allocations: s.allocations.map((a) => (a.id === id ? { ...a, cartonId: toCartonId } : a)),
          audit: log(s, "העברת הקצאה", `${s.cartons.find((c) => c.id === toCartonId)?.number}`),
        })),
      resetDemo: () => set({ ...seed(), currentUser: "אבי כהן" }),
    }),
    { name: "packing-center-v3" },
  ),
);

// Selectors / helpers
export function getPackedForLine(allocations: Allocation[], lineId: string) {
  return allocations.filter((a) => a.lineId === lineId).reduce((s, a) => s + a.quantity, 0);
}

export function getLineStatus(line: ShipmentLine, packed: number): LineStatus {
  if (packed <= 0) return "none";
  if (packed >= line.quantity) return "full";
  return "partial";
}

export function getCartonItems(allocations: Allocation[], lines: ShipmentLine[], cartonId: string) {
  return allocations
    .filter((a) => a.cartonId === cartonId)
    .map((a) => ({ allocation: a, line: lines.find((l) => l.id === a.lineId)! }))
    .filter((x) => x.line);
}

export function getCartonTotalQty(allocations: Allocation[], cartonId: string) {
  return allocations.filter((a) => a.cartonId === cartonId).reduce((s, a) => s + a.quantity, 0);
}