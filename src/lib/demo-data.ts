import type { ShipmentLine, Carton, Allocation, ImportEntry, AuditEntry } from "./types";

const customers = [
  { num: "C-1042", name: "Global Logistics LTD", country: "Germany" },
  { num: "C-2087", name: "Atlas Industrial Group", country: "USA" },
  { num: "C-3310", name: "Nordic Tech Solutions", country: "Sweden" },
  { num: "C-4521", name: "Pacific Trade Co.", country: "Singapore" },
  { num: "C-5634", name: "MedTech Systems BV", country: "Netherlands" },
];

const skus = [
  { sku: "EI268000200", desc: "מעבד לוגי תעשייתי דגם X1-Core", price: 145 },
  { sku: "EI268000201", desc: "כרטיס זיכרון מוקשח 64GB ECC", price: 89 },
  { sku: "EI268000205", desc: "ספק כוח מיוצב 24V DC DIN Rail", price: 220 },
  { sku: "EI268000211", desc: "מחבר אופטי LC-UPC סינגלמוד", price: 12 },
  { sku: "EI268000219", desc: "חיישן טמפרטורה דיגיטלי RTD", price: 38 },
  { sku: "EI268000224", desc: "מתאם RJ45 לסיב אופטי ג'יגה", price: 65 },
  { sku: "EI268000230", desc: "כבל מגשר סיב אופטי 3 מטר", price: 28 },
  { sku: "EI268000245", desc: "ממסר מצב מוצק 40A", price: 175 },
  { sku: "EI268000260", desc: "בקר PLC קומפקטי 16I/16O", price: 1240 },
  { sku: "EI268000271", desc: "מסך מגע HMI 7 אינץ'", price: 890 },
  { sku: "EI268000288", desc: "מנוע סרוו 400W AC", price: 1560 },
  { sku: "EI268000295", desc: "מתג רשת תעשייתי 8 פורטים", price: 540 },
];

function pad(n: number, w: number) { return String(n).padStart(w, "0"); }

export function generateDemoLines(): ShipmentLine[] {
  const lines: ShipmentLine[] = [];
  let id = 1;
  for (let d = 0; d < 5; d++) {
    const cust = customers[d % customers.length];
    const deliveryNumber = `DEL-${88200 + d * 11}`;
    const woCount = 2 + (d % 3);
    for (let w = 0; w < woCount; w++) {
      const workOrder = `WO-${10601900 + d * 10 + w}`;
      const batchCount = 1 + (w % 2);
      for (let b = 0; b < batchCount; b++) {
        const batch = `SH${260000 + d * 20 + w * 5 + b}`;
        const skuCount = 3 + ((d + w + b) % 4);
        for (let s = 0; s < skuCount; s++) {
          const item = skus[(d * 7 + w * 3 + b * 2 + s) % skus.length];
          const qty = [50, 100, 150, 200, 500, 1200][(d + w + s) % 6];
          lines.push({
            id: `L${pad(id++, 5)}`,
            deliveryNumber,
            customerNumber: cust.num,
            customerName: cust.name,
            workOrder,
            batch,
            sku: item.sku,
            description: item.desc,
            quantity: qty,
            unit: "יח'",
            currency: "USD",
            unitPrice: item.price,
            totalAmount: qty * item.price,
            destinationCountry: cust.country,
            date: new Date(Date.now() - d * 86400000).toISOString().slice(0, 10),
          });
        }
      }
    }
  }
  return lines;
}

export function generateDemoCartons(): Carton[] {
  const now = Date.now();
  return [
    { id: "K1", number: "CARTON-001", status: "packing", weight: 12.45, length: 40, width: 40, height: 30, createdAt: new Date(now - 3600e3).toISOString() },
    { id: "K2", number: "CARTON-002", status: "closed", weight: 8.1, length: 30, width: 30, height: 25, createdAt: new Date(now - 7200e3).toISOString(), closedAt: new Date(now - 3000e3).toISOString() },
    { id: "K3", number: "CARTON-003", status: "open", createdAt: new Date(now - 1800e3).toISOString() },
  ];
}

export function generateDemoAllocations(lines: ShipmentLine[], cartons: Carton[]): Allocation[] {
  const allocs: Allocation[] = [];
  let i = 1;
  // Allocate first line partially to carton 1
  if (lines[0]) allocs.push({ id: `A${i++}`, lineId: lines[0].id, cartonId: cartons[0].id, quantity: Math.floor(lines[0].quantity * 0.4), createdAt: new Date().toISOString() });
  if (lines[1]) allocs.push({ id: `A${i++}`, lineId: lines[1].id, cartonId: cartons[1].id, quantity: lines[1].quantity, createdAt: new Date().toISOString() });
  if (lines[2]) allocs.push({ id: `A${i++}`, lineId: lines[2].id, cartonId: cartons[0].id, quantity: lines[2].quantity, createdAt: new Date().toISOString() });
  return allocs;
}

export function generateDemoImports(): ImportEntry[] {
  return [
    { id: "I1", fileName: "shipment_export_2026-06-09.xlsx", uploadedAt: new Date(Date.now() - 3600e3).toISOString(), deliveries: 5, workOrders: 12, batches: 18, skus: 65, totalQty: 8420, status: "success" },
    { id: "I2", fileName: "shipment_export_2026-06-08.xlsx", uploadedAt: new Date(Date.now() - 86400e3).toISOString(), deliveries: 3, workOrders: 7, batches: 9, skus: 38, totalQty: 4210, status: "success" },
  ];
}

export function generateDemoAudit(): AuditEntry[] {
  const now = Date.now();
  return [
    { id: "AU1", timestamp: new Date(now - 600e3).toISOString(), user: "אבי כהן", action: "יצירת קרטון", details: "CARTON-003" },
    { id: "AU2", timestamp: new Date(now - 1200e3).toISOString(), user: "אבי כהן", action: "הקצאת כמות", details: "EI268000200 × 200 → CARTON-001" },
    { id: "AU3", timestamp: new Date(now - 1800e3).toISOString(), user: "מירי לוי", action: "סגירת קרטון", details: "CARTON-002" },
    { id: "AU4", timestamp: new Date(now - 7200e3).toISOString(), user: "אבי כהן", action: "ייבוא קובץ", details: "shipment_export_2026-06-09.xlsx" },
  ];
}