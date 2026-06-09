export type LineStatus = "none" | "partial" | "full";
export type CartonStatus = "open" | "packing" | "closed";
export type WoStatus = "new" | "packing" | "completed" | "shipped";

export interface ShipmentLine {
  id: string;
  deliveryNumber: string;
  customerNumber: string;
  customerName: string;
  workOrder: string;
  batch: string;
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  currency: string;
  unitPrice: number;
  totalAmount: number;
  destinationCountry: string;
  date: string;
  packingStatus?: string;
}

export interface Allocation {
  id: string;
  lineId: string;
  cartonId: string;
  quantity: number;
  createdAt: string;
}

export interface Carton {
  id: string;
  number: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  notes?: string;
  status: CartonStatus;
  createdAt: string;
  closedAt?: string;
}

export interface ImportEntry {
  id: string;
  fileName: string;
  uploadedAt: string;
  deliveries: number;
  workOrders: number;
  batches: number;
  skus: number;
  totalQty: number;
  status: "success" | "failed";
}

export interface ActiveFile {
  name: string;
  loadedAt: string;
  lineCount: number;
  totalQty: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}