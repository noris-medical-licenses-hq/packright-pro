import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, Construction } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "מרכז ייבוא — Packing Control Center" }, { name: "description", content: "ייבוא קובץ Excel ממערכת Priority ERP" }] }),
  component: ImportPage,
});

function ImportPage() {
  return (
    <AppShell title="מרכז ייבוא נתונים">
      <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
        <div className="w-full max-w-2xl bg-card rounded-xl ring-1 ring-black/5 p-10 flex flex-col items-center text-center gap-4 mt-12">
          <div className="size-16 bg-secondary rounded-full flex items-center justify-center">
            <FileSpreadsheet className="size-7 text-brand-accent" />
          </div>
          <h2 className="text-lg font-semibold">ייבוא Excel — בקרוב</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            לוגיקת הייבוא מקבצי Priority ERP תוטמע בשלב הבא. בינתיים המערכת פועלת עם נתוני דמו מובנים שמדמים סביבת אריזה אמיתית.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-secondary rounded-full px-3 py-1.5">
            <Construction className="size-3.5" />
            Placeholder — Excel parsing handled later
          </div>
        </div>
      </div>
    </AppShell>
  );
}