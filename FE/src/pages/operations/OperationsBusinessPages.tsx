import { Download, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Empty, LoadState, PageHeader, RefreshStatus } from '../../components/manager/PortalUi';
import { DateRangePicker } from '../../components/workspace/DateTimeFields';
import { apiRequest } from '../../services/api';
import { useApiResource } from '../../services/useApiResource';
import { vietnamCalendarDate } from '../../utils/business-date';
import { isReportDay } from '../../utils/reporting';
import { ReportComparison, ReportFinances, ReportMetrics, ReportTrend, ReportTrendTable } from './OperationsReportSections';
import { displayDate, periods, reportPreset, reportTrendGroup, type Facility, type Period, type PerformanceReport, type Trend } from './operations-report-data';
import './operations-report.css';

const updatedAt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function OperationsBusinessReport() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const facilityId = params.get('facilityId') ?? '';
  const today = vietnamCalendarDate();
  const preset = params.get('period');
  const hasDates = params.has('from') || params.has('to');
  const period = preset && Object.hasOwn(periods, preset) ? preset as Period : hasDates ? 'custom' : 'month';
  const { from, to } = hasDates ? { from: params.get('from') ?? '', to: params.get('to') ?? '' } : reportPreset(period, today);
  const valid = (!from || isReportDay(from)) && (!to || isReportDay(to)) && (!from || !to || from <= to);
  const query = new URLSearchParams();
  if (facilityId) query.set('facilityId', facilityId);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const report = useApiResource<PerformanceReport>(valid ? '/operations/reports/performance?' + query : null, user?.id);
  const group = reportTrendGroup(period, from, to);
  const trend = useApiResource<Trend>(valid ? '/operations/reports/financial?' + new URLSearchParams({ ...Object.fromEntries(query), group }) : null, user?.id);
  const facilities = useApiResource<Facility[]>('/operations/facilities', user?.id);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const updating = report.refreshing || trend.refreshing;
  const timestamp = Date.parse(report.data?.asOf ?? '');
  const items = report.data?.items ?? [];

  function change(values: Record<string, string>) {
    setExportError('');
    setParams(previous => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
      return next;
    }, { replace: true, preventScrollReset: true });
  }

  function selectPeriod(value: Period) {
    change({ period: value, ...(value === 'custom' ? { from, to } : reportPreset(value, today)) });
  }
  function refresh() {
    report.refresh();
    trend.refresh();
    if (facilities.error) facilities.refresh();
  }

  async function download() {
    if (!valid || exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setExportError('');
    try {
      const blob = await apiRequest<Blob>('/operations/reports/invoices.csv?' + query, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'nestbox-hoa-don.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không thể xuất hóa đơn CSV.');
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  const facilityKnown = facilities.data?.some(item => item.id === facilityId);
  const rangeLabel = from && to ? (from === to ? displayDate(from) : displayDate(from) + ' – ' + displayDate(to))
    : from ? 'Từ ' + displayDate(from) : to ? 'Đến ' + displayDate(to) : 'Tất cả thời gian';

  return <section className="bom-report">
    <PageHeader title="Doanh thu và hiệu quả cơ sở">
      <button type="button" className="button-secondary" disabled={!valid || updating || report.loading || trend.loading} onClick={refresh}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
      </button>
      <button type="button" className="button-primary" disabled={!valid || exporting} onClick={() => void download()}>
        <Download size={16} aria-hidden="true" />{exporting ? 'Đang xuất CSV…' : 'Xuất hóa đơn CSV'}
      </button>
    </PageHeader>

    <div className="portal-toolbar bom-report-filters" role="group" aria-label="Bộ lọc báo cáo">
      <label className="field-label">Cơ sở
        <select aria-label="Cơ sở" value={facilityId} onChange={event => change({ facilityId: event.target.value })}>
          <option value="">Tất cả cơ sở</option>
          {facilityId && !facilityKnown && <option value={facilityId}>{report.data?.items[0]?.name ?? (facilities.loading ? 'Đang tải cơ sở…' : 'Cơ sở đã chọn')}</option>}
          {facilities.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="field-label">Kỳ báo cáo
        <select aria-label="Kỳ báo cáo" value={period} onChange={event => selectPeriod(event.target.value as Period)}>
          {Object.entries(periods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <DateRangePicker
        from={{ label: 'Từ ngày', value: from, onChange: value => change({ period: 'custom', from: value, to }) }}
        to={{ label: 'Đến ngày', value: to, onChange: value => change({ period: 'custom', from, to: value }) }} />
    </div>

    <div className="bom-report-period">
      {valid ? <span><strong>{rangeLabel}</strong> · UTC+7</span>
        : <span role="alert" className="bom-report-error">Chọn ngày hợp lệ. Từ ngày phải trước hoặc bằng Đến ngày.</span>}
      <div>{Number.isFinite(timestamp) && <span>Cập nhật {updatedAt.format(timestamp)}</span>}<RefreshStatus active={updating} /></div>
    </div>
    <LoadState loading={false} error={facilities.error} retry={facilities.refresh} />
    {exportError && <div className="booking-alert is-error" role="alert">{exportError}</div>}
    <LoadState loading={false} error={report.error} retry={report.refresh} />
    {(report.loading || items.length > 0) && <>
      <ReportMetrics items={items} loading={report.loading} />
      <ReportFinances items={items} invoiceCount={trend.data?.invoiceCount} loading={report.loading} />
      <section className="bom-report-panel">
        <h2>Xu hướng tài chính theo {group === 'day' ? 'ngày' : 'tháng'}</h2>
        <LoadState loading={false} error={trend.error} retry={trend.refresh} />
        <ReportTrend trend={trend.data} group={group} loading={trend.loading} />
      </section>
      <ReportComparison items={items} />
      <ReportTrendTable trend={trend.data} group={group} loading={trend.loading} />
    </>}
    {report.data && !items.length && <Empty title="Không có cơ sở phù hợp" description="Chọn lại phạm vi cơ sở để xem báo cáo." />}
  </section>;
}
