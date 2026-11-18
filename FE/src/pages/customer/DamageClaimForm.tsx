import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { EntitySelect } from '../../components/EntitySelect';
import { LoadState, Modal } from '../../components/manager/PortalUi';
import { vietnamCalendarDate } from '../../utils/business-date';

type Contract = { id: string; status: string; contractCode: string; storageUnit?: { unitCode: string } };
type Item = { id: string; name: string; unit: string; balance: number };

export function DamageClaimForm({ close, saved }: { close: () => void; saved: (id: string) => void }) {
  const { user } = useAuth();
  const contracts = usePaginatedResource<Contract>('/customer/contracts', user?.id);
  const [contract, setContract] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [links, setLinks] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const items = useApiResource<Item[]>(contract ? `/customer/stored-items?rentalContractId=${encodeURIComponent(contract)}` : null, user?.id);
  const eligible = contracts.data?.items.filter(row => row.status === 'ACTIVE') ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const report = await mutate<{ id: string }>('/customer/damage-claims', 'POST', {
        rentalContractId: contract, description, discoveredOn: date, estimatedValue: amount ? Number(amount) : null,
        storedItemIds: selected, evidenceLinks: links.split('\n').map(link => link.trim()).filter(Boolean),
      }, true);
      saved(report.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa gửi được báo cáo.'); }
    finally { locked.current = false; setBusy(false); }
  }

  return <Modal title="Báo sự cố" onClose={close} busy={busy}>
    <form className="portal-form claims-dialog-form" onSubmit={submit}>
      <LoadState loading={contracts.loading} error={contracts.error} retry={contracts.refresh} />
      <div className="claims-fields">
        <label className="field-label">Kho và hợp đồng
          <EntitySelect required aria-label="Kho và hợp đồng" value={contract} disabled={busy} onValueChange={value => { setContract(value); setSelected([]); }}>
            <option value="">Chọn kho đang thuê</option>
            {eligible.map(row => <option key={row.id} value={row.id}>{row.storageUnit?.unitCode} · {row.contractCode}</option>)}
          </EntitySelect>
        </label>
        <label className="field-label">Ngày phát hiện<input type="date" required value={date} max={vietnamCalendarDate()} disabled={busy} onChange={event => setDate(event.target.value)} /></label>
      </div>
      {contracts.data && !eligible.length && <p>Bạn chưa có hợp đồng đủ điều kiện báo sự cố.</p>}
      <label className="field-label">Mô tả sự cố<textarea required minLength={10} maxLength={3000} rows={3} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
      {contract && <fieldset className="claims-items">
        <legend>Hàng bị ảnh hưởng</legend>
        <LoadState loading={items.loading} error={items.error} retry={items.refresh} />
        {items.data?.length === 0 && <p>Ghi tên và số lượng hàng trong mô tả nếu hàng đã lấy ra.</p>}
        {items.data?.map(item => <label key={item.id} className="portal-checkbox">
          <input type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={event => setSelected(values => event.target.checked ? [...values, item.id] : values.filter(id => id !== item.id))} />
          {item.name} · {item.balance} {item.unit}
        </label>)}
      </fieldset>}
      <label className="field-label">Giá trị bạn ước tính (đ, tùy chọn)<input type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></label>
      <label className="field-label">Liên kết chứng cứ (tùy chọn)<textarea value={links} rows={2} maxLength={16000} placeholder="Mỗi dòng một liên kết HTTPS" disabled={busy} onChange={event => setLinks(event.target.value)} /></label>
      {error && <p role="alert" className="booking-alert is-error">{error}</p>}
      <div className="portal-actions"><button type="button" className="button-secondary" disabled={busy} onClick={close}>Hủy</button><button className="button-primary" disabled={busy || !contract}>{busy ? 'Đang gửi…' : 'Gửi báo sự cố'}</button></div>
    </form>
  </Modal>;
}
