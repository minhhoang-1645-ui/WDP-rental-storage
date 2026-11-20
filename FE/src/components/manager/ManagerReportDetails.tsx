import { useId, useState, type ReactNode } from 'react';
import { CircleHelp, Clock, FileText, RotateCcw, ShieldCheck, Wallet, XCircle, type LucideIcon } from 'lucide-react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../utils/internal-pagination';
import { InternalPagination } from '../workspace/InternalPagination';
import { DetailRow } from '../workspace/DetailRow';
import { RecordFactsDialog } from './PortalUi';
import { SkeletonBone } from '../LoadingSkeleton';
import type { ManagerPeriodReport, ManagerReport } from '../../types/manager-report';
import { isReportCount, reportMoney } from '../../utils/reporting';

const count = new Intl.NumberFormat('vi-VN');
const formatCount = (value?: number) => isReportCount(value) ? count.format(value) : '—';
const formatMoney = (value?: number) => isReportCount(value) ? reportMoney(value) : '—';
type Category = ManagerPeriodReport['categories'][number];
type CatalogItem = { id: string; code?: string; name: string };

function Definition({ name, children }: { name: string; children: string }) {
  const id = useId();
  return <span className="manager-report-help">
    <button type="button" aria-label={`Cách tính ${name.toLocaleLowerCase('vi')}`} aria-describedby={id}>
      <CircleHelp size={15} aria-hidden="true" />
    </button>
    <span id={id} role="tooltip">{children}</span>
  </span>;
}

type DetailMetric = { name: string; value: string; scope: string; description?: string; loading?: boolean };

function DetailMetricValue({ metric }: { metric: DetailMetric }) {
  return <div className="manager-report-detail-metric" aria-busy={metric.loading}>
    <dt><span>{metric.name}</span>{metric.description && <Definition name={metric.name}>{metric.description}</Definition>}</dt>
    <dd>{metric.loading ? <SkeletonBone shape="value" /> : <strong>{metric.value}</strong>}<small>{metric.scope}</small></dd>
  </div>;
}

function FinancialCard({ title, icon: Icon, kind, children }: {
  title: string; icon: LucideIcon; kind: 'receipts' | 'invoices' | 'deposit'; children: ReactNode;
}) {
  const id = useId();
  return <section className={`manager-financial-card is-${kind}`} aria-labelledby={id}>
    <h3 id={id}><span><Icon size={17} aria-hidden="true" /></span>{title}</h3>
    {children}
  </section>;
}

function FinancialValue({ value, loading }: { value: string; loading: boolean }) {
  if (loading) return <SkeletonBone shape="value" />;
  return <strong className={value.length > 18 ? 'manager-financial-value-compact' : undefined}>
    {value === '—' ? <><span aria-hidden="true">—</span><span className="sr-only">Chưa có số liệu</span></> : value}
  </strong>;
}

export function FinancialReportDetails({ report, finance, rangeLoading, snapshotLoading, rangeFailed, snapshotFailed }: {
  report: ManagerPeriodReport | null; finance?: ManagerReport['finance']; rangeLoading: boolean; snapshotLoading: boolean;
  rangeFailed: boolean; snapshotFailed: boolean;
}) {
  const emptyPeriod = report?.paymentCount === 0 && report.invoiceCount === 0 && report.voidCount === 0;
  return <div className="manager-financial-details" aria-busy={rangeLoading || snapshotLoading}>
    <div className="manager-financial-grid">
      <FinancialCard title="Khoản thu" icon={Wallet} kind="receipts">
        <dl>
          <div className="manager-financial-primary">
            <dt><span>Đã ghi nhận</span><Definition name="khoản thu">Đếm từng khoản thu trong kỳ theo ngày nhận tiền, gồm cả các lần trả một phần.</Definition></dt>
            <dd><FinancialValue value={formatCount(report?.paymentCount)} loading={rangeLoading} /></dd>
          </div>
        </dl>
      </FinancialCard>
      <FinancialCard title="Hóa đơn" icon={FileText} kind="invoices">
        <dl className="manager-financial-invoice-rows">
          <div className="manager-financial-row">
            <dt>Còn nợ <Definition name="hóa đơn còn nợ">Số hóa đơn còn số dư hiện tại, gồm hóa đơn đang mở và đã trả một phần.</Definition></dt>
            <dd><FinancialValue value={formatCount(finance?.unpaidInvoices)} loading={snapshotLoading} /></dd>
          </div>
          <div className="manager-financial-row">
            <dt><Clock className="manager-financial-overdue-icon" size={16} aria-hidden="true" />Quá hạn <Definition name="tiền quá hạn">Số dư còn phải thu trên hóa đơn lập trong kỳ và đã đến hoặc qua hạn trả.</Definition></dt>
            <dd><FinancialValue value={formatMoney(report?.overdue)} loading={rangeLoading} /></dd>
          </div>
          <div className="manager-financial-row">
            <dt><XCircle className="manager-financial-void-icon" size={16} aria-hidden="true" />Đã hủy <Definition name="hóa đơn đã hủy">Đếm hóa đơn phát hành trong kỳ hiện có trạng thái đã hủy.</Definition></dt>
            <dd><FinancialValue value={formatCount(report?.voidCount)} loading={rangeLoading} /></dd>
          </div>
        </dl>
      </FinancialCard>
      <FinancialCard title="Tiền cọc" icon={ShieldCheck} kind="deposit">
        <dl>
          <div className="manager-financial-primary">
            <dt><span>Đã lập hóa đơn</span><Definition name="cọc đã lập hóa đơn">Cọc ghi trên hóa đơn còn hiệu lực phát hành trong kỳ, gồm cả hóa đơn chưa trả đủ.</Definition></dt>
            <dd><FinancialValue value={formatMoney(report?.deposit)} loading={rangeLoading} /></dd>
          </div>
          <div className="manager-financial-row manager-financial-refund">
            <dt><RotateCcw size={15} aria-hidden="true" />Chờ hoàn <Definition name="cọc chờ hoàn">Tiền chưa hoàn của hồ sơ đã duyệt hoặc đang chờ thanh toán công nợ.</Definition></dt>
            <dd><FinancialValue value={formatMoney(finance?.approvedRefundOutstanding)} loading={snapshotLoading} /></dd>
          </div>
        </dl>
      </FinancialCard>
    </div>
    <p className="manager-financial-scope">Còn nợ và chờ hoàn tính tại thời điểm cập nhật. Các chỉ số khác theo kỳ đã chọn.</p>
    {rangeFailed && <p className="manager-financial-status" role="status">Chưa tải được số liệu trong kỳ.</p>}
    {snapshotFailed && <p className="manager-financial-status" role="status">Chưa tải được số liệu còn nợ và chờ hoàn.</p>}
    {emptyPeriod && <p className="manager-financial-status" role="status">Kỳ này chưa có khoản thu hoặc hóa đơn phát sinh.</p>}
  </div>;
}

export function OperationalReportDetails({ report, snapshot, rangeLoading, snapshotLoading }: {
  report: ManagerPeriodReport | null; snapshot: ManagerReport | null; rangeLoading: boolean; snapshotLoading: boolean;
}) {
  const metrics: DetailMetric[] = [
    { name: 'Đơn đã xác nhận', value: formatCount(report?.confirmedCount), scope: 'Đơn tạo trong kỳ', loading: rangeLoading,
      description: 'Đếm mỗi đơn tạo trong kỳ một lần nếu trạng thái hiện tại là Đã xác nhận.' },
    { name: 'Kho từng được phân bổ', value: formatCount(report?.allocatedUnits), scope: 'Đơn đã xác nhận tạo trong kỳ', loading: rangeLoading,
      description: 'Đếm mã kho vật lý khác nhau của các đơn này, kể cả kho đã trả hoặc đã chuyển đi.' },
    { name: 'Hợp đồng đang thuê', value: formatCount(snapshot?.activeContracts), scope: 'Hiện tại · toàn bộ hợp đồng', loading: snapshotLoading,
      description: 'Đếm hợp đồng đang hoạt động. Mỗi hợp đồng gắn với một kho vật lý tại một thời điểm.' },
  ];
  return <div className="manager-report-detail-grid manager-report-operational-metrics">{metrics.map(metric =>
    <dl className="manager-report-detail-card" key={metric.name}><DetailMetricValue metric={metric} /></dl>
  )}</div>;
}

export function ReportTypeTable({ kind, categories, catalog, controls, pending = false }: {
  kind: 'rent' | 'bookings'; categories: Category[]; catalog?: CatalogItem[]; controls?: ReactNode; pending?: boolean;
}) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(kind === 'rent' ? 'rent' : 'requests');
  const [selected, setSelected] = useState<Category>();
  const rent = kind === 'rent';
  const title = rent ? 'Tiền thuê theo loại kho' : 'Đơn đặt theo loại kho';
  const amount = (row: Category) => sort === 'rent' ? row.rent : sort === 'confirmed' ? row.confirmed : row.requests;
  const rows = [...categories].sort((a, b) => (sort === 'name' ? 0 : (amount(b) ?? -1) - (amount(a) ?? -1))
    || a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id));
  const codes = new Map(catalog?.map(item => [item.id, item.code]));
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <section className="manager-report-breakdown" aria-labelledby={id}>
    <div className="manager-report-detail-heading">
      <h3 id={id}>{title}</h3>
      <div className="manager-report-actions">
        {controls}
        <label className="field-label">Sắp xếp<select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}>
          {rent ? <option value="rent">Tiền thuê cao nhất</option> : <>
            <option value="requests">Nhiều đơn nhất</option><option value="confirmed">Nhiều đơn xác nhận nhất</option>
          </>}
          <option value="name">Tên loại kho</option>
        </select></label>
      </div>
    </div>
    {!rent && <p className="manager-report-note">Hiển thị loại kho có đơn hoặc hóa đơn trong kỳ. Đơn tính theo ngày tạo, cột kho lấy trạng thái hiện tại.</p>}
    {visible.length ? <>
      <div className="manager-report-type-wrap">
        <table className={`manager-report-types is-${kind}`} aria-labelledby={id}>
          <thead><tr><th scope="col">Loại kho</th>{rent
            ? <th scope="col">Tiền thuê trên hóa đơn</th>
            : <><th scope="col">Đơn đặt</th><th scope="col">Đã xác nhận</th><th scope="col">Đang dùng / tổng kho</th></>}
          </tr></thead>
          <tbody>{visible.map(row => <DetailRow key={row.id} detail={{ open: () => setSelected(row), label: `Xem số liệu ${row.name}` }}>
            <th scope="row"><span>{row.name}</span>{codes.get(row.id) && <small>{codes.get(row.id)}</small>}</th>
            {rent ? <td>{formatMoney(row.rent)}</td> : <>
              <td>{formatCount(row.requests)}</td><td>{formatCount(row.confirmed)}</td>
              <td>{formatCount(row.occupied)} / {formatCount(row.physicalUnits)}</td>
            </>}
          </DetailRow>)}</tbody>
        </table>
      </div>
      {rows.length > PAGE_SIZE_OPTIONS[0] && <InternalPagination page={currentPage} limit={pageSize} total={rows.length} onChange={setPage} onLimitChange={value => { setPageSize(value); setPage(1); }} />}
    </> : !pending && <p className="manager-report-note">Chưa có số liệu theo loại kho cho bộ lọc này.</p>}
    {selected && <RecordFactsDialog title={`${title} · ${selected.name}`} onClose={() => setSelected(undefined)} items={[
      ['Mã loại kho', codes.get(selected.id)],
      ...(rent ? [
        ['Tiền thuê trên hóa đơn trong kỳ', formatMoney(selected.rent)],
      ] as [string, string][] : [
        ['Đơn đặt trong kỳ', formatCount(selected.requests)],
        ['Đơn đã xác nhận trong kỳ', formatCount(selected.confirmed)],
        ['Kho đang dùng hiện tại', formatCount(selected.occupied)],
        ['Tổng kho vật lý hiện tại', formatCount(selected.physicalUnits)],
      ] as [string, string][]),
    ]} />}
  </section>;
}
