import { useRef, useState, type FormEvent } from 'react';
import { Banknote, ClipboardCheck, UserRoundPlus } from 'lucide-react';
import { useAuth } from '../../auth/auth-context';
import { Facts, Modal, Status } from '../../components/manager/PortalUi';
import { StaffPicker } from '../../components/manager/StaffPicker';
import { money } from '../../components/manager/portal-data';
import { ApiError } from '../../services/api';
import { mutate } from '../../services/portal';
import { claimDate, type Claim, type ClaimRole } from './damage-claims-model';

type Action = 'assign' | 'inspect' | 'decide' | 'notify' | 'resolve' | 'handover';
type ActionProps = { claim: Claim; path: string; saved: (message: string) => void; reload: () => void };
type RoleActionProps = ActionProps & { role: ClaimRole; refreshing: boolean };
const dialogs: Record<Action, [title: string, button: string, success: string]> = {
  assign: ['Phân công kiểm tra', 'Lưu phân công', 'Đã lưu phân công.'],
  inspect: ['Kết quả kiểm tra', 'Lưu kết quả kiểm tra', 'Đã lưu kết quả kiểm tra.'],
  decide: ['Quyết định xử lý', 'Lưu quyết định', 'Đã lưu quyết định.'],
  notify: ['Thông báo kết quả', 'Lưu kết quả đã thông báo', 'Đã ghi nhận thông báo kết quả.'],
  resolve: ['Hoàn tất hồ sơ', 'Hoàn tất hồ sơ', 'Đã hoàn tất hồ sơ.'],
  handover: ['Ghi nhận đã giao tiền', 'Xác nhận đã giao tiền', 'Đã ghi nhận bàn giao tiền mặt.'],
};

export function ClaimActions({ claim, role, path, saved, reload, refreshing }: RoleActionProps) {
  const [action, setAction] = useState<Action | null>(null);
  const inspecting = ['REPORTED', 'INVESTIGATING'].includes(claim.status);
  const decided = ['APPROVED', 'REJECTED'].includes(claim.status);
  const awaitingCash = claim.compensation?.status === 'AWAITING_HANDOVER';
  if (role === 'CUSTOMER') return null;
  const assign = role === 'MANAGER' && inspecting;
  const inspect = role === 'STAFF' && inspecting;
  const decide = role === 'MANAGER' && claim.status === 'INVESTIGATING' && Boolean(claim.staffFacts);
  const notify = role === 'MANAGER' && decided && awaitingCash && !claim.resolutionNote;
  const resolve = role === 'MANAGER' && decided && !awaitingCash;
  if (!(assign || inspect || decide || notify || resolve)) return null;
  return <div className="portal-actions">
    {assign && <button disabled={refreshing} className={decide ? 'button-secondary' : 'button-primary'} onClick={() => setAction('assign')}><UserRoundPlus size={17} aria-hidden="true" />{claim.assignedStaff ? 'Đổi người kiểm tra' : 'Phân công kiểm tra'}</button>}
    {inspect && <button disabled={refreshing} className={claim.staffFacts ? 'button-secondary' : 'button-primary'} onClick={() => setAction('inspect')}><ClipboardCheck size={17} aria-hidden="true" />{claim.staffFacts ? 'Chỉnh kết quả kiểm tra' : 'Ghi kết quả kiểm tra'}</button>}
    {decide && <button disabled={refreshing} className="button-primary" onClick={() => setAction('decide')}>Quyết định xử lý</button>}
    {notify && <button disabled={refreshing} className="button-secondary" onClick={() => setAction('notify')}>Thông báo kết quả</button>}
    {resolve && <button disabled={refreshing} className="button-primary" onClick={() => setAction('resolve')}>Hoàn tất hồ sơ</button>}
    {action && <ClaimActionDialog action={action} claim={claim} path={path} close={() => setAction(null)} saved={saved} reload={reload} />}
  </div>;
}

export function ClaimCompensation({ claim, role, path, saved, reload, refreshing }: RoleActionProps) {
  const [open, setOpen] = useState(false);
  const payment = claim.compensation;
  if (role === 'STAFF' || !payment || payment.approvedCompensationAmount == null) return null;
  const paid = payment.status === 'HANDED_OVER';
  const facts: [string, string | undefined][] = [];
  if (role === 'MANAGER') facts.push(['Khách hàng', claim.customer?.fullName],
    ['Kho và hợp đồng', [claim.unitCodeSnapshot, claim.rentalContract?.contractCode].filter(Boolean).join(' · ')]);
  facts.push(['Số tiền được duyệt', money(payment.approvedCompensationAmount)], ['Phương thức', 'Tiền mặt']);
  if (paid) facts.push(['Số tiền đã giao', money(payment.paidCompensationAmount)], ['Ngày giờ bàn giao', claimDate(payment.handedOverAt, true)]);
  if (role === 'MANAGER' && paid) facts.push(['Người giao', payment.deliveredBy], ['Người nhận', payment.receivedBy],
    ['Người ghi nhận', payment.recordedBy], ['Thời điểm ghi nhận', claimDate(payment.recordedAt, true)]);
  return <section className="manager-section claims-card claims-cash" aria-labelledby="claim-cash-title">
    <h2 id="claim-cash-title"><Banknote size={20} aria-hidden="true" />Bồi thường tiền mặt</h2>
    <Status value={paid ? 'COMPLETED' : 'PENDING'} text={paid ? 'Đã bàn giao tiền bồi thường' : 'Đã duyệt bồi thường — Chờ giao tiền'} />
    <Facts items={facts} />
    {role === 'MANAGER' && payment.handoverNote && <p className="claims-text">{payment.handoverNote}</p>}
    {role === 'MANAGER' && !paid && <button className="button-primary" disabled={refreshing} onClick={() => setOpen(true)}>Ghi nhận đã giao tiền</button>}
    {open && <ClaimActionDialog action="handover" claim={claim} path={path} close={() => setOpen(false)} saved={saved} reload={reload} />}
  </section>;
}

function ClaimActionDialog({ action, claim, path, saved, reload, close }: ActionProps & { action: Action; close: () => void }) {
  const { user } = useAuth();
  const [staff, setStaff] = useState(claim.assignedStaff?.id ?? '');
  const [note, setNote] = useState(action === 'inspect' ? claim.staffFacts ?? '' : '');
  const [decision, setDecision] = useState('APPROVED');
  const [compensate, setCompensate] = useState(false);
  const [amount, setAmount] = useState('');
  const [handedOverAt, setHandedOverAt] = useState('');
  const [deliveredBy, setDeliveredBy] = useState(user?.fullName ?? '');
  const [receivedBy, setReceivedBy] = useState(claim.customer?.fullName ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; conflict: boolean }>();
  const locked = useRef(false);
  const [title, button, success] = dialogs[action];
  const supportsCompensation = Boolean(claim.compensation);
  const showAmount = decision === 'APPROVED' && supportsCompensation && compensate;
  const approvedAmount = claim.compensation?.approvedCompensationAmount ?? 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    const version = { expectedUpdatedAt: claim.updatedAt };
    try {
      switch (action) {
        case 'assign': await mutate(path + '/assign', 'PATCH', { staffUserId: staff }); break;
        case 'inspect': await mutate(path, 'PATCH', { ...version, staffFacts: note }); break;
        case 'decide': await mutate(path, 'PATCH', { ...version, decision, decisionReason: note, approvedCompensationAmount: showAmount ? Number(amount) : null }); break;
        case 'handover': {
          const time = new Date(`${handedOverAt}+07:00`);
          if (!confirmed || !Number.isFinite(time.getTime())) throw new Error('Chọn ngày giờ và xác nhận đã giao tiền mặt.');
          await mutate(path + '/compensation/handover', 'PATCH', {
            ...version, paidCompensationAmount: approvedAmount, handedOverAt: time.toISOString(),
            deliveredBy, receivedBy, handoverNote: note.trim(), confirmCashHandover: confirmed,
          });
          break;
        }
        default: await mutate(path, 'PATCH', { ...version, action, resolutionNote: claim.resolutionNote || note });
      }
      close();
      saved(success);
    } catch (caught) {
      setError({ text: caught instanceof Error ? caught.message : 'Chưa lưu được.', conflict: caught instanceof ApiError && caught.status === 409 });
    } finally { locked.current = false; setBusy(false); }
  }

  return <Modal title={title} onClose={close} busy={busy}>
    <form className="portal-form claims-dialog-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {action === 'assign' && <StaffPicker value={staff} onChange={setStaff} currentStaff={claim.assignedStaff} disabled={busy} />}
        {action === 'inspect' && <label className="field-label">Tình trạng thực tế và nhận xét<textarea required minLength={10} maxLength={3000} rows={4} value={note} onChange={event => setNote(event.target.value)} /></label>}
        {action === 'decide' && <>
          <label className="field-label">Hướng xử lý<select value={decision} onChange={event => setDecision(event.target.value)}><option value="APPROVED">Chấp thuận hướng xử lý</option><option value="REJECTED">Từ chối đề nghị</option></select></label>
          {decision === 'APPROVED' && (supportsCompensation
            ? <label className="portal-checkbox"><input type="checkbox" checked={compensate} onChange={event => setCompensate(event.target.checked)} />Duyệt bồi thường tiền mặt</label>
            : <p className="claims-muted">API đang chạy chưa hỗ trợ duyệt bồi thường tiền mặt.</p>)}
          {showAmount && <label className="field-label">Số tiền được duyệt (đ)<input type="number" required min={1} max={Number.MAX_SAFE_INTEGER} step={1} value={amount} onChange={event => setAmount(event.target.value)} /></label>}
          <label className="field-label">Lý do và căn cứ<textarea required minLength={10} maxLength={3000} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label>
        </>}
        {(action === 'notify' || action === 'resolve') && (claim.resolutionNote
          ? <p className="claims-text">{claim.resolutionNote}</p>
          : <label className="field-label">Kết quả đã thông báo cho khách<textarea required minLength={10} maxLength={3000} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label>)}
        {action === 'handover' && <>
          <div className="claims-fields">
            <label className="field-label">Số tiền đã giao<input readOnly value={money(approvedAmount)} /></label>
            <label className="field-label">Ngày giờ bàn giao (giờ Việt Nam)<input type="datetime-local" required step={1} value={handedOverAt} onChange={event => { setHandedOverAt(event.target.value); setConfirmed(false); }} /></label>
            <label className="field-label">Người giao<input required minLength={2} maxLength={120} value={deliveredBy} onChange={event => { setDeliveredBy(event.target.value); setConfirmed(false); }} /></label>
            <label className="field-label">Người nhận<input required minLength={2} maxLength={120} value={receivedBy} onChange={event => { setReceivedBy(event.target.value); setConfirmed(false); }} /></label>
          </div>
          <label className="field-label">Ghi chú bàn giao (tùy chọn)<textarea maxLength={1000} rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
          <label className="portal-checkbox claims-confirm"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Xác nhận đã bàn giao {money(approvedAmount)} bằng tiền mặt cho {receivedBy.trim() || 'người nhận'}?</label>
        </>}
      </fieldset>
      {error && <div role="alert" className="booking-alert is-error">{error.text}
        {error.conflict && <button type="button" className="button-secondary" onClick={() => { close(); reload(); }}>Tải lại hồ sơ</button>}
      </div>}
      <div className="portal-actions"><button type="button" className="button-secondary" onClick={close} disabled={busy}>Hủy</button><button className="button-primary" disabled={busy || (action === 'assign' && (!staff.trim() || staff === claim.assignedStaff?.id)) || (action === 'handover' && !confirmed)}>{busy ? 'Đang lưu…' : button}</button></div>
    </form>
  </Modal>;
}
