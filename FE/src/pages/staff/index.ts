export { StaffLayout } from './StaffLayout'
export { StaffAppointmentsPage } from './StaffAppointmentsPage'
export { StaffOperationsPage } from './StaffOperationsPage'
export { StaffRentalsPage } from './StaffRentalsPage'
export { StaffReturnsPage } from './StaffReturnsPage'
export { StaffTransfersPage } from './StaffTransfersPage'

export const staffRoutes = [
  "/staff",
  "/staff/check-in",
  "/staff/operations",
  "/staff/appointments",
  "/staff/rentals",
  "/staff/returns",
  "/staff/maintenance",
  "/staff/support-requests",
  "/staff/transfers",
] as const;
