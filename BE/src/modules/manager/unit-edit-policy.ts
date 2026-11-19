export const unitHistoryCounts = {
  reservationUnits: true, maintenanceRequests: true, supportRequests: true,
  outgoingTransfers: true, incomingTransfers: true, returnInspections: true, staffAssignments: true,
} as const;

export function unitMetadataLocked(status: string, counts: Record<string, number>) {
  return status !== 'AVAILABLE' || Object.values(counts).some(count => count > 0);
}
