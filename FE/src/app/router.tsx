import { Navigate, Route, Routes } from "react-router-dom";
import { RoleGuard } from "../components/layout/RoleGuard";
import { CustomerBookingGuard } from "../components/layout/CustomerBookingGuard";
import { PublicLayout } from "../components/layout/PublicLayout";
import { CatalogRouteLayout } from "../components/layout/CatalogRouteLayout";
import { AuthPage } from "../pages/account/AuthPage";
import { BookingConfirmationPage } from "../pages/public/BookingConfirmationPage";
import { BookingWizardPage } from "../pages/public/BookingWizardPage";
import { LandingPage } from "../pages/public/LandingPage";
import { ReservationPage } from "../pages/public/ReservationPage";
import { SizeGuidePage } from "../pages/public/SizeGuideExperiencePage";
import { StorageDetailPage } from "../pages/public/StorageDetailPage";
import { StoragePage } from "../pages/public/StoragePage";
import { ManagerInquiryDetailPage } from "../pages/manager/ManagerInquiryDetailPage";
import { ManagerInquiriesPage } from "../pages/manager/ManagerInquiriesPage";
import { ManagerPaymentSubmissionsPage } from "../pages/manager/ManagerPaymentSubmissionsPage";
import { ManagerLayout } from "../pages/manager/ManagerLayout";
import { ManagerUnitsPage } from "../pages/manager/ManagerUnitsPage";
import { ManagerUnitDetailPage } from "../pages/manager/ManagerUnitDetailPage";
import { ManagerCustomersPage } from "../pages/manager/ManagerCustomersPage";
import { ManagerCustomerDetailPage } from "../pages/manager/ManagerCustomerDetailPage";
import { ManagerReservationsPage } from "../pages/manager/ManagerReservationsPage";
import { ManagerReservationDetailPage } from "../pages/manager/ManagerReservationDetailPage";
import { ManagerReportsPage } from "../pages/manager/ManagerReportsPage";
import { ManagerDashboardPage } from "../pages/manager/ManagerDashboardPage";
import { ManagerResourcePage } from "../pages/manager/ManagerResourcePage";
import { ManagerResourceDetailPage } from "../pages/manager/ManagerResourceDetailPage";
import { PortalLoginPage } from "../pages/portal/PortalLoginPage";
import { StaffLayout } from "../pages/staff/StaffLayout";
import { StaffOperationsPage } from "../pages/staff/StaffOperationsPage";
import { StaffListPage } from "../pages/staff/StaffListPage";
import { StaffRecordPage } from "../pages/staff/StaffRecordPage";
import { StaffTransfersPage } from "../pages/staff/StaffTransfersPage";
import {
  staffResources,
  type StaffResource,
} from "../pages/staff/staff-resources";
import { WorkspaceNotFound } from "../components/layout/WorkspaceNotFound";
import { AdminLayout } from "../pages/admin/AdminLayout";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage";
import { AdminSettingsPage } from "../pages/admin/AdminSettingsPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminAccountsPage } from "../pages/admin/AdminAccountsPage";
import { AdminRolesPage } from "../pages/admin/AdminRolesPage";
import { AdminAssignmentsPage } from "../pages/admin/AdminAssignmentsPage";
import { AdminActivityPage } from "../pages/admin/AdminActivityPage";
import { ManagerCatalogPage } from "../pages/manager/ManagerCatalogPage";
import { CustomerLayout } from "../components/customer/CustomerLayout";
import { CustomerDashboardPage } from "../pages/customer/CustomerDashboardPage";
import { CustomerAppointmentsPage } from "../pages/customer/CustomerAppointmentsPage";
import { CustomerContractsPage } from "../pages/customer/CustomerContractsPage";
import { CustomerPaymentsPage } from "../pages/customer/CustomerPaymentsPage";
import { CustomerRenewalsPage } from "../pages/customer/CustomerRenewalsPage";
import { CustomerRentalsPage } from "../pages/customer/CustomerRentalsPage";
import { CustomerReturnsPage } from "../pages/customer/CustomerReturnsPage";
import { CustomerSupportPage } from "../pages/customer/CustomerSupportPage";
import { CustomerTransfersPage } from "../pages/customer/CustomerTransfersPage";
import { CustomerProfilePage } from "../pages/customer/CustomerProfilePage";
import { CustomerReservationDetailPage } from "../pages/customer/CustomerReservationDetailPage";
import { CustomerReservationsPage } from "../pages/customer/CustomerReservationsPage";

function operationalRoutes(base: string) {
  return (
    <>
      <Route index element={<ManagerDashboardPage />} />
      <Route path="inquiries" element={<ManagerInquiriesPage />} />
      <Route path="inquiries/:id" element={<ManagerInquiryDetailPage />} />
      <Route path="payment-submissions" element={<ManagerPaymentSubmissionsPage />} />
      <Route path="reservations" element={<ManagerReservationsPage />} />
      <Route
        path="reservations/:id"
        element={<ManagerReservationDetailPage />}
      />
      <Route path="units" element={<ManagerUnitsPage />} />
      <Route path="catalog" element={<ManagerCatalogPage />} />
      <Route path="units/:id" element={<ManagerUnitDetailPage />} />
      <Route
        path="inventory"
        element={<Navigate to={`${base}/units`} replace />}
      />
      <Route path="customers" element={<ManagerCustomersPage />} />
      <Route path="customers/:id" element={<ManagerCustomerDetailPage />} />
      <Route path="reports" element={<ManagerReportsPage />} />
      <Route path="operations/:resource" element={<ManagerResourcePage />} />
      <Route
        path="operations/:resource/:id"
        element={<ManagerResourceDetailPage />}
      />
      <Route path="*" element={<WorkspaceNotFound />} />
    </>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route element={<CatalogRouteLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="size-guide" element={<SizeGuidePage />} />
          <Route path="storage" element={<StoragePage />} />
          <Route path="storage/:id" element={<StorageDetailPage />} />
          <Route path="reservation/:id" element={<ReservationPage />} />
        </Route>
        <Route element={<CustomerBookingGuard />}>
          <Route element={<CatalogRouteLayout />}>
            <Route path="booking" element={<BookingWizardPage />} />
          </Route>
        </Route>
        <Route
          path="booking/confirmation/:id"
          element={<BookingConfirmationPage />}
        />
        <Route
          path="reservation/confirmation"
          element={<Navigate to="/booking" replace />}
        />
        <Route path="account/login" element={<AuthPage mode="login" />} />
        <Route path="account/register" element={<AuthPage mode="register" />} />
        <Route
          path="login"
          element={<Navigate to="/account/login" replace />}
        />
        <Route
          path="register"
          element={<Navigate to="/account/register" replace />}
        />
        <Route
          path="account/reservations"
          element={<Navigate to="/customer/reservations" replace />}
        />
      </Route>
      <Route path="portal/login" element={<PortalLoginPage />} />
      <Route path="customer" element={<CustomerLayout />}>
        <Route index element={<CustomerDashboardPage />} />
        <Route path="reservations" element={<CustomerReservationsPage />} />
        <Route
          path="reservations/:id"
          element={<CustomerReservationDetailPage />}
        />
        <Route path="rentals" element={<CustomerRentalsPage />} />
        <Route path="contracts" element={<CustomerContractsPage />} />
        <Route path="payments" element={<CustomerPaymentsPage />} />
        <Route path="appointments" element={<CustomerAppointmentsPage />} />
        <Route path="renewals" element={<CustomerRenewalsPage />} />
        <Route path="returns" element={<CustomerReturnsPage />} />
        <Route path="transfers" element={<CustomerTransfersPage />} />
        <Route path="support" element={<CustomerSupportPage />} />
        <Route path="profile" element={<CustomerProfilePage />} />
        <Route path="*" element={<WorkspaceNotFound />} />
      </Route>
      <Route element={<RoleGuard allowedRoles={["STAFF"]} />}>
        <Route path="staff" element={<StaffLayout />}>
          <Route index element={<StaffOperationsPage />} />
          <Route path="operations" element={<StaffOperationsPage />} />
          {(Object.keys(staffResources) as StaffResource[]).map((resource) => (
            <Route key={resource} path={resource}>
              <Route
                index
                element={<StaffListPage key={resource} resource={resource} />}
              />
              <Route
                path=":id"
                element={<StaffRecordPage key={resource} resource={resource} />}
              />
            </Route>
          ))}
          <Route
            path="check-in"
            element={<Navigate to="/staff/appointments" replace />}
          />
          <Route path="transfers" element={<StaffTransfersPage />} />
          <Route path="transfers/:id" element={<StaffTransfersPage />} />
          <Route path="*" element={<WorkspaceNotFound />} />
        </Route>
      </Route>
      <Route element={<RoleGuard allowedRoles={["MANAGER", "ADMIN"]} />}>
        <Route path="manager" element={<ManagerLayout />}>
          {operationalRoutes("/manager")}
        </Route>
      </Route>
      <Route element={<RoleGuard allowedRoles={["ADMIN"]} />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="roles" element={<AdminRolesPage />} />
          <Route path="assignments" element={<AdminAssignmentsPage />} />
          <Route path="activity" element={<AdminActivityPage />} />
          <Route
            path="account-status"
            element={<AdminAccountsPage statusOnly />}
          />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="facility">{operationalRoutes("/admin/facility")}</Route>
          <Route path="*" element={<WorkspaceNotFound />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
