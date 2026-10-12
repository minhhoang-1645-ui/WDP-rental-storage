export { StaffLayout } from './StaffLayout'
export {
  StaffAppointmentsPage,
  StaffDashboardPage,
  StaffMaintenancePage,
  StaffRentalsPage,
  StaffReturnsPage,
  StaffSupportPage,
  StaffTransfersPage,
} from './StaffPages'

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
