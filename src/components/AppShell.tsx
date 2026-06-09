import { Link, useRouterState } from "@tanstack/react-router";
import { PackageOpen, FileText, FileSpreadsheet, Replace } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";

const nav = [
  { to: "/packing", label: "אריזה", icon: PackageOpen },
  { to: "/delivery-note", label: "ת. משלוח", icon: FileText },
  { to: "/import", label: "החלפת קובץ", icon: Replace },
] as const;

export function AppShell({ children, title, headerRight }: { children: ReactNode; title: string; headerRight?: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = useStore((s) => s.currentUser);
  const activeFile = useStore((s) => s.activeFile);
  return (
    <div className="flex h-screen w-full bg-background text-foreground" dir="rtl">
      <nav className="w-20 flex flex-col items-center py-5 bg-secondary border-l border-border gap-7 shrink-0">
        <div className="size-10 bg-brand rounded-lg flex items-center justify-center">
          <PackageOpen className="size-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col gap-5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 transition-opacity cursor-pointer ${active ? "opacity-100" : "opacity-40 hover:opacity-100"}`}
              >
                <Icon className={`size-5 ${active ? "text-brand" : "text-muted-foreground"}`} strokeWidth={2.25} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="mt-auto">
          <div className="size-9 bg-muted rounded-full ring-1 ring-black/5 flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
            {user.slice(0, 1)}
          </div>
        </div>
      </nav>
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            {activeFile && (
              <div className="flex items-center gap-2 bg-cyan-50/60 ring-1 ring-cyan-200/60 rounded-lg px-3 py-1.5 min-w-0">
                <FileSpreadsheet className="size-4 text-cyan-700 shrink-0" />
                <div className="flex flex-col leading-tight min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-cyan-700">קובץ פעיל</span>
                    <span className="text-[9px] tabular-nums text-cyan-700/70">
                      {activeFile.lineCount} שורות · {activeFile.totalQty.toLocaleString()} יח׳
                    </span>
                    <span className="text-[9px] tabular-nums text-cyan-700/50">
                      · יובא {new Date(activeFile.loadedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-foreground truncate max-w-[32ch]" title={activeFile.name}>{activeFile.name}</span>
                </div>
              </div>
            )}
            {headerRight}
          </div>
        </header>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">{children}</div>
      </main>
    </div>
  );
}