import type { ShipmentLine } from "../types";
import type { RawRow } from "./ExcelParser";

export type MappableField = keyof Omit<ShipmentLine, "id"> | "packingStatus";

export type ColumnMap = Partial<Record<MappableField, string>>;

export interface FieldDefinition {
  field: MappableField;
  label: string;
  required: boolean;
  aliases: string[];
}

/**
 * Field definitions with Hebrew Priority ERP aliases and English fallbacks.
 * Aliases are matched case-insensitively, first exact then substring.
 * Add new aliases here when new ERP export formats are discovered.
 */
export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    field: "deliveryNumber",
    label: "מסמך משלוח",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "מסמך", "מס' מסמך", "מס מסמך", "תעודת משלוח", "מסמך מקור",
      "מס' תעודה", "מס תעודה", "מספר מסמך",
      // English
      "delivery", "delivery number", "delivery_number", "deliverynumber",
      "doc", "document", "doc no", "document no", "delivery no",
    ],
  },
  {
    field: "customerNumber",
    label: "מספר לקוח",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "לקוח", "מספר לקוח", "מס' לקוח", "מס לקוח", "קוד לקוח",
      // English
      "customer", "customer number", "customer_number", "customernumber",
      "customer no", "client", "client no", "customer code",
    ],
  },
  {
    field: "customerName",
    label: "שם לקוח",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "שם לקוח", "שם הלקוח",
      // English
      "customer name", "customer_name", "customername",
      "client name", "account name",
    ],
  },
  {
    field: "workOrder",
    label: "פקודת עבודה",
    required: true,
    aliases: [
      // Priority ERP Hebrew — most important
      'פק"ע', "פקע", "פקודת עבודה", "מס' פק\"ע", "מס פקע",
      "מספר פקודת עבודה", "מס' פקודת עבודה",
      "צו עבודה", "הזמנת עבודה", 'הז"ע',
      "מסמך פק\"ע", "קוד פקע",
      // English
      "work order", "workorder", "work_order", "wo",
      "order no", "order_no", "work order no",
    ],
  },
  {
    field: "batch",
    label: "אצווה",
    required: true,
    aliases: [
      // Priority ERP Hebrew — several synonyms in use
      "אצווה", "אצוה", "מנה", "צווה", "מס' אצווה",
      "מספר אצווה", "מס' מנה", "מספר מנה",
      "שליחה", "מס' שליחה",
      // English
      "batch", "lot", "batch number", "batch_number",
      "lot number", "lot_number", "lot no",
    ],
  },
  {
    field: "sku",
    label: 'מק"ט',
    required: true,
    aliases: [
      // Priority ERP Hebrew
      'מק"ט', "מקט", "פריט", "קוד פריט", "מס' פריט",
      "מספר פריט", "קוד מוצר",
      // English
      "sku", "item", "article", "item_number", "item_code",
      "part_number", "part number", "item number", "product code",
    ],
  },
  {
    field: "description",
    label: "תיאור פריט",
    required: true,
    aliases: [
      // Priority ERP Hebrew
      "תיאור", "תאור", "תיאור פריט", "שם פריט", "שם מוצר",
      "תיאור מוצר", "תאור פריט",
      // English
      "description", "desc", "item description", "item_description",
      "product description", "item desc", "item name",
    ],
  },
  {
    field: "quantity",
    label: "כמות",
    required: true,
    aliases: [
      // Priority ERP Hebrew
      "כמות", "כמות פקודה", "כמות מוזמנת", "כמות לאספקה",
      "כמות לביצוע", "כמות משלוח", "כמות להפקה",
      // English
      "quantity", "qty", "units", "ordered quantity",
      "ordered qty", "order qty", "ship qty",
    ],
  },
  {
    field: "unit",
    label: "יחידת מידה",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "יחידה", "יח", "יח'", "יחידת מידה", "יח' מידה",
      // English
      "unit", "uom", "unit of measure", "unit_of_measure",
    ],
  },
  {
    field: "currency",
    label: "מטבע",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "מטבע", "קוד מטבע",
      // English
      "currency", "cur", "currency_code",
    ],
  },
  {
    field: "unitPrice",
    label: "מחיר יחידה",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "מחיר יחידה", "מחיר", "מחיר ליחידה", "מחיר נטו",
      // English
      "unit price", "unitprice", "unit_price", "price",
      "price per unit", "unit cost",
    ],
  },
  {
    field: "totalAmount",
    label: "סכום כולל",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "סכום", 'סה"כ', "סכום כולל", "סכום שורה", "ערך",
      // English
      "total", "total amount", "total_amount", "amount", "line total",
    ],
  },
  {
    field: "destinationCountry",
    label: "ארץ יעד",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "ארץ יעד", "ארץ", "מדינה", "יעד",
      // English
      "country", "destination", "destination country",
      "dest_country", "destination_country",
    ],
  },
  {
    field: "packingStatus",
    label: "סטטוס אריזה",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "סטטוס", "סטטוס אריזה", "מצב", "מצב אריזה",
      // English
      "packing status", "packing_status", "status",
    ],
  },
  {
    field: "date",
    label: "תאריך",
    required: false,
    aliases: [
      // Priority ERP Hebrew
      "תאריך", "תאריך משלוח", "תאריך הפקה", "תאריך פקודה",
      "תאריך הזמנה",
      // English
      "date", "shipment date", "delivery date",
      "order date", "order_date",
    ],
  },
];

export function autoDetectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  // Normalise: strip RTL/LTR marks, collapse whitespace, lower-case
  const normalise = (s: string) =>
    s
      .replace(/[‎‏‪-‮]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();

  const normHeaders = headers.map(normalise);

  for (const def of FIELD_DEFINITIONS) {
    if (map[def.field]) continue; // already matched
    for (const alias of def.aliases) {
      const a = normalise(alias);
      // 1. exact match
      const exact = normHeaders.findIndex((h) => h === a);
      if (exact !== -1) {
        map[def.field] = headers[exact];
        break;
      }
      // 2. header contains alias (e.g. "כמות פקודה" contains "כמות")
      const contains = normHeaders.findIndex((h) => h.includes(a));
      if (contains !== -1) {
        map[def.field] = headers[contains];
        break;
      }
      // 3. alias contains header (e.g. alias "פקודת עבודה" contains short header "פקע")
      const reverse = normHeaders.findIndex((h) => a.includes(h) && h.length >= 2);
      if (reverse !== -1) {
        map[def.field] = headers[reverse];
        break;
      }
    }
  }

  return map;
}

export function applyColumnMap(
  rows: RawRow[],
  map: ColumnMap,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [field, header] of Object.entries(map) as [MappableField, string][]) {
      if (header) out[field] = row[header];
    }
    return out;
  });
}

export function getMappingStatus(map: ColumnMap): {
  mappedRequired: number;
  totalRequired: number;
  isComplete: boolean;
} {
  const required = FIELD_DEFINITIONS.filter((d) => d.required);
  const mappedRequired = required.filter((d) => !!map[d.field]).length;
  return {
    mappedRequired,
    totalRequired: required.length,
    isComplete: mappedRequired === required.length,
  };
}
