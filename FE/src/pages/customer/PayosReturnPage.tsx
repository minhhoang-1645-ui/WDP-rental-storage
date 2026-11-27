import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

export function PayosReturnPage({ mobile = false }: { mobile?: boolean }) {
  const [params] = useSearchParams();
  const invoiceId = params.get('invoiceId') ?? '';
  const transaction = params.get('transaction') ?? '';
  const valid = [invoiceId, transaction].every(value => /^[\w-]{1,100}$/.test(value));
  const appUrl = valid ? 'wdp-storage://customer/payment-result?' + new URLSearchParams({ invoiceId, transaction }) : undefined;
  useEffect(() => {
    if (mobile && appUrl) window.location.assign(appUrl);
  }, [appUrl, mobile]);
  return <main className="nestbox-mobile-return">
    <h1>Quay lại NestBox</h1>
    <p>NestBox kiểm tra khoản thu từ payOS. Bạn có thể xem trạng thái mới nhất trong hóa đơn.</p>
    {mobile && appUrl ? <a href={appUrl}>Mở ứng dụng NestBox</a> : <Link to="/customer/payments">Xem hóa đơn</Link>}
  </main>;
}
