import { Navigate, Route, Routes } from 'react-router-dom'
import { PortalPlaceholder } from '../components/layout/PortalPlaceholder'
import { PublicLayout } from '../components/layout/PublicLayout'
import { AuthPage } from '../pages/account/AuthPage'
import { MyReservationsPage } from '../pages/account/MyReservationsPage'
import { BookingConfirmationPage } from '../pages/public/BookingConfirmationPage'
import { BookingWizardPage } from '../pages/public/BookingWizardPage'
import { LandingPage } from '../pages/public/LandingPage'
import { ReservationPage } from '../pages/public/ReservationPage'
import { SizeGuidePage } from '../pages/public/SizeGuideExperiencePage'
import { StorageDetailPage } from '../pages/public/StorageDetailPage'
import { StoragePage } from '../pages/public/StoragePage'

export function AppRouter() {
  return <Routes>
    <Route element={<PublicLayout />}>
      <Route index element={<LandingPage />} />
      <Route path="size-guide" element={<SizeGuidePage />} />
      <Route path="storage" element={<StoragePage />} />
      <Route path="storage/:id" element={<StorageDetailPage />} />
      <Route path="booking" element={<BookingWizardPage />} />
      <Route path="booking/confirmation/:id" element={<BookingConfirmationPage />} />
      <Route path="reservation/confirmation" element={<Navigate to="/booking" replace />} />
      <Route path="reservation/:id" element={<ReservationPage />} />
      <Route path="account/login" element={<AuthPage mode="login" />} />
      <Route path="account/register" element={<AuthPage mode="register" />} />
      <Route path="account/reservations" element={<MyReservationsPage />} />
    </Route>
    <Route path="customer" element={<Navigate to="/account/reservations" replace />} />
    <Route path="customer/*" element={<Navigate to="/account/reservations" replace />} />
    <Route path="staff/*" element={<PortalPlaceholder role="Nhân viên" />} />
    <Route path="manager/*" element={<PortalPlaceholder role="Quản lý" />} />
    <Route path="admin/*" element={<PortalPlaceholder role="Quản trị viên" />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

