import type { ShipmentLine } from "../types";

export interface ImportError {
  row: number; // 1-based Excel row (header = row 1, first data row = row 2)
  field: string;
  value: unknown;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: ShipmentLine[];
  errors: ImportError[];
  errorCount: number;
  warningCount: number;
  hasFatal: boolean;
}

export function validateRows(rows: Record<string, unknown>[]): ValidationResult {
  const valid: ShipmentLine[] = [];
  const errors: ImportError[] = [];
  const importTs = Date.now().toString(36);

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // row 1 is the header
    const rowErrors: ImportError[] = [];

    const sku = String(row.sku ?? "").trim();
    if (!sku) rowErrors.push({ row: rowNum, field: "sku", value: row.sku, message: 'מק"ט הוא שדה חובה', severity: "error" });

    const description = String(row.description ?? "").trim();
    if (!description) rowErrors.push({ row: rowNum, field: "description", value: row.description, message: "תיאור הוא שדה חובה", severity: "error" });

    const workOrder = String(row.workOrder ?? "").trim();
    if (!workOrder) rowErrors.push({ row: rowNum, field: "workOrder", value: row.workOrder, message: "פקודת עבודה היא שדה חובה", severity: "error" });

    const batch = String(row.batch ?? "").trim();
    if (!batch) rowErrors.push({ row: rowNum, field: "batch", value: row.batch, message: "אצווה היא שדה חובה", severity: "error" });

    const rawQty = row.quantity;
    const qty = Number(rawQty);
    if (rawQty === null || rawQty === undefined || String(rawQty).trim() === "") {
      rowErrors.push({ row: rowNum, field: "quantity", value: rawQty, message: "כמות היא שדה חובה", severity: "error" });
    } else if (isNaN(qty)) {
      rowErrors.push({ row: rowNum, field: "quantity", value: rawQty, message: `כמות חייבת להיות מספר (ערך: "${rawQty}")`, severity: "error" });
    } else if (qty <= 0) {
      rowErrors.push({ row: rowNum, field: "quantity", value: rawQty, message: `כמות חייבת להיות גדולה מ-0 (ערך: ${qty})`, severity: "error" });
    }

    errors.push(...rowErrors);
    if (rowErrors.some((e) => e.severity === "error")) return;

    valid.push({
      id: `IL${String(idx + 1).padStart(5, "0")}_${importTs}`,
      deliveryNumber: String(row.deliveryNumber ?? "").trim() || "—",
      customerNumber: String(row.customerNumber ?? "").trim() || "—",
      customerName: String(row.customerName ?? "").trim() || "—",
      workOrder,
      batch,
      sku,
      description,
      quantity: qty,
      unit: String(row.unit ?? "יח'").trim() || "יח'",
      currency: String(row.currency ?? "USD").trim() || "USD",
      unitPrice: Number(row.unitPrice) || 0,
      totalAmount: Number(row.totalAmount) || 0,
      destinationCountry: String(row.destinationCountry ?? "").trim() || "—",
      date: String(row.date ?? new Date().toISOString().slice(0, 10)).trim(),
      ...(row.packingStatus !== undefined && row.packingStatus !== null
        ? { packingStatus: String(row.packingStatus) }
        : {}),
    });
  });

  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warningCount = errors.filter((e) => e.severity === "warning").length;
  return { valid, errors, errorCount, warningCount, hasFatal: errorCount > 0 };
}
