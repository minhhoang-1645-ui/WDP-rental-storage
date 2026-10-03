import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/auth-context'
import { Container } from '../../components/ui/Container'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const returnTo = params.get('returnTo')?.startsWith('/') ? params.get('returnTo')! : '/customer'
  const roleDestination = user?.role === 'MANAGER' ? '/manager/inquiries' : user?.role === 'STAFF' ? '/staff' : user?.role === 'ADMIN' ? '/admin' : returnTo
  if (user) return <Navigate to={roleDestination} replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      if (mode === 'register') {
        await register({
          fullName: String(data.get('fullName')),
          phone: String(data.get('phone')),
          email: String(data.get('email')),
          password: String(data.get('password')),
        })
      } else {
        await login({ email: String(data.get('email')), password: String(data.get('password')) })
      }
      navigate(returnTo, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể xác thực tài khoản.')
    } finally {
      setSubmitting(false)
    }
  }

  const otherPath = mode === 'login' ? '/account/register' : '/account/login'
  return <section className="auth-page"><Container className="max-w-lg">
    <Link to="/booking?step=3" className="inline-flex items-center gap-2 text-sm font-semibold text-navy"><ArrowLeft size={17} /> Quay lại đặt kho</Link>
    <form className="auth-panel" onSubmit={submit}>
      <span className="auth-icon"><LockKeyhole size={24} /></span>
      <p className="eyebrow">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</p>
      <h1>{mode === 'login' ? 'Tiếp tục yêu cầu đặt kho' : 'Tạo tài khoản khách hàng'}</h1>
      <p>Draft đặt kho đang được giữ nguyên trên trình duyệt này.</p>
      {error && <div className="booking-alert is-error" role="alert">{error}</div>}
      <div className="mt-7 grid gap-5">
        {mode === 'register' && <><label className="field-label">Họ và tên<input name="fullName" autoComplete="name" minLength={2} required /></label><label className="field-label">Số điện thoại<input name="phone" type="tel" autoComplete="tel" minLength={8} required /></label></>}
        <label className="field-label">Email<input name="email" type="email" autoComplete="email" required /></label>
        <label className="field-label">Mật khẩu<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /><small>Tối thiểu 8 ký tự.</small></label>
      </div>
      <button className="button-primary mt-7 w-full justify-center" type="submit" disabled={submitting}>{submitting ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'} <ArrowRight size={18} /></button>
      <p className="auth-switch">{mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'} <Link to={`${otherPath}?returnTo=${encodeURIComponent(returnTo)}`}>{mode === 'login' ? 'Đăng ký' : 'Đăng nhập'}</Link></p>
      <p className="auth-disclosure">Tài khoản được lưu trong hệ thống; phiên đăng nhập hiện có thể hết hạn khi backend khởi động lại.</p>
    </form>
  </Container></section>
}

