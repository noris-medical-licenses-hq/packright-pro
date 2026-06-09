import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "יומן פעולות — Packing Control Center" }, { name: "description", content: "תיעוד מלא של כל פעולות האריזה במערכת" }] }),
  component: AuditPage,
});

function AuditPage() {
  const { audit, resetDemo } = useStore();
  const [filter, setFilter] = useState("");
  const filtered = audit.filter((a) => !filter || a.action.includes(filter) || a.details.includes(filter) || a.user.includes(filter));
  return (
    <AppShell title="יומן פעולות"
      headerRight={
        <button onClick={() => { if (confirm("לאתחל את כל הנתונים ולחזור לנתוני דמו?")) resetDemo(); }} className="text-xs bg-secondary text-foreground py-1.5 px-3 rounded-md hover:bg-zinc-200">אתחל דמו</button>
      }
    >
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-card rounded-lg ring-1 ring-black/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">תיעוד פעולות ({filtered.length})</h2>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="חיפוש..." className="bg-card ring-1 ring-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-brand-accent w-64" />
          </div>
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="py-2 font-medium">תאריך ושעה</th>
                <th className="py-2 font-medium">משתמש</th>
                <th className="py-2 font-medium">פעולה</th>
                <th className="py-2 font-medium">פרטים</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-surface-muted">
                  <td className="py-2.5 text-xs tabular-nums text-muted-foreground">{new Date(a.timestamp).toLocaleString("he-IL")}</td>
                  <td className="py-2.5">{a.user}</td>
                  <td className="py-2.5"><span className="text-xs font-medium px-2 py-0.5 rounded bg-secondary">{a.action}</span></td>
                  <td className="py-2.5 font-mono text-xs text-muted-foreground">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}