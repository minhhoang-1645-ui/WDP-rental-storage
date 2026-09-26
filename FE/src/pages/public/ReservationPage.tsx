import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { getStorageListing } from '../../data/storage'

export function ReservationPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  if (!id || !getStorageListing(id)) return <Navigate to="/storage" replace />
  const bookingParams = new URLSearchParams({ product: id })
  const date = params.get('date')
  const duration = params.get('duration')
  if (date) bookingParams.set('date', date)
  if (duration && ['1', '3', '6', '12'].includes(duration)) bookingParams.set('duration', duration)
  return <Navigate to={`/booking?${bookingParams}`} replace />
}
