import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { useStore, getPackedForLine, getLineStatus, getCartonTotalQty } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "מסוף בקרה — Packing Control Center" },
      { name: "description", content: "סקירה תפעולית של פעולות אריזה — KPI, התקדמות, פק״ע פעילות" },
    ],
  }),
  component: Dashboard,
});

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-card rounded-lg ring-1 ring-black/5 p-4 flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Dashboard() {
  const { lines, cartons, allocations } = useStore();

  const stats = useMemo(() => {
    const deliveries = new Set(lines.map((l) => l.deliveryNumber)).size;
    const customers = new Set(lines.map((l) => l.customerNumber)).size;
    const workOrders = new Set(lines.map((l) => l.workOrder)).size;
    const batches = new Set(lines.map((l) => `${l.workOrder}|${l.batch}`)).size;
    const total = lines.reduce((s, l) => s + l.quantity, 0);
    const packed = allocations.reduce((s, a) => s + a.quantity, 0);
    const remaining = total - packed;
    return { deliveries, customers, workOrders, batches, total, packed, remaining, cartons: cartons.length, progress: total ? Math.round((packed / total) * 100) : 0 };
  }, [lines, cartons, allocations]);

  const woProgress = useMemo(() => {
    const map = new Map<string, { total: number; packed: number }>();
    for (const line of lines) {
      const m = map.get(line.workOrder) ?? { total: 0, packed: 0 };
      m.total += line.quantity;
      m.packed += getPackedForLine(allocations, line.id);
      map.set(line.workOrder, m);
    }
    return Array.from(map.entries()).slice(0, 8).map(([wo, v]) => ({ wo, packed: v.packed, remaining: v.total - v.packed }));
  }, [lines, allocations]);

  const statusPie = useMemo(() => {
    let none = 0, partial = 0, full = 0;
    for (const l of lines) {
      const s = getLineStatus(l, getPackedForLine(allocations, l.id));
      if (s === "none") none++; else if (s === "partial") partial++; else full++;
    }
    return [
      { name: "נארז במלואו", value: full, color: "var(--status-packed)" },
      { name: "נארז חלקית", value: partial, color: "var(--status-partial)" },
      { name: "לא נארז", value: none, color: "var(--status-none)" },
    ];
  }, [lines, allocations]);

  const cartonsPerDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cartons) {
      const day = c.createdAt.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort().map(([day, count]) => ({ day: day.slice(5), count }));
  }, [cartons]);

  const recentJobs = useMemo(() => {
    const wos = Array.from(new Set(lines.map((l) => l.workOrder))).slice(0, 6);
    return wos.map((wo) => {
      const wLines = lines.filter((l) => l.workOrder === wo);
      const total = wLines.reduce((s, l) => s + l.quantity, 0);
      const packed = wLines.reduce((s, l) => s + getPackedForLine(allocations, l.id), 0);
      return { wo, customer: wLines[0]?.customerName ?? "", total, packed, progress: total ? Math.round((packed / total) * 100) : 0 };
    });
  }, [lines, allocations]);

  return (
    <AppShell
      title="מרכז בקרת אריזה"
      headerRight={
        <Link to="/packing" className="text-sm font-medium bg-brand text-primary-foreground py-1.5 px-4 rounded-md hover:bg-zinc-800 transition-colors">
          פתח שולחן אריזה
        </Link>
      }
    >
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="סה״כ משלוחים" value={stats.deliveries} />
          <Kpi label="לקוחות" value={stats.customers} />
          <Kpi label="פקודות עבודה" value={stats.workOrders} />
          <Kpi label="אצוות" value={stats.batches} />
          <Kpi label="כמות כוללת" value={stats.total.toLocaleString()} />
          <Kpi label="נארז" value={stats.packed.toLocaleString()} accent="text-cyan-700" />
          <Kpi label="נותר לאריזה" value={stats.remaining.toLocaleString()} accent="text-amber-700" />
          <Kpi label="קרטונים" value={stats.cartons} />
        </div>

        <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">התקדמות אריזה כוללת</h2>
            <span className="text-sm font-bold tabular-nums">{stats.progress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-brand-accent transition-all duration-500" style={{ width: `${stats.progress}%` }} />
          </div>
          <div className="mt-3 flex gap-6 text-xs text-muted-foreground tabular-nums">
            <span>נארזו: <span className="text-foreground font-medium">{stats.packed.toLocaleString()}</span></span>
            <span>נותרו: <span className="text-foreground font-medium">{stats.remaining.toLocaleString()}</span></span>
            <span>סה״כ: <span className="text-foreground font-medium">{stats.total.toLocaleString()}</span></span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-lg ring-1 ring-black/5 p-5 col-span-2">
            <h2 className="text-sm font-semibold mb-4">פקודות עבודה פתוחות</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={woProgress}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="wo" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="packed" stackId="a" fill="var(--brand-accent)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="remaining" stackId="a" fill="var(--border)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
            <h2 className="text-sm font-semibold mb-4">סטטוס שורות</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1 mt-2 text-xs">
              {statusPie.map((e) => (
                <div key={e.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className="size-2 rounded-full" style={{ background: e.color }} /><span>{e.name}</span></div>
                  <span className="font-medium tabular-nums">{e.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-lg ring-1 ring-black/5 p-5 col-span-2">
            <h2 className="text-sm font-semibold mb-3">משימות אריזה אחרונות</h2>
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 font-medium">פק״ע</th>
                  <th className="py-2 font-medium">לקוח</th>
                  <th className="py-2 font-medium text-center">כמות</th>
                  <th className="py-2 font-medium text-center">נארז</th>
                  <th className="py-2 font-medium">התקדמות</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => (
                  <tr key={j.wo} className="border-b border-border/50 hover:bg-surface-muted">
                    <td className="py-2.5 font-mono text-xs text-brand-accent">{j.wo}</td>
                    <td className="py-2.5">{j.customer}</td>
                    <td className="py-2.5 text-center tabular-nums">{j.total.toLocaleString()}</td>
                    <td className="py-2.5 text-center tabular-nums font-medium">{j.packed.toLocaleString()}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-brand-accent" style={{ width: `${j.progress}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums w-9 text-left">{j.progress}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
            <h2 className="text-sm font-semibold mb-4">קרטונים שנוצרו לפי יום</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cartonsPerDay.length ? cartonsPerDay : [{ day: "—", count: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--brand)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
