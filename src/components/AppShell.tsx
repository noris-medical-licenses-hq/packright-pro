import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Upload, PackageOpen, ScrollText, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";

const nav = [
  { to: "/", label: "מסוף", icon: LayoutDashboard },
  { to: "/import", label: "ייבוא", icon: Upload },
  { to: "/packing", label: "אריזה", icon: PackageOpen },
  { to: "/delivery-note", label: "ת. משלוח", icon: FileText },
  { to: "/audit", label: "יומן", icon: ScrollText },
] as const;

export function AppShell({ children, title, headerRight }: { children: ReactNode; title: string; headerRight?: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = useStore((s) => s.currentUser);
  return (
    <div className="flex h-screen w-full bg-background text-foreground" dir="rtl">
      <nav className="w-20 flex flex-col items-center py-5 bg-secondary border-l border-border gap-7 shrink-0">
        <div className="size-10 bg-brand rounded-lg flex items-center justify-center">
          <PackageOpen className="size-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col gap-5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
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
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-3">{headerRight}</div>
        </header>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">{children}</div>
      </main>
    </div>
  );
}