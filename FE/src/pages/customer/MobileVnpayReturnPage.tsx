import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { customerBillingApi } from "../../services/billing";

export function MobileVnpayReturnPage() {
  const { invoiceId = "" } = useParams();
  const { search } = useLocation();
  const appUrl = /^[a-zA-Z0-9_-]{1,100}$/.test(invoiceId)
    ? `wdp-storage://customer/invoices/${invoiceId}`
    : "wdp-storage://customer/invoices";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // Forward the signed return so a cancelled session is closed before reopening the app.
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let mounted = true;
    const verify = search ? customerBillingApi.vnpayReturn(search.slice(1), controller.signal) : Promise.resolve();
    void verify.catch(() => undefined).finally(() => {
      window.clearTimeout(timeout);
      if (mounted) {
        setReady(true);
        window.location.assign(appUrl);
      }
    });
    return () => { mounted = false; window.clearTimeout(timeout); controller.abort(); };
  }, [appUrl, search]);

  return <main className="customer-page vnpay-return-page">
    <section className="vnpay-return-card">
      <h1>Quay lại NestBox</h1>
      <p role="status">{ready ? "Mở ứng dụng để xem kết quả thanh toán." : "Đang chuyển kết quả về ứng dụng…"}</p>
      {ready && <>
        <a className="button-primary" href={appUrl}>Mở ứng dụng NestBox</a>
        <p>Nếu ứng dụng chưa mở, hãy đóng cửa sổ VNPay để quay lại hóa đơn.</p>
      </>}
    </section>
  </main>;
}
