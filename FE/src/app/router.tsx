import { Navigate, Route, Routes } from 'react-router-dom'
import { PortalPlaceholder } from '../components/layout/PortalPlaceholder'
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
import { PortalLoginPage } from '../pages/portal/PortalLoginPage'
import { CustomerLayout } from '../components/customer/CustomerLayout'
import { CustomerDashboardPage } from '../pages/customer/CustomerDashboardPage'
import { CustomerFutureModulePage } from '../pages/customer/CustomerFutureModulePage'
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
      <Route path="rentals" element={<CustomerFutureModulePage />} />
      <Route path="contracts" element={<CustomerFutureModulePage />} />
      <Route path="payments" element={<CustomerFutureModulePage />} />
      <Route path="appointments" element={<CustomerFutureModulePage />} />
      <Route path="renewals" element={<CustomerFutureModulePage />} />
      <Route path="transfers" element={<CustomerFutureModulePage />} />
      <Route path="support" element={<CustomerFutureModulePage />} />
      <Route path="profile" element={<CustomerProfilePage />} />
    </Route>
    <Route path="staff/*" element={<PortalPlaceholder role="Nhân viên" />} />
    <Route path="manager" element={<ManagerLayout />}>
      <Route index element={<Navigate to="inquiries" replace />} />
      <Route path="inquiries" element={<ManagerInquiriesPage />} />
      <Route path="inquiries/:id" element={<ManagerInquiryDetailPage />} />
    </Route>
    <Route path="admin/*" element={<PortalPlaceholder role="Quản trị viên" />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

