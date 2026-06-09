import type { Allocation, Carton } from "../types";

export interface SessionImpact {
  packedLineCount: number;
  openCartonCount: number;
  closedCartonCount: number;
  totalCartonCount: number;
  requiresConfirmation: boolean;
}

export function previewSessionImpact(
  allocations: Allocation[],
  cartons: Carton[],
): SessionImpact {
  const packedLineCount = new Set(allocations.map((a) => a.lineId)).size;
  const openCartonCount = cartons.filter((c) => c.status !== "closed").length;
  const closedCartonCount = cartons.filter((c) => c.status === "closed").length;
  return {
    packedLineCount,
    openCartonCount,
    closedCartonCount,
    totalCartonCount: cartons.length,
    requiresConfirmation: packedLineCount > 0 || cartons.length > 0,
  };
}
