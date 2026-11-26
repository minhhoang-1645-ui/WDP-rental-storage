import { ServiceCalendarPage } from '../pages/operations/ServiceCalendarPage';
import { StaffShiftsPage } from '../pages/operations/StaffShiftsPage';
import { AdminRolesPage } from '../pages/admin/AccountRole';
import { AdminFacilityAccessPage } from '../pages/admin/AdminFacilityAccessPage';
import { OperationsLayout } from '../pages/operations/OperationsLayout';
import { OperationsPolicies, OperationsPricing } from '../pages/operations/OperationsPages';
import { OperationsFacilities } from '../pages/operations/OperationsFacilities';
import { OperationsBusinessReport } from '../pages/operations/OperationsBusinessPages';
import { OperationsDashboardPage } from '../pages/operations/OperationsDashboardPage';
import { OperationsCatalog, OperationsCatalogDetail } from '../pages/operations/OperationsCatalogPage';
import { DamageClaimsPage } from '../pages/customer/DamageClaimsPage';
import { OverstayPage } from '../pages/manager/OverstayPage';
import { CustomerBookingHistoryPage } from '../pages/customer/CustomerBookingHistoryPage';
import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import { RoleGuard } from "../components/layout/RoleGuard";
import { CustomerBookingGuard } from "../components/layout/CustomerBookingGuard";
import { PublicLayout } from "../components/layout/PublicLayout";
import { CatalogRouteLayout } from "../components/layout/CatalogRouteLayout";
import { AuthPage } from "../pages/account/AuthPage";
import { ForgotPasswordPage, ResetPasswordPage } from '../pages/account/PasswordRecoveryPage';
import { BookingConfirmationPage } from "../pages/public/BookingConfirmationPage";
import { BookingWizardPage } from "../pages/public/BookingWizardPage";
import { ClaimBookingPage } from '../pages/public/ClaimBookingPage';
import { LandingPage } from "../pages/public/LandingPage";
import { FacilitiesPage } from "../pages/public/FacilitiesPage";
import { ReservationPage } from "../pages/public/ReservationPage";
import { SizeGuidePage } from "../pages/public/SizeGuideExperiencePage";
import { StorageDetailPage } from "../pages/public/StorageDetailPage";
import { StoragePage } from "../pages/public/StoragePage";
import { ManagerLayout } from "../pages/manager/ManagerLayout";
import { ManagerUnitsPage } from "../pages/manager/ManagerUnitsPage";
import { ManagerUnitDetailPage } from "../pages/manager/ManagerUnitDetailPage";
import { ManagerCustomersPage } from "../pages/manager/ManagerCustomersPage";
import { ManagerCustomerDetailPage } from "../pages/manager/ManagerCustomerDetailPage";
import { ManagerReservationDetailPage } from "../pages/manager/ManagerReservationDetailPage";
import { ManagerReportsPage, ManagerReportsRedirect } from "../pages/manager/ManagerReportsPage";
import { ManagerDashboardPage } from "../pages/manager/ManagerDashboardPage";
import { ManagerAssignmentsPage } from "../pages/manager/ManagerAssignmentsPage";
import { managerFinanceReviewPath, type FinanceReviewType } from '../utils/manager-finance-review';
import { ManagerStaffPage } from '../pages/manager/ManagerStaffPage';
import { ManagerEarlyReturnsPage } from '../pages/manager/ManagerEarlyReturnsPage';
import { ManagerResourcePage } from "../pages/manager/ManagerResourcePage";
import { ManagerResourceDetailPage } from "../pages/manager/ManagerResourceDetailPage";
import { StaffLayout, staffSections } from "../pages/staff/StaffLayout";
import { StaffOperationsPage } from "../pages/staff/StaffOperationsPage";
import { StaffTasksPage } from "../pages/staff/StaffTasksPage";
import { StaffIssueReportPage } from "../pages/staff/StaffIssueReportPage";
import { ManagerListPage } from "../pages/manager/ManagerListPage";
import { ManagerDetailPage } from "../pages/manager/ManagerDetailPage";
import { staffWorkflows } from "../utils/operation-access";
import { WorkspaceNotFound } from "../components/layout/WorkspaceNotFound";
import { AdminLayout, adminSections } from "../pages/admin/AdminLayout";
import { AdminAccountDetailPage } from "../pages/admin/AdminAccountDetailPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminAccountsPage } from "../pages/admin/AdminAccountsPage";
import { AdminAuditPage } from '../pages/admin/AdminAuditPage';
import { ManagerCatalogPage } from "../pages/manager/ManagerCatalogPage";
import { ManagerAdditionalServicesPage } from '../pages/manager/ManagerAdditionalServicesPage';
import { CustomerLayout, customerSections } from "../components/customer/CustomerLayout";
import { WorkspaceSectionPage } from "../components/workspace/WorkspaceSectionPage";
import { CustomerDashboardPage } from "../pages/customer/CustomerDashboardPage";
import { CustomerAppointmentsPage } from "../pages/customer/CustomerAppointmentsPage";
import { CustomerContractsPage } from "../pages/customer/CustomerContractsPage";
import { CustomerPaymentsPage } from "../pages/customer/CustomerPaymentsPage";
import { CustomerVnpayReturnPage } from "../pages/customer/CustomerVnpayReturnPage";
import { MobileVnpayReturnPage } from "../pages/customer/MobileVnpayReturnPage";
import { CustomerRenewalsPage } from "../pages/customer/CustomerRenewalsPage";
import { CustomerRentalsPage } from "../pages/customer/CustomerRentalsPage";
import { CustomerReturnsPage } from "../pages/customer/CustomerReturnsPage";
import { CustomerSupportPage } from "../pages/customer/CustomerSupportPage";
import { CustomerTransfersPage } from "../pages/customer/CustomerTransfersPage";
import { AccountSettingsPage } from "../pages/account/AccountSettingsPage";
import { CustomerReservationDetailPage } from "../pages/customer/CustomerReservationDetailPage";
import { CustomerReservationsPage } from "../pages/customer/CustomerReservationsPage";
import { StockMovementsPage, StoredItemsPage } from '../pages/stock/StockMovementsPage';
import { ActivityInboxPage } from '../activity/ActivityCenter';
import { ManagerSectionPage } from '../pages/manager/ManagerSectionPage';

function LegacyFinanceRedirect({ kind }: { kind: FinanceReviewType }) {
  const [params] = useSearchParams();
  const { '*': pathRecord } = useParams();
  const { state } = useLocation();
  const record = params.get('record') || pathRecord || '';
  return <Navigate replace to={managerFinanceReviewPath(kind, record, params.get('invoiceId') ?? '', params.get('from') ?? '')} state={state} />;
}

function operationalRoutes(base: string) {
  return (
    <>
      <Route index element={<ManagerDashboardPage />} />
      <Route path="reviews" element={<ManagerSectionPage section="reviews" />} />
      <Route path="finance" element={<ManagerSectionPage section="finance" />} />
      <Route path="rental-records" element={<ManagerSectionPage section="rental-records" />} />
      <Route path="facility" element={<ManagerSectionPage section="facility" />} />
      <Route path="notifications" element={<ActivityInboxPage />} />
      <Route path="payment-submissions/*" element={<LegacyFinanceRedirect kind="submissions" />} />
      <Route path="operations/payment-submissions/*" element={<LegacyFinanceRedirect kind="submissions" />} />
      <Route path="early-returns" element={<ManagerEarlyReturnsPage />} />
      <Route path="online-payment-reconciliations/*" element={<LegacyFinanceRedirect kind="reconciliation" />} />
      <Route path="operations/online-payment-reconciliations/*" element={<LegacyFinanceRedirect kind="reconciliation" />} />
      <Route path="units" element={<ManagerUnitsPage />} />
      <Route path="catalog" element={<ManagerCatalogPage />} />
      <Route path="catalog/additional-services" element={<ManagerAdditionalServicesPage />} />
      <Route path="units/:id" element={<ManagerUnitDetailPage />} />
      <Route
        path="inventory"
        element={<Navigate to={`${base}/units`} replace />}
      />
      <Route path="customers" element={<ManagerCustomersPage />} />
      <Route path="customers/:id" element={<ManagerCustomerDetailPage />} />
      <Route path="reports" element={<ManagerReportsPage />} />
      <Route path="reports/details" element={<ManagerReportsRedirect />} />
      <Route path="operations/:resource" element={<ManagerResourcePage />} />
      <Route
        path="operations/:resource/:id"
        element={<ManagerResourceDetailPage />}
      />
      <Route path="*" element={<WorkspaceNotFound />} />
    </>
  );
}

function LegacyLoginRedirect() {
  const location = useLocation();
  return <Navigate to={{pathname:'/account/login',search:location.search,hash:location.hash}} state={location.state} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/customer/payments/vnpay-return/mobile/:invoiceId" element={<MobileVnpayReturnPage />} />
      <Route element={<PublicLayout />}>
        <Route path="claim-booking" element={<ClaimBookingPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route element={<CatalogRouteLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="facilities" element={<FacilitiesPage />} />
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
        <Route path="portal/login" element={<LegacyLoginRedirect />} />
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
      <Route path="customer" element={<CustomerLayout />}>
        <Route path="sections/:section" element={<WorkspaceSectionPage sections={customerSections} />} />
        <Route index element={<CustomerDashboardPage />} />
        <Route path="notifications" element={<ActivityInboxPage />} />
        <Route path="reservations" element={<CustomerReservationsPage />} />
        <Route
          path="reservations/:id"
          element={<CustomerReservationDetailPage />}
        />
        <Route path="rentals" element={<CustomerRentalsPage />} />
        <Route path="damage-claims" element={<DamageClaimsPage />} />
          <Route path="booking-history" element={<CustomerBookingHistoryPage />} />
        <Route path="stock-movements" element={<StockMovementsPage role="STORAGE_CUSTOMER" />} />
        <Route path="stock-movements/:id" element={<StockMovementsPage role="STORAGE_CUSTOMER" />} />
        <Route path="stored-items" element={<StoredItemsPage />} />
        <Route path="contracts" element={<CustomerContractsPage />} />
        <Route path="payments" element={<CustomerPaymentsPage />} />
        <Route path="payments/vnpay-return" element={<CustomerVnpayReturnPage />} />
        <Route path="appointments" element={<CustomerAppointmentsPage />} />
        <Route path="renewals" element={<CustomerRenewalsPage />} />
        <Route path="returns" element={<CustomerReturnsPage />} />
        <Route path="transfers" element={<CustomerTransfersPage />} />
        <Route path="support" element={<CustomerSupportPage />} />
        <Route path="profile" element={<AccountSettingsPage />} />
        <Route path="settings/:section?" element={<AccountSettingsPage />} />
        <Route path="*" element={<WorkspaceNotFound />} />
      </Route>
      <Route element={<RoleGuard allowedRoles={["FACILITY_STAFF"]} />}>
        <Route path="staff" element={<StaffLayout />}>
          <Route path="settings/:section?" element={<AccountSettingsPage />} />
          <Route path="sections/:section" element={<WorkspaceSectionPage sections={staffSections} />} />
          <Route index element={<StaffOperationsPage />} />
          <Route path="tasks" element={<StaffTasksPage />} />
          <Route path="schedule" element={<StaffTasksPage view="schedule" />} />
          <Route path="history" element={<StaffTasksPage view="history" />} />
          <Route path="report-issue" element={<StaffIssueReportPage />} />
          <Route path="notifications" element={<ActivityInboxPage />} />
          <Route path="damage-claims" element={<DamageClaimsPage />} />
          <Route path="stored-items/*" element={<Navigate to="/staff/tasks" replace />} />
          <Route path="overstays" element={<Navigate to="/staff/tasks" replace />} />
          <Route path="unit-checks" element={<Navigate to="/staff/tasks" replace />} />
          <Route path="stock-movements/*" element={<Navigate to="/staff/tasks" replace />} />
          <Route path="operations" element={<StaffOperationsPage />} />
          <Route path="inquiries/*" element={<Navigate to="/staff/appointments" replace />} />
          <Route path="operations/inquiries/*" element={<Navigate to="/staff/appointments" replace />} />
          <Route path="reservations" element={<Navigate to="/staff/appointments" replace />} />
          <Route path="reservations/:id" element={<ManagerReservationDetailPage />} />
          {staffWorkflows.map(resource => <Route key={resource} path={resource}>
            <Route index element={<ManagerListPage key={resource} resource={resource} />} />
            <Route path=":id" element={<ManagerDetailPage key={resource} resource={resource} />} />
          </Route>)}
          <Route path="rentals/*" element={<Navigate to="/staff/tasks" replace />} />
          <Route path="operations/stock-movements/*" element={<Navigate to="/staff/tasks" replace />} />
          <Route path="operations/rentals/*" element={<Navigate to="/staff/tasks" replace />} />
          <Route path="operations/:resource" element={<ManagerResourcePage />} />
          <Route path="operations/:resource/:id" element={<ManagerResourceDetailPage />} />
          <Route path="check-in" element={<Navigate to="/staff/shifts" replace />} />
          <Route path="shifts" element={<StaffShiftsPage />} />
          <Route path="*" element={<WorkspaceNotFound />} />
        </Route>
      </Route>
      <Route element={<RoleGuard allowedRoles={["FACILITY_MANAGER"]} />}>
        <Route path="manager" element={<ManagerLayout />}>
          <Route path="settings/:section?" element={<AccountSettingsPage />} />
          <Route path="damage-claims" element={<DamageClaimsPage />} />
          <Route path="assignments" element={<ManagerAssignmentsPage />} />
          <Route path="shifts" element={<StaffShiftsPage manager />} />
          <Route path="service-calendar" element={<ServiceCalendarPage />} />
          <Route path="staff" element={<ManagerStaffPage />} />
          <Route path="stored-items/*" element={<Navigate to="/manager/units" replace />} />
          <Route path="stock-movements/*" element={<Navigate to="/manager/assignments" replace />} />
          <Route path="operations/stock-movements/*" element={<Navigate to="/manager/assignments" replace />} />
          <Route path="overstays" element={<OverstayPage />} />
          <Route path="reservations" element={<ManagerListPage resource="reservations" />} />
          <Route path="operations/reservations" element={<Navigate to="/manager/reservations" replace />} />
          <Route path="reservations/:id" element={<ManagerReservationDetailPage />} />
          {operationalRoutes("/manager")}
        </Route>
      </Route>
      <Route element={<RoleGuard allowedRoles={["BUSINESS_OPERATIONS_MANAGER"]} />}>
        <Route path="operations" element={<OperationsLayout />}>
          <Route index element={<OperationsDashboardPage />} />
          <Route path="facilities/:facilityId?" element={<OperationsFacilities />} />
          <Route path="policies" element={<OperationsPolicies />} />
          <Route path="pricing" element={<OperationsPricing />} />
          <Route path="catalog" element={<OperationsCatalog />} />
          <Route path="catalog/:serviceId" element={<OperationsCatalogDetail />} />
          <Route path="reports" element={<OperationsBusinessReport />} />
          <Route path="audit" element={<Navigate to="/operations" replace />} />
          <Route path="settings/:section?" element={<AccountSettingsPage />} />
          <Route path="*" element={<WorkspaceNotFound />} />
        </Route>
      </Route>
      <Route element={<RoleGuard allowedRoles={["SYSTEM_ADMINISTRATOR"]} />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route path="sections/:section" element={<WorkspaceSectionPage sections={adminSections} />} />
          <Route path="login-history" element={<AdminAuditPage key="login" category="LOGIN" />} />
          <Route path="activity" element={<AdminAuditPage key="activity" category="ACTIVITY" />} />
          <Route path="roles" element={<AdminRolesPage />} />
          <Route path="permission-history" element={<AdminAuditPage key="permissions" category="ACTIVITY" permissions />} />
          <Route index element={<AdminDashboardPage />} />
          <Route path="notifications" element={<ActivityInboxPage />} />
          <Route path="users" element={<AdminAccountsPage />} /><Route path="facility-access" element={<AdminFacilityAccessPage/>}/>
          <Route path="users/:id" element={<AdminAccountDetailPage />} />
          <Route path="assignments" element={<Navigate to="/admin" replace />} />
          <Route
            path="account-status"
            element={<Navigate to="/admin/users" replace />}
          />
          <Route path="settings/:section?" element={<AccountSettingsPage />} />
          <Route path="facility/assignments" element={<Navigate to="/admin" replace />} />
          <Route path="facility/*" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<WorkspaceNotFound />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
