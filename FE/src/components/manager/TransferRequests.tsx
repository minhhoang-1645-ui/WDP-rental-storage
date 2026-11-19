import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mutate } from '../../services/portal';
import { DetailDisclosure } from '../workspace/DetailDisclosure';
import { first, rows, type Row } from './portal-data';

export function TransferIntake({ row, from }: { row: Row; from: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const existing = first(rows(row.transfers)[0] ?? {}, 'id');
  const destination = (id: string) => `/manager/operations/transfers/${encodeURIComponent(id)}${from ? '?' + new URLSearchParams({ from }) : ''}`;
  if (existing) return <Link className="button-secondary" to={destination(existing)}>Mở hồ sơ chuyển kho</Link>;
  if (row.status === 'RESOLVED') return null;
  async function open() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const transfer = await mutate<{ id: string }>(`/manager/transfers/intake/${encodeURIComponent(first(row, 'id'))}`, 'POST');
      void navigate(destination(transfer.id), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể mở hồ sơ chuyển kho.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return <div className="portal-form">
    <button type="button" className="button-primary" disabled={busy} onClick={() => void open()}>{busy ? 'Đang mở…' : 'Mở để xét yêu cầu cũ'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function CompletedTransferSync({ row, refresh }: { row: Row; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const supportId = first(row, 'supportRequest.id')
  const synced = !supportId || first(row, 'supportRequest.status') === 'RESOLVED' && first(row, 'supportRequest.resolutionType') !== 'TRANSFER_RECOMMENDED'
  const needsSync = !synced || row.sourceMaintenanceMissing === true
  const sync = async () => { if (busy) return; setBusy(true); setError(''); try { await mutate(`/staff/transfers/${encodeURIComponent(first(row, 'id'))}/complete`, 'POST', undefined, true); refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa đồng bộ được kết quả. Vui lòng thử lại.') } finally { setBusy(false) } }
  if (!needsSync) return null
  return <DetailDisclosure title="Đồng bộ hồ sơ cũ">
    <button className="button-secondary" disabled={busy} onClick={() => void sync()}>{busy ? 'Đang đồng bộ…' : synced ? 'Đồng bộ bảo trì kho nguồn' : 'Đồng bộ kết quả cho khách'}</button>
    {error && <p role="alert">{error}</p>}
  </DetailDisclosure>
}
