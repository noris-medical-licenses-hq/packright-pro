import type { CartonStatus, LineStatus } from "@/lib/types";

const lineMap: Record<LineStatus, { label: string; cls: string }> = {
  none: { label: "לא נארז", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200/50" },
  partial: { label: "נארז חלקית", cls: "bg-amber-50 text-amber-700 ring-amber-200/50" },
  full: { label: "נארז במלואו", cls: "bg-green-50 text-green-700 ring-green-200/50" },
};

const cartonMap: Record<CartonStatus, { label: string; cls: string }> = {
  open: { label: "פתוח", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200/50" },
  packing: { label: "באריזה", cls: "bg-cyan-50 text-cyan-700 ring-cyan-200/50" },
  closed: { label: "סגור", cls: "bg-green-50 text-green-700 ring-green-200/50" },
};

export function LineStatusBadge({ status }: { status: LineStatus }) {
  const m = lineMap[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${m.cls}`}>{m.label}</span>;
}

export function CartonStatusBadge({ status }: { status: CartonStatus }) {
  const m = cartonMap[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${m.cls}`}>{m.label}</span>;
}