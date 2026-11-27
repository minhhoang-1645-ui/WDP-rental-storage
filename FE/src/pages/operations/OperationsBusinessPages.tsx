import { Download, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { Empty, LoadState, PageHeader, RefreshStatus } from '../../components/manager/PortalUi';
import { DateRangePicker } from '../../components/workspace/DateTimeFields';
import { useApiResource } from '../../services/useApiResource';
import { vietnamCalendarDate } from '../../utils/business-date';
import { isReportDay, reportBucketLabel } from '../../utils/reporting';
import { downloadReportWorkbook, excelMoney, reportInvoiceSheet, type ReportSheet } from '../../utils/report-workbook';
import { ReportComparison, ReportDateContext, ReportFinances, ReportMetrics, ReportTrend, ReportTrendTable } from './OperationsReportSections';
import { displayDate, occupancy, periods, reportPreset, reportTrendGroup, sumMoney, type Facility, type Period, type PerformanceReport, type Trend } from './operations-report-data';
import './operations-report.css';
import { MaintenanceCostTable, type MaintenanceCostReport } from '../../components/workspace/MaintenanceCostTable';

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
  const maintenance = useApiResource<MaintenanceCostReport>(valid ? '/operations/reports/maintenance-costs?' + query : null, user?.id);
  const facilities = useApiResource<Facility[]>('/operations/facilities', user?.id);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState<'finance' | 'invoices' | null>(null);
  const exportLock = useRef(false);
  const updating = report.refreshing || trend.refreshing || maintenance.refreshing;
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
    maintenance.refresh();
    if (facilities.error) facilities.refresh();
  }

  async function download(kind: 'finance' | 'invoices') {
    if (!valid || exportLock.current || (kind === 'finance' && (!report.data || !trend.data))) return;
    exportLock.current = true;
    setExporting(kind);
    setExportError('');
    try {
      const invoices = await reportInvoiceSheet('/operations/reports/invoices.csv?' + query);
      const sheets: ReportSheet[] = [invoices];
      if (kind === 'finance' && trend.data) {
        const rate = occupancy(items.reduce((sum, item) => sum + item.units.occupied, 0),
          items.reduce((sum, item) => sum + item.units.total, 0));
        const rentByName = new Map<string, bigint>();
        const typeIndex = invoices.headers.indexOf('Loại kho');
        const rentIndex = invoices.headers.indexOf('Tiền thuê VND');
        for (const row of invoices.rows) {
          const type = row[typeIndex], rent = row[rentIndex];
          if (typeof type === 'string' && typeof rent === 'number') rentByName.set(type, (rentByName.get(type) ?? 0n) + BigInt(rent));
        }
        sheets.unshift(
          { name: 'Tổng quan tài chính', headers: ['Chỉ số', 'Giá trị', 'Phạm vi', 'Định nghĩa'], moneyColumns: [2], rows: [
            ['Tiền thuê đã lập hóa đơn', excelMoney(sumMoney(items, 'rent')), 'Trong kỳ', 'Phần tiền thuê trên hóa đơn phát hành trong kỳ.'],
            ['Tiền đã thu', excelMoney(sumMoney(items, 'received')), 'Trong kỳ', 'Khoản thu đã ghi nhận, bao gồm tiền cọc.'],
            ['Công nợ hiện tại', excelMoney(sumMoney(items, 'debt')), 'Hiện tại', 'Số dư còn phải thu tại thời điểm báo cáo.'],
          ] },
          { name: 'Tiền thuê theo loại kho', headers: ['Tên loại kho trên danh sách hóa đơn', 'Tiền thuê trên hóa đơn'],
            moneyColumns: [2], rows: Array.from(rentByName, ([name, rent]) => [name, excelMoney(rent)]) },
        );
        sheets.push(
          { name: 'Xu hướng tài chính', headers: ['Mốc thời gian', 'Tiền thuê đã lập hóa đơn', 'Tiền đã thu', 'Đơn đặt'], moneyColumns: [2, 3],
            rows: trend.data.times.map(row => [reportBucketLabel(row.date, group), excelMoney(row.rent), excelMoney(row.received), row.bookings]) },
          { name: 'So sánh hiệu quả cơ sở', headers: ['Cơ sở', 'Tiền thuê trong kỳ', 'Tiền thu trong kỳ', 'Công nợ hiện tại', 'Tỷ lệ sử dụng kho'],
            moneyColumns: [2, 3, 4], rows: items.map(item => {
              const usage = occupancy(item.units.occupied, item.units.total);
              return [item.name, excelMoney(item.rent), excelMoney(item.received), excelMoney(item.debt), usage === null ? null : usage / 100];
            }).concat([['Toàn phạm vi', excelMoney(sumMoney(items, 'rent')), excelMoney(sumMoney(items, 'received')),
              excelMoney(sumMoney(items, 'debt')), rate === null ? null : rate / 100]]) },
        );
      }
      await downloadReportWorkbook(kind === 'finance' ? 'nestbox-bao-cao-tai-chinh-bom' : 'nestbox-hoa-don-bom', {
        title: kind === 'finance' ? 'Báo cáo tài chính BOM' : 'Danh sách hóa đơn',
        scope: scopeLabel, period: rangeLabel,
      }, sheets);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không thể xuất báo cáo Excel.');
    } finally {
      exportLock.current = false;
      setExporting(null);
    }
  }

  const facilityKnown = facilities.data?.some(item => item.id === facilityId);
  const rangeLabel = from && to ? (from === to ? displayDate(from) : displayDate(from) + ' – ' + displayDate(to))
    : from ? 'Từ ' + displayDate(from) : to ? 'Đến ' + displayDate(to) : 'Tất cả thời gian';
  const scopeLabel = facilityId
    ? facilities.data?.find(item => item.id === facilityId)?.name ?? items[0]?.name ?? 'Cơ sở đã chọn'
    : 'Tất cả cơ sở';
  const dateContext = <ReportDateContext trend={trend.data} facility={scopeLabel} range={rangeLabel} openRange={!from || !to} group={group} />;

  return <section className="bom-report">
    <PageHeader title="Doanh thu và hiệu quả cơ sở">
      <button type="button" className="button-secondary" disabled={!valid || updating || report.loading || trend.loading} onClick={refresh}>
        <RefreshCw size={16} aria-hidden="true" />Làm mới
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
      <button type="button" className="button-primary" disabled={!valid || !report.data || !trend.data || updating || Boolean(exporting)} onClick={() => void download('finance')}>
        <Download size={16} aria-hidden="true" />{exporting === 'finance' ? 'Đang xuất…' : 'Xuất báo cáo tài chính'}
      </button>
      <button type="button" className="button-secondary" disabled={!valid || Boolean(exporting)} onClick={() => void download('invoices')}>
        <Download size={16} aria-hidden="true" />{exporting === 'invoices' ? 'Đang xuất…' : 'Xuất danh sách hóa đơn'}
      </button>
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
        {dateContext}
        <LoadState loading={false} error={trend.error} retry={trend.refresh} />
        <ReportTrend trend={trend.data} group={group} loading={trend.loading} />
      </section>
      <ReportComparison items={items} />
      <ReportTrendTable trend={trend.data} group={group} loading={trend.loading} context={dateContext} />
    </>}
    {report.data && !items.length && <Empty title="Không có cơ sở phù hợp" description="Chọn lại phạm vi cơ sở để xem báo cáo." />}
    {valid && <MaintenanceCostTable className="bom-report-panel" data={maintenance.data} loading={maintenance.loading} error={maintenance.error} refresh={maintenance.refresh} />}

  </section>;
}
