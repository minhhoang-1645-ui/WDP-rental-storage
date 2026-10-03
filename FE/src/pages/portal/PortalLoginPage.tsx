import { LockKeyhole, LogIn } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'

function destination(role: 'CUSTOMER' | 'STAFF' | 'MANAGER' | 'ADMIN') {
  if (role === 'MANAGER') return '/manager/inquiries'
  if (role === 'STAFF') return '/staff'
  if (role === 'ADMIN') return '/admin'
  return '/customer'
}

export function PortalLoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) navigate(destination(user.role), { replace: true })
  }, [navigate, user])

  if (loading) return <main className="portal-login"><p>Đang kiểm tra phiên đăng nhập…</p></main>
  if (user) return <Navigate to={destination(user.role)} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login({ email, password })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="portal-login">
    <form className="portal-login-panel" onSubmit={submit}>
      <div className="portal-mark"><LockKeyhole size={22} /></div>
      <p className="eyebrow">WDP Storage Portal</p>
      <h1>Đăng nhập nội bộ</h1>
      <p>Dành cho tài khoản nhân viên, quản lý và quản trị viên đã được cấp quyền.</p>
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      <label className="field-label">Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label className="field-label">Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button className="button-primary w-full justify-center" disabled={submitting}>{submitting ? 'Đang đăng nhập…' : <><LogIn size={18} /> Đăng nhập</>}</button>
      <small>Không có đăng ký công khai cho tài khoản nội bộ.</small>
    </form>
  </main>
}
