import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { apiRequest } from '../../services/api';
import { mutate } from '../../services/portal';
import { CopyRecordCode } from '../workspace/RecordIdentity';
import { DetailDisclosure } from '../workspace/DetailDisclosure';
import { Facts, LoadState, PageHeader } from '../manager/PortalUi';
import { date, money } from '../manager/portal-data';
import { CustomerStatus } from './CustomerPortalUi';
import { SignatureAgreement, type OtpProof, type OtpReceipt } from './SignatureAgreement';
import { DocumentFile } from './DocumentFile';

type Order = {
  id: string;
  transferCode: string;
  status: string;
  commercial: {
    acceptedAt: string | null;
    snapshotHash: string;
    otp?: { emailConfigured: boolean };
    snapshot: {
      code: string;
      from: { code: string; typeName: string };
      to: { code: string; typeName: string };
      currentRate: number;
      newRate: number;
      effectiveFrom: string;
      differencePerMonth: number;
      smaller: boolean;
      futureInvoices: { id: string; newRental: number; previousRental: number }[];
    };
  };
};

export function TransferAddenda() {
  const { user } = useAuth();
  const result = usePaginatedResource<Order>('/customer/transfer-orders', user?.id, true);
  const [params] = useSearchParams();
  const focused = params.get('transfer');
  const items = (result.data?.items ?? []).filter(item => !focused || item.id === focused);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function sign(order: Order, signatureImage: string, proof: OtpProof) {
    setBusy(order.id);
    try {
      await mutate(`/customer/transfer-orders/${encodeURIComponent(order.id)}/accept`, 'POST', {
        agreed: true,
        acceptanceName: user?.fullName,
        snapshotHash: order.commercial.snapshotHash,
        signatureImage,
        ...proof,
      });
      setMessage('Đã ký phụ lục. Nhân viên sẽ phối hợp chuyển hàng và xác nhận kho mới.');
      result.refresh();
    } finally {
      setBusy('');
    }
  }

  if (!focused && !items.length && !result.error) return null;
  return <section className="record-detail-page" aria-label="Phụ lục đổi loại kho">
    {focused && <PageHeader title="Phụ lục chuyển kho"><Link className="button-secondary" to="/customer/transfers">Xem tất cả phụ lục</Link></PageHeader>}
    <LoadState loading={Boolean(focused) && result.loading} error={result.error} retry={result.refresh} layout="detail" />
    {focused && !result.loading && !result.error && !items.length && <p role="status">Phụ lục không còn khả dụng.</p>}
    {message && <p role="status" className="booking-alert">{message}</p>}
    <div className="customer-detail-content record-focused-layout">
      {items.map(order => {
        const terms = order.commercial;
        const document = terms.snapshot;
        const path = '/customer/transfer-orders/' + encodeURIComponent(order.id);
        return <article className="customer-panel" key={order.id}>
          <div className="record-page-title">
            <h2>Đổi kho · {document.from.code} → {document.to.code}</h2>
            <CustomerStatus status={order.status} />
          </div>
          <CopyRecordCode value={order.transferCode} />
          <Facts items={[
            ['Kho đang thuê', `${document.from.code} · ${document.from.typeName}`],
            ['Kho mới', `${document.to.code} · ${document.to.typeName}`],
            ['Giá mới mỗi tháng', money(document.newRate)],
            ['Áp dụng từ', date(document.effectiveFrom)],
          ]} />
          {document.smaller && <p className="booking-alert">Kho mới nhỏ hơn. Hãy kiểm tra kích thước trước khi ký.</p>}
          <DocumentFile path={`/customer/documents/transfer-addenda/${encodeURIComponent(order.id)}`} name={document.code} signed={Boolean(terms.acceptedAt)} />
          {terms.acceptedAt ? <p>Đã ký ngày {date(terms.acceptedAt, true)}. {order.status === 'COMPLETED' ? 'Đã chuyển kho.' : 'Chờ nhân viên chuyển kho.'}</p>
            : order.status === 'APPROVED' && <SignatureAgreement busy={busy === order.id} otpConfigured={terms.otp?.emailConfigured}
              label="Xác thực và ký phụ lục chuyển kho"
              onRequestOtp={signatureImage => apiRequest<OtpReceipt>(path + '/signature-otp', {
                method: 'POST',
                body: JSON.stringify({ agreed: true, acceptanceName: user?.fullName, snapshotHash: terms.snapshotHash, signatureImage }),
              })}
              onSubmit={(signature, proof) => sign(order, signature, proof)} />}
          <DetailDisclosure title="Cách áp dụng giá mới">
            <Facts items={[
              ['Giá hiện tại mỗi tháng', money(document.currentRate)],
              ['Chênh lệch mỗi tháng', `${document.differencePerMonth >= 0 ? 'Tăng' : 'Giảm'} ${money(Math.abs(document.differencePerMonth))}`],
            ]} />
            <p>Kỳ thuê hiện tại và tiền cọc giữ nguyên.</p>
            {document.futureInvoices.length > 0 && <p>{document.futureInvoices.length} hóa đơn chưa thu của các kỳ tiếp theo sẽ được thay thế. Bạn vẫn có thể đối chiếu bản cũ.</p>}
          </DetailDisclosure>
        </article>;
      })}
    </div>
  </section>;
}
