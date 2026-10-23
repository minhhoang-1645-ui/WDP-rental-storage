import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { code, date, first, label, recordId, type Row } from "../../components/manager/portal-data";
import { Empty, Facts, LoadState, PageHeader, Status } from "../../components/manager/PortalUi";
import { mutate } from "../../services/portal";
import { useApiResource } from "../../services/useApiResource";
import { usePaginatedResource } from "../../services/usePaginatedResource";

export function StaffTransfersPage() {
  const { id } = useParams();
  return id ? <StaffTransferDetail key={id} id={id} /> : <StaffTransferList />;
}

function StaffTransferList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "APPROVED";
  const search = params.get("search") ?? "";
  const query = new URLSearchParams({ limit: "100" });
  if (status !== "ALL") query.set("status", status);
  if (search.trim()) query.set("search", search.trim());
  const resource = usePaginatedResource<Row>(`/staff/transfers?${query}`, user?.id ?? "", true);
  const items = resource.data?.items ?? [];
  const change = (name: string, value: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(name, value); else next.delete(name);
    return next;
  }, { replace: true });

  return <section>
    <PageHeader title="Chuyển kho thực tế" description="Xem lệnh đã được quản lý duyệt và xác nhận sau khi chuyển kho hoàn tất.">
      <button className="button-secondary" onClick={resource.refresh} disabled={resource.loading}><RefreshCw size={16} /> Làm mới</button>
    </PageHeader>
    <div className="portal-toolbar">
      <label className="field-label portal-search">Tìm lệnh chuyển<input type="search" value={search} onChange={(event) => change("search", event.target.value)} placeholder="Mã lệnh, yêu cầu đặt kho, hợp đồng hoặc kho" /></label>
      <label className="field-label">Trạng thái<select value={status} onChange={(event) => change("status", event.target.value)}><option value="APPROVED">Chờ thực hiện</option><option value="COMPLETED">Đã hoàn tất</option><option value="ALL">Tất cả</option></select></label>
    </div>
    <LoadState loading={resource.loading} error={resource.error} retry={resource.refresh} />
    {resource.data && !items.length && <Empty title="Không có lệnh chuyển phù hợp" description="Lệnh chuyển sẽ xuất hiện sau khi quản lý duyệt kho đích." />}
    {items.length > 0 && <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Lệnh chuyển</th><th>Yêu cầu đặt kho / Hợp đồng</th><th>Kho nguồn</th><th>Kho đích</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      {items.map((item) => <tr key={recordId(item)}><td><strong>{code(item)}</strong><small>{date(item.createdAt, true)}</small></td><td>{first(item, "reservation.reference")}<small>{first(item, "contract.contractCode")}</small></td><td>{first(item, "fromUnit.unitCode")}</td><td>{first(item, "toUnit.unitCode")}</td><td><Status value={item.status} /></td><td><Link className="manager-table-link" to={`/staff/transfers/${encodeURIComponent(recordId(item))}`}>{item.status === "APPROVED" ? "Thực hiện" : "Xem"}<ArrowRight size={15} /></Link></td></tr>)}
    </tbody></table></div>}
  </section>;
}

function StaffTransferDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const resource = useApiResource<Row>(`/staff/transfers/${encodeURIComponent(id)}`, user?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const lock = useRef(false);
  const complete = async () => {
    if (lock.current || resource.data?.status !== "APPROVED" || !confirmed) return;
    lock.current = true; setBusy(true); setMessage(undefined);
    try {
      await mutate(`/staff/transfers/${encodeURIComponent(id)}/complete`, "POST");
      setMessage({ error: false, text: "Đã hoàn tất chuyển kho thực tế." });
      resource.refresh();
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Không thể hoàn tất chuyển kho." });
    } finally { lock.current = false; setBusy(false); }
  };
  const item = resource.data;

  return <section>
    <Link className="booking-back" to="/staff/transfers"><ArrowLeft size={16} /> Danh sách chuyển kho</Link>
    <PageHeader title={item ? code(item) : "Chi tiết chuyển kho"} description="Đối chiếu đúng kho nguồn và kho đích trước khi xác nhận.">{item && <Status value={item.status} />}</PageHeader>
    <LoadState loading={resource.loading} error={resource.error} retry={resource.refresh} />
    {item && <div className="manager-detail-grid"><section className="manager-section"><h2>Thông tin lệnh chuyển</h2><Facts items={[
      ["Yêu cầu đặt kho", first(item, "reservation.reference")], ["Hợp đồng", first(item, "contract.contractCode")], ["Lý do", label(item.reason)],
      ["Kho nguồn", first(item, "fromUnit.unitCode")], ["Kho đích", first(item, "toUnit.unitCode")], ["Loại kho", first(item, "toUnit.storageType.name")],
      ["Người duyệt", first(item, "approvedBy.fullName")], ["Thời điểm duyệt", date(item.approvedAt, true)], ["Người hoàn tất", first(item, "completedBy.fullName")], ["Thời điểm hoàn tất", date(item.completedAt, true)],
    ]} /></section><aside className="manager-section"><h2>Hoàn tất tại cơ sở</h2>
      {item.status === "APPROVED" ? <><p>Chỉ xác nhận sau khi hàng đã được chuyển sang đúng kho đích.</p><label className="portal-checkbox"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Đã hoàn tất chuyển thực tế và bàn giao kho đích</label><button className="button-primary" type="button" disabled={busy || !confirmed} onClick={() => void complete()}>{busy ? "Đang lưu…" : "Hoàn tất chuyển kho"}</button></> : <p>Lệnh chuyển này đã hoàn tất và không còn thao tác vận hành.</p>}
      {message && <div className={message.error ? "booking-alert is-error" : "portal-success"} role={message.error ? "alert" : "status"}>{message.text}</div>}
    </aside></div>}
  </section>;
}
