import { DateRangePicker } from '../../components/workspace/DateTimeFields';
import { useContext, useId, useState } from 'react';
import { CalendarDays, ChevronDown, CircleHelp, ClipboardList, Coins, Download, Receipt, RefreshCw, Wallet, Warehouse, type LucideIcon } from 'lucide-react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { DashboardSkeleton, SkeletonBone } from '../../components/LoadingSkeleton';
import { ReceivedMoneyChart, StorageStatusChart } from '../../components/manager/ManagerReportSummaryCharts';
import { FinancialReportDetails, OperationalReportDetails, ReportTypeTable } from '../../components/manager/ManagerReportDetails';
import { LoadState, RefreshStatus } from '../../components/manager/PortalUi';
import { ManagerFacility } from '../../components/manager/operations-workspace';
import { apiRequest } from '../../services/api';
import { useLiveRefresh } from '../../services/live-events';
import { useApiResource } from '../../services/useApiResource';
import type { ManagerPeriodReport, ManagerReport } from '../../types/manager-report';
import { isReportCount, isReportDay, reportBucketLabel, reportDay, reportMoney, type ReportGroup } from '../../utils/reporting';
import { downloadReportWorkbook, excelMoney, reportInvoiceSheet, type ReportSheet } from '../../utils/report-workbook';
import '../../styles/manager-reports.css';
import { MaintenanceCostTable, type MaintenanceCostReport } from '../../components/workspace/MaintenanceCostTable';

type Dates = { from: string; to: string };
type Period = 'today' | 'week' | 'month' | 'quarter' | 'custom';
type Tab = 'finance' | 'operations';
type Export = 'kpi' | 'invoices';
const periods: [Period, string][] = [
  ['today', 'Hôm nay'], ['week', '7 ngày'], ['month', '30 ngày'], ['quarter', '3 tháng'], ['custom', 'Tùy chọn'],
];
const tabs: [Tab, string][] = [['finance', 'Tài chính'], ['operations', 'Kho & vận hành']];
const count = new Intl.NumberFormat('vi-VN');
const dayMs = 86400000;
const snapshotPath = '/manager/dashboard/analytics';
const displayCount = (value: unknown) => isReportCount(value) ? count.format(value) : '—';
const displayMoney = (value: unknown) => isReportCount(value) ? reportMoney(value) : '—';

function presetRange(period: Exclude<Period, 'custom'>): Dates {
  const to = reportDay(new Date().toISOString());
  const date = new Date(to + 'T00:00:00Z');
  if (period === 'quarter') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 3);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay) + 1);
  } else {
    date.setUTCDate(date.getUTCDate() - (period === 'month' ? 29 : period === 'week' ? 6 : 0));
  }
  return { from: date.toISOString().slice(0, 10), to };
}

function groupFor({ from, to }: Dates): ReportGroup {
  const days = (Date.parse(to) - Date.parse(from)) / dayMs + 1;
  if (days <= 7) return 'day';
  if (days <= 93) return 'week';
  return days <= 731 ? 'month' : 'year';
}

function Metric({ name, value, scope, description, icon: Icon, loading }: {
  name: string; value: string; scope: string; description: string; icon: LucideIcon; loading: boolean;
}) {
  const id = useId();
  return <article className={loading ? 'manager-report-metric workspace-skeleton' : 'manager-report-metric'} aria-busy={loading}>
    <div className="manager-report-metric-top">
      <span><Icon size={17} aria-hidden="true" />{name}</span>
      <span className="manager-report-help">
        <button type="button" aria-label={`Cách tính ${name.toLocaleLowerCase('vi')}`} aria-describedby={id}><CircleHelp size={16} aria-hidden="true" /></button>
        <span id={id} role="tooltip">{description}</span>
      </span>
    </div>
    {loading ? <SkeletonBone shape="value" /> : <strong>{value}</strong>}
    <small>{scope}</small>
  </article>;
}

export function ManagerReportsRedirect() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  if (!params.has('tab') && params.has('typeId')) params.set('tab', 'operations');
  params.set('details', '1');
  return <Navigate replace to={{ pathname: '/manager/reports', search: params.toString(), hash }} />;
}

export function ManagerReportsPage() {
  const { user } = useAuth();
  const facility = useContext(ManagerFacility);
  const [params, setParams] = useSearchParams();
  const tabsId = useId();
  const tab: Tab = params.get('tab') === 'operations' ? 'operations' : 'finance';
  const from = params.get('from'), to = params.get('to');
  const customRange = isReportDay(from) && isReportDay(to) && from <= to ? { from, to } : null;
  const preset = params.get('period');
  const period = customRange || preset === 'custom' ? 'custom' :
    preset === 'today' || preset === 'week' || preset === 'quarter' ? preset : 'month';
  const dates = customRange ?? presetRange(period === 'custom' ? 'month' : period);
  const rangeKey = dates.from + '/' + dates.to;
  const [pendingDates, setPendingDates] = useState<{ key: string; dates: Dates } | null>(null);
  const draft = pendingDates?.key === rangeKey ? pendingDates.dates : dates;
  const showLinkedDetails = params.get('details') === '1';
  const [expanded, setExpanded] = useState<Record<Tab, boolean>>({
    finance: tab === 'finance' && showLinkedDetails,
    operations: Boolean(params.get('typeId')) || tab === 'operations' && showLinkedDetails,
  });
  const [exporting, setExporting] = useState<Export | null>(null);
  const [exportError, setExportError] = useState('');
  const groupParam = params.get('group');
  const linkedGroup = groupParam === 'day' || groupParam === 'week' || groupParam === 'month' || groupParam === 'year' ? groupParam : '';
  const group = linkedGroup || groupFor(dates);
  const query = new URLSearchParams({ ...dates, group });
  const typeId = params.get('typeId') ?? '';
  const typeQuery = new URLSearchParams({ ...dates, group, typeId });
  const range = useApiResource<ManagerPeriodReport>('/manager/reports?' + query, user?.id, true);
  const maintenance = useApiResource<MaintenanceCostReport>(
    tab === 'finance' ? '/manager/reports/maintenance-costs?' + new URLSearchParams(dates) : null, user?.id,
  );
  const snapshot = useApiResource<ManagerReport>(snapshotPath, user?.id, true);
  const typeReport = useApiResource<ManagerPeriodReport>(tab === 'operations' && expanded.operations && typeId ? '/manager/reports?' + typeQuery : null, user?.id);
  const catalog = useApiResource<{ items: { id: string; name: string; code: string }[] }>(expanded[tab] || typeId ? '/manager/storage-types' : null, user?.id);
  function refresh() { range.refresh(); snapshot.refresh(); typeReport.refresh(); catalog.refresh(); maintenance.refresh(); }
  useLiveRefresh('/manager/*', refresh);
  const invalidDraft = !isReportDay(draft.from) || !isReportDay(draft.to) || draft.from > draft.to;
  const rangeLabel = dates.from === dates.to ? reportBucketLabel(dates.from, 'day') :
    [dates.from, dates.to].map(day => reportBucketLabel(day, 'day')).join(' – ');
  const units = snapshot.data?.units;
  const finance = snapshot.data?.finance;
  const report = range.data;
  const operations = typeId ? typeReport.data : report;
  const categories = operations?.categories;
  const refreshing = range.refreshing || snapshot.refreshing || typeReport.refreshing || maintenance.refreshing;
  const occupancy = isReportCount(units?.occupied) && isReportCount(units.total) && units.occupied <= units.total
    ? `${count.format(units.occupied)} / ${count.format(units.total)} kho` : '—';

  function changeParams(changes: Record<string, string>) {
    setParams(current => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    }, { preventScrollReset: true });
  }

  function selectPeriod(value: Period) {
    setPendingDates(null);
    setExportError('');
    changeParams(value === 'custom'
      ? { period: value, ...dates }
      : { period: value, from: '', to: '', group: '' });
  }

  async function download(kind: Export) {
    if (!facility || !report || (kind === 'kpi' && !finance) || exporting) return;
    setExporting(kind);
    setExportError('');
    try {
      const invoiceRequest = reportInvoiceSheet(`/manager/reports/invoices.csv?${typeQuery}`);
      const sheets: ReportSheet[] = [];
      if (kind === 'kpi' && finance) {
        // This period-specific KPI is absent from the period chart and current balance snapshots.
        const [invoices, { finance: periodFinance }] = await Promise.all([
          invoiceRequest, apiRequest<ManagerReport>(snapshotPath + '?' + new URLSearchParams(dates)),
        ]);
        sheets.push(
          { name: 'Tổng quan tài chính', headers: ['Chỉ số', 'Giá trị', 'Phạm vi', 'Định nghĩa'], moneyColumns: [2], rows: [
            ['Tiền đã nhận', excelMoney(report.received), 'Trong kỳ', 'Theo ngày nhận tiền, có thể gồm tiền thuê, cọc và dịch vụ.'],
            ['Tiền thuê trên hóa đơn', excelMoney(report.rent), 'Trong kỳ', 'Tiền thuê trên hóa đơn còn hiệu lực, theo ngày phát hành, đã trừ ưu đãi.'],
            ['Cọc trên hóa đơn trả đủ', excelMoney(periodFinance.depositOnFullyPaidInvoices), 'Trong kỳ', 'Theo ngày trả đủ, chưa gồm cọc của hóa đơn trả một phần.'],
            ['Công nợ hiện tại', excelMoney(finance.outstandingAmount), 'Hiện tại', 'Số dư hóa đơn còn hiệu lực và chưa trả đủ tại thời điểm tải.'],
            ['Hoàn cọc đã duyệt, chưa kết thúc', excelMoney(finance.approvedRefundOutstanding), 'Hiện tại', 'Theo quyết toán đã duyệt, chưa gồm cọc đang chờ xét duyệt hoặc chưa quyết toán.'],
          ] },
          { name: 'Tiền thuê theo loại kho', headers: ['Loại kho', 'Tiền thuê trên hóa đơn'], moneyColumns: [2],
            rows: report.categories.map(item => [item.name, excelMoney(item.rent)]) },
          invoices,
          { name: 'Tiền nhận theo thời gian', headers: ['Mốc thời gian', 'Tiền đã nhận'], moneyColumns: [2],
            rows: report.times.map(item => [reportBucketLabel(item.date, group), excelMoney(item.received)]) },
        );
      } else sheets.push(await invoiceRequest);
      const typeName = catalog.data?.items.find(item => item.id === typeId)?.name ?? report.categories.find(item => item.id === typeId)?.name ?? typeId;
      await downloadReportWorkbook(`nestbox-${kind === 'kpi' ? 'bao-cao' : 'hoa-don'}-${dates.from}-${dates.to}`, {
        title: kind === 'kpi' ? 'Báo cáo tài chính cơ sở' : 'Danh sách hóa đơn',
        scope: facility.name, period: rangeLabel,
        invoiceScope: typeId ? `${facility.name} · ${typeName}` : undefined,
      }, sheets);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không xuất được báo cáo.');
    } finally {
      setExporting(null);
    }
  }

  return <section className="manager-report-summary">
    <header className="manager-report-header">
      <h1>Báo cáo</h1>
      <div className="manager-report-actions">
        <label className="manager-report-period">
          <CalendarDays size={16} aria-hidden="true" />
          <select aria-label="Khoảng thời gian báo cáo" value={period} onChange={event => selectPeriod(event.target.value as Period)}>
            {periods.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <button type="button" className="button-secondary" disabled={range.loading || snapshot.loading || refreshing}
          onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Làm mới</button>
      </div>
    </header>
    <p className="manager-report-range" aria-live="polite">{rangeLabel} <small>Giờ Việt Nam (UTC+7)</small></p>
    {period === 'custom' && <form className="manager-report-custom" data-wdp-draft="ignore" onSubmit={event => {
      event.preventDefault();
      if (!invalidDraft) {
        setPendingDates(null);
        setExportError('');
        changeParams({ ...draft, period: 'custom' });
      }
    }}>
      <DateRangePicker from={{ label: 'Từ ngày', required: true, value: draft.from,
        onChange: from => setPendingDates({ key: rangeKey, dates: { ...draft, from } }) }}
        to={{ label: 'Đến ngày', required: true, value: draft.to,
          onChange: to => setPendingDates({ key: rangeKey, dates: { ...draft, to } }) }} />
      <button className="button-secondary" type="submit" disabled={invalidDraft}>Áp dụng</button>
      {draft.from && draft.to && draft.from > draft.to && <p role="alert">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
    </form>}
    <div className="manager-report-actions">
      <button type="button" className="button-secondary" disabled={!report || !finance || !facility || refreshing || Boolean(exporting)}
        onClick={() => void download('kpi')}><Download size={16} aria-hidden="true" />{exporting === 'kpi' ? 'Đang xuất…' : 'Xuất báo cáo tài chính'}</button>
      <button type="button" className="button-secondary" disabled={!report || !facility || refreshing || Boolean(exporting)}
        onClick={() => void download('invoices')}><Download size={16} aria-hidden="true" />{exporting === 'invoices' ? 'Đang xuất…' : 'Xuất danh sách hóa đơn'}</button>
    </div>
    {typeId && <p className="manager-report-note">Danh sách hóa đơn áp dụng bộ lọc loại kho trong Chi tiết vận hành.</p>}
    {exportError && <p role="alert" className="booking-alert is-error">{exportError}</p>}
    <RefreshStatus active={refreshing} />
    <div className="manager-report-tabs" role="tablist" aria-label="Nhóm báo cáo">
      {tabs.map(([key, name]) => <button key={key} id={`${tabsId}-${key}`} type="button" role="tab"
        tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} aria-controls={`${tabsId}-panel-${key}`}
        onClick={() => changeParams({ tab: key })}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'finance' : event.key === 'End' ? 'operations' : key === 'finance' ? 'operations' : 'finance';
          changeParams({ tab: next });
          document.getElementById(`${tabsId}-${next}`)?.focus();
        }}>{name}</button>)}
    </div>

    <div className="manager-report-panel" role="tabpanel" id={`${tabsId}-panel-finance`} aria-labelledby={`${tabsId}-finance`} hidden={tab !== 'finance'}>
      {tab === 'finance' && <>
        <div className="manager-report-metrics">
          <Metric name="Tiền đã nhận" value={displayMoney(report?.received)} scope="Trong kỳ" icon={Wallet} loading={range.loading}
            description="Tổng khoản thu đã ghi nhận theo ngày nhận tiền, có thể gồm tiền thuê, cọc và dịch vụ." />
          <Metric name="Tiền thuê trên hóa đơn" value={displayMoney(report?.rent)} scope="Trong kỳ" icon={Receipt} loading={range.loading}
            description="Tiền thuê trên hóa đơn còn hiệu lực theo ngày phát hành, đã trừ ưu đãi và tách riêng cọc, dịch vụ, phí." />
          <Metric name="Công nợ hiện tại" value={displayMoney(finance?.outstandingAmount)} scope="Hiện tại · toàn bộ hóa đơn" icon={ClipboardList} loading={snapshot.loading}
            description="Số dư của các hóa đơn còn hiệu lực và chưa trả đủ tại thời điểm tải." />
        </div>
        <LoadState loading={false} error={snapshot.error} retry={snapshot.refresh} />
        <section className="manager-report-chart" aria-labelledby="report-money-title">
          <div className="manager-report-header">
            <h2 id="report-money-title">Tiền đã nhận theo thời gian</h2>
            <label className="manager-report-period">Hiển thị theo<select value={linkedGroup} onChange={event => changeParams({ group: event.target.value })}>
              <option value="">Tự động</option><option value="day">Ngày</option><option value="week">Tuần</option>
              <option value="month">Tháng</option><option value="year">Năm</option>
            </select></label>
          </div>
          <LoadState loading={range.loading} error={range.error} retry={range.refresh} placeholder={<DashboardSkeleton variant="bars" />} />
          {report && <ReceivedMoneyChart key={query.toString()} buckets={report.times} received={report.received} group={group} {...dates} />}
        </section>
        <MaintenanceCostTable className="manager-report-chart" data={maintenance.data} managerFacilityId={facility?.id ?? ''}
          loading={maintenance.loading} error={maintenance.error} refresh={maintenance.refresh} />
        <details className="manager-report-details manager-report-finance-accordion" open={expanded.finance} onToggle={event => {
          const open = event.currentTarget.open;
          setExpanded(current => current.finance === open ? current : { ...current, finance: open });
        }}>
          <summary><span className="manager-financial-title"><span><Coins size={17} aria-hidden="true" /></span>Chi tiết tài chính</span><ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="manager-report-detail-content">
            <FinancialReportDetails report={report} finance={finance} rangeLoading={range.loading} snapshotLoading={snapshot.loading}
              rangeFailed={Boolean(range.error)} snapshotFailed={Boolean(snapshot.error)} />
            {Array.isArray(report?.categories) && <ReportTypeTable key={rangeKey} kind="rent" categories={report.categories} catalog={catalog.data?.items} />}
          </div>
        </details>
      </>}
    </div>

    <div className="manager-report-panel" role="tabpanel" id={`${tabsId}-panel-operations`} aria-labelledby={`${tabsId}-operations`} hidden={tab !== 'operations'}>
      {tab === 'operations' && <>
        <div className="manager-report-metrics">
          <Metric name="Kho đang dùng" value={occupancy} scope="Hiện tại" icon={Warehouse} loading={snapshot.loading}
            description="Đếm kho có trạng thái Đang dùng trên tổng kho vật lý, gồm kho trống, đang giữ và bảo trì." />
          <Metric name="Kho trống" value={displayCount(units?.available)} scope="Hiện tại" icon={Warehouse} loading={snapshot.loading}
            description="Số kho sẵn sàng tại thời điểm tải." />
          <Metric name="Đơn đặt trong kỳ" value={displayCount(report?.bookingCount)} scope="Theo ngày tạo đơn" icon={ClipboardList} loading={range.loading}
            description="Một đơn thuê nhiều kho vẫn được tính là một đơn." />
        </div>
        <LoadState loading={false} error={range.error} retry={range.refresh} />
        <section className="manager-report-chart" aria-labelledby="report-storage-title">
          <h2 id="report-storage-title">Tình trạng kho hiện tại</h2>
          <LoadState loading={snapshot.loading} error={snapshot.error} retry={snapshot.refresh} placeholder={<DashboardSkeleton variant="storage" />} />
          {units && <StorageStatusChart units={units} />}
        </section>
        <details className="manager-report-details" open={expanded.operations} onToggle={event => {
          const open = event.currentTarget.open;
          setExpanded(current => current.operations === open ? current : { ...current, operations: open });
        }}>
          <summary>Chi tiết vận hành <ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="manager-report-detail-content">
            <OperationalReportDetails report={report} snapshot={snapshot.data} rangeLoading={range.loading} snapshotLoading={snapshot.loading} />
            <LoadState loading={false} error={catalog.error} retry={catalog.refresh} />
            <LoadState loading={typeId ? typeReport.loading : range.loading} error={typeReport.error} retry={typeReport.refresh}
              placeholder={<p className="manager-report-note" role="status">Đang tải chi tiết…</p>} />
            <ReportTypeTable key={rangeKey + ':' + typeId} kind="bookings" categories={categories ?? []} catalog={catalog.data?.items}
              pending={typeId ? typeReport.loading || Boolean(typeReport.error) : range.loading || Boolean(range.error)}
              controls={<label className="field-label">Loại kho<select aria-label="Lọc loại kho báo cáo" value={typeId}
                onChange={event => changeParams({ typeId: event.target.value })}>
                <option value="">Tất cả loại kho</option>
                {typeId && !catalog.data?.items?.some(item => item.id === typeId) &&
                  <option value={typeId}>{categories?.find(item => item.id === typeId)?.name ?? typeId}</option>}
                {catalog.data?.items?.map(item => <option key={item.id} value={item.id}>{item.name}{item.code && ` · ${item.code}`}</option>)}
              </select></label>} />
          </div>
        </details>
      </>}
    </div>
  </section>;
}
