import { Navigate, Route, Routes } from 'react-router-dom'
import { RoleGuard } from '../components/layout/RoleGuard'
import { PublicLayout } from '../components/layout/PublicLayout'
import { CatalogRouteLayout } from '../components/layout/CatalogRouteLayout'
import { AuthPage } from '../pages/account/AuthPage'
import { BookingConfirmationPage } from '../pages/public/BookingConfirmationPage'
import { BookingWizardPage } from '../pages/public/BookingWizardPage'
import { LandingPage } from '../pages/public/LandingPage'
import { ReservationPage } from '../pages/public/ReservationPage'
import { SizeGuidePage } from '../pages/public/SizeGuideExperiencePage'
import { StorageDetailPage } from '../pages/public/StorageDetailPage'
import { StoragePage } from '../pages/public/StoragePage'
import { ManagerInquiryDetailPage } from '../pages/manager/ManagerInquiryDetailPage'
import { ManagerInquiriesPage } from '../pages/manager/ManagerInquiriesPage'
import { ManagerLayout } from '../pages/manager/ManagerLayout'
import { ManagerUnitsPage } from '../pages/manager/ManagerUnitsPage'
import { ManagerUnitDetailPage } from '../pages/manager/ManagerUnitDetailPage'
import { ManagerCustomersPage } from '../pages/manager/ManagerCustomersPage'
import { ManagerCustomerDetailPage } from '../pages/manager/ManagerCustomerDetailPage'
import { ManagerReservationsPage } from '../pages/manager/ManagerReservationsPage'
import { ManagerReservationDetailPage } from '../pages/manager/ManagerReservationDetailPage'
import { ManagerReportsPage } from '../pages/manager/ManagerReportsPage'
import { ManagerDashboardPage } from '../pages/manager/ManagerDashboardPage'
import { ManagerResourcePage } from '../pages/manager/ManagerResourcePage'
import { ManagerResourceDetailPage } from '../pages/manager/ManagerResourceDetailPage'
import { PortalLoginPage } from '../pages/portal/PortalLoginPage'
import { StaffLayout } from '../pages/staff/StaffLayout'
import { StaffOperationsPage } from '../pages/staff/StaffOperationsPage'
import { StaffAppointmentsPage } from '../pages/staff/StaffAppointmentsPage'
import { StaffRentalsPage } from '../pages/staff/StaffRentalsPage'
import { StaffReturnsPage } from '../pages/staff/StaffReturnsPage'
import { AdminLayout } from '../pages/admin/AdminLayout'
import { AdminUsersPage } from '../pages/admin/AdminUsersPage'
import { AdminSettingsPage } from '../pages/admin/AdminSettingsPage'
import { CustomerLayout } from '../components/customer/CustomerLayout'
import { CustomerDashboardPage } from '../pages/customer/CustomerDashboardPage'
import { CustomerFutureModulePage } from '../pages/customer/CustomerFutureModulePage'
import { CustomerAppointmentsPage } from '../pages/customer/CustomerAppointmentsPage'
import { CustomerContractsPage } from '../pages/customer/CustomerContractsPage'
import { CustomerPaymentsPage } from '../pages/customer/CustomerPaymentsPage'
import { CustomerRenewalsPage } from '../pages/customer/CustomerRenewalsPage'
import { CustomerRentalsPage } from '../pages/customer/CustomerRentalsPage'
import { CustomerProfilePage } from '../pages/customer/CustomerProfilePage'
import { CustomerReservationDetailPage } from '../pages/customer/CustomerReservationDetailPage'
import { CustomerReservationsPage } from '../pages/customer/CustomerReservationsPage'

export function AppRouter() {
  return <Routes>
    <Route element={<PublicLayout />}>
      <Route element={<CatalogRouteLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="size-guide" element={<SizeGuidePage />} />
        <Route path="storage" element={<StoragePage />} />
        <Route path="storage/:id" element={<StorageDetailPage />} />
        <Route path="booking" element={<BookingWizardPage />} />
        <Route path="reservation/:id" element={<ReservationPage />} />
      </Route>
      <Route path="booking/confirmation/:id" element={<BookingConfirmationPage />} />
      <Route path="reservation/confirmation" element={<Navigate to="/booking" replace />} />
      <Route path="account/login" element={<AuthPage mode="login" />} />
      <Route path="account/register" element={<AuthPage mode="register" />} />
      <Route path="login" element={<Navigate to="/account/login" replace />} />
      <Route path="register" element={<Navigate to="/account/register" replace />} />
      <Route path="account/reservations" element={<Navigate to="/customer/reservations" replace />} />
    </Route>
    <Route path="portal/login" element={<PortalLoginPage />} />
    <Route path="customer" element={<CustomerLayout />}>
      <Route index element={<CustomerDashboardPage />} />
      <Route path="reservations" element={<CustomerReservationsPage />} />
      <Route path="reservations/:id" element={<CustomerReservationDetailPage />} />
      <Route path="rentals" element={<CustomerRentalsPage />} />
      <Route path="contracts" element={<CustomerContractsPage />} />
      <Route path="payments" element={<CustomerPaymentsPage />} />
      <Route path="appointments" element={<CustomerAppointmentsPage />} />
      <Route path="renewals" element={<CustomerRenewalsPage />} />
      <Route path="transfers" element={<CustomerFutureModulePage />} />
      <Route path="support" element={<CustomerFutureModulePage />} />
      <Route path="profile" element={<CustomerProfilePage />} />
    </Route>
    <Route element={<RoleGuard allowedRoles={['STAFF']} />}>
      <Route path="staff" element={<StaffLayout />}>
        <Route index element={<StaffOperationsPage />} />
        <Route path="operations" element={<StaffOperationsPage />} />
        <Route path="appointments" element={<StaffAppointmentsPage />} />
        <Route path="check-in" element={<Navigate to="/staff/appointments" replace />} />
        <Route path="rentals" element={<StaffRentalsPage />} />
        <Route path="returns" element={<StaffReturnsPage />} />
      </Route>
    </Route>
    <Route element={<RoleGuard allowedRoles={['MANAGER', 'ADMIN']} />}>
      <Route path="manager" element={<ManagerLayout />}>
        <Route index element={<ManagerDashboardPage />} />
        <Route path="inquiries" element={<ManagerInquiriesPage />} />
        <Route path="inquiries/:id" element={<ManagerInquiryDetailPage />} />
        <Route path="reservations" element={<ManagerReservationsPage />} />
        <Route path="reservations/:id" element={<ManagerReservationDetailPage />} />
        <Route path="units" element={<ManagerUnitsPage />} />
        <Route path="units/:id" element={<ManagerUnitDetailPage />} />
        <Route path="inventory" element={<Navigate to="/manager/units" replace />} />
        <Route path="customers" element={<ManagerCustomersPage />} />
        <Route path="customers/:id" element={<ManagerCustomerDetailPage />} />
        <Route path="reports" element={<ManagerReportsPage />} />
        <Route path="operations/:resource" element={<ManagerResourcePage />} />
        <Route path="operations/:resource/:id" element={<ManagerResourceDetailPage />} />
      </Route>
    </Route>
    <Route element={<RoleGuard allowedRoles={['ADMIN']} />}>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="users" replace />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
