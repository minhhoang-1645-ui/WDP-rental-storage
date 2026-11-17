import { Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { at, codeOf, idOf, label, object, rows, text, type Row } from '@/operations/model';
import { Facts, Navigation, Panel, money } from '@/operations/ui';
import { RecordView } from '@/operations/record-view';
import { staffStyles as s, StaffStatusBadge } from './staff-ui';
import { formatDate } from '@/utils/format';
import { hasStaffValue } from '@/utils/staff-values';
import { StaffInfoGrid } from './staff-info-grid';

type Field = [string, string];
const essentials: Record<string, Field[]> = {
  reservations: [['Loại kho', 'product.name|storageType.name'], ['Số kho', 'quantity'], ['Bắt đầu', 'startDate'], ['Kết thúc (không bao gồm)', 'endDateExclusive|endDate']],
  inquiries: [['Nhu cầu tư vấn', 'customerNotes|note|subject'], ['Loại kho quan tâm', 'product.name|storageType.name']],
  appointments: [['Lịch bàn giao', 'scheduledAt'], ['Điều kiện sử dụng', 'usageStatus']],
  'support-requests': [['Vấn đề', 'subject'], ['Nhân viên phụ trách', 'assignedStaff.fullName'], ['Mức ưu tiên', 'priority']],
  'stock-movements': [['Loại phiếu', 'type'], ['Lịch dự kiến', 'scheduledAt'], ['Nhân viên kiểm đếm', 'assignedStaff.fullName']],
  renewals: [['Hạn hiện tại', 'previousEndDate'], ['Hạn mới đề nghị', 'requestedEndDate'], ['Kế hoạch thanh toán', 'paymentPlan']],
  transfers: [['Kho nguồn', 'fromUnit.unitCode'], ['Kho đích', 'toUnit.unitCode'], ['Chuyển thực tế lúc', 'completedAt']],
  returns: [['Tiếp nhận trả lúc', 'physicallyReturnedAt'], ['Loại hàng còn trong kho', 'inventory.remainingItemTypes'], ['Phiếu nhập/xuất chưa xong', 'inventory.pendingMovements'], ['Kết quả', 'completionNote|note']],
  maintenance: [['Vấn đề', 'description'], ['Nhân viên phụ trách', 'assignedStaff.fullName'], ['Kết quả', 'completionNote|workNote|resolutionNote']],
};
const categories: [string, string[]][] = [
  ['Khách hàng và liên hệ', ['customer', 'requestedBy']],
  ['Kho và phân bổ', ['unit', 'storageUnit', 'product', 'storageType', 'allocatedUnits', 'reservationUnits', 'allocations', 'fromUnit', 'toUnit', 'currentAllocation', 'futureAllocations', 'sourceMaintenance', 'activeMaintenance', 'futureAllocationRisk']],
  ['Giá và thanh toán', ['quote', 'quoteSnapshot', 'historicalPricing', 'billingSummary', 'financialSummary', 'invoices', 'payments', 'invoice', 'depositSettlement', 'settlement', 'outstandingInvoice', 'initialPaymentBreakdown', 'paymentPlan']],
  ['Hợp đồng và hồ sơ thuê', ['reservation', 'contract', 'rentalContract', 'contracts', 'appendix', 'renewalRequest', 'returnRequest']],
  ['Nội dung và phản hồi', ['description', 'customerNotes', 'internalNotes', 'note', 'resolutionNote', 'resolutionType', 'reason', 'conditionNote', 'escalationNote', 'escalationReason', 'completionNote', 'workNote', 'response', 'responses', 'supportRequest', 'transfers']],
  ['Hàng hóa và kiểm đếm', ['lines']],
  ['Biên bản kiểm tra', ['inspections', 'physicalInspections', 'inspectionSummary']],
  ['Lịch sử xử lý', ['createdAt', 'updatedAt', 'requestedAt', 'contactedAt', 'startedAt', 'completedAt', 'assignedAt', 'approvedAt', 'rejectedAt', 'resolvedAt', 'escalatedAt', 'escalatedBy', 'confirmedAt', 'expiresAt', 'reviewedAt', 'events', 'history', 'timeline', 'assignedStaff', 'assignedBy', 'processedBy', 'reviewedBy', 'completedBy', 'resolvedBy']],
];
const fieldNames: Record<string, string> = { escalationReason: 'Lý do chuyển quản lý', escalatedAt: 'Chuyển quản lý lúc', description: 'Nội dung', customerNotes: 'Khách ghi chú', internalNotes: 'Ghi chú nội bộ', note: 'Ghi chú', resolutionNote: 'Phản hồi xử lý', resolutionType: 'Kết quả xử lý', reason: 'Lý do', conditionNote: 'Hiện trạng', escalationNote: 'Lý do chuyển cấp', completionNote: 'Kết quả thực hiện', workNote: 'Ghi nhận thực hiện', createdAt: 'Ngày tạo', updatedAt: 'Cập nhật', requestedAt: 'Ngày yêu cầu', contactedAt: 'Ngày liên hệ', startedAt: 'Bắt đầu', completedAt: 'Hoàn tất', assignedAt: 'Phân công', approvedAt: 'Chấp thuận', rejectedAt: 'Từ chối', resolvedAt: 'Giải quyết', confirmedAt: 'Xác nhận', expiresAt: 'Hạn giữ kho', reviewedAt: 'Xét duyệt' };
function shownValue(path: string, value: unknown) {
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'string' && /Date|At$/.test(path)) return formatDate(value, path.endsWith('At'));
  if (typeof value === 'string') return label(value);
  return value;
}
function pick(row: Row, spec: Field[]) {
  const used = new Set<string>();
  const values: [string, unknown][] = [];
  for (const [title, alternatives] of spec) {
    const path = alternatives.split('|').find(path => at(row, path) !== undefined && at(row, path) !== null && at(row, path) !== '');
    if (path) { used.add(path); values.push([title, shownValue(path, at(row, path))]); }
  }
  return { used, values };
}
function technicalIdentifiers(value: unknown, prefix = '', depth = 0): [string, unknown][] {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  return Object.entries(value).flatMap(([key, nested]): [string, unknown][] => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (/^id$|Id$/.test(key) && typeof nested === 'string' && nested) return [[path, nested]];
    return technicalIdentifiers(nested, path, depth + 1);
  });
}
/** Each secondary domain is independent; no combined raw-record dump. */
export function StaffRecordSections({ resource, row, section, actionArea }: { resource: string; row: Row; section?: string; actionArea?: ReactNode }) {
  const customer = text(row, 'customer.fullName', 'reservation.customer.fullName');
  const unit = text(row, 'unit.unitCode', 'storageUnit.unitCode', 'fromUnit.unitCode');
  const summary = pick(row, essentials[resource] ?? []);
  const technical = technicalIdentifiers(row);
  if (['support-requests', 'maintenance', 'stock-movements'].includes(resource) && !hasStaffValue(row.assignedStaff)) summary.values.push(['Nhân viên phụ trách', 'Chưa phân công']);
  const remainder: Row = { ...row };
  for (const key of ['id', 'reference', 'status', 'requestType', 'databaseId']) delete remainder[key];
  for (const path of summary.used) {
    if (!path.includes('.')) delete remainder[path];
    else { const [parent, child] = path.split('.'); remainder[parent] = { ...object(remainder[parent]) }; delete (remainder[parent] as Row)[child]; }
  }
  if (customer && remainder.customer) { remainder.customer = { ...object(remainder.customer) }; delete (remainder.customer as Row).fullName; }
  const quote = object(row.quote ?? row.quoteSnapshot);
  const total = at(quote, 'quotedTotalAmount') ?? at(quote, 'totalAmount') ?? at(quote, 'grandTotal');
  if (['reservations', 'renewals'].includes(resource) && typeof total === 'number') summary.values.push([resource === 'renewals' ? 'Tổng gia hạn' : 'Tổng báo giá', money(total)]);
  const sections = categories.map(([title, keys]) => {
    const data: Row = {};
    for (const key of keys) { if (hasStaffValue(remainder[key])) data[key] = remainder[key]; delete remainder[key]; }
    return { title, data };
  });
  if (section) {
    if (section === 'Chi tiết kỹ thuật') return <View style={{ gap: 12 }}><StaffInfoGrid values={technical} /><RecordView row={remainder} root="/staff" /></View>;
    const selected = sections.find(item => item.title === section);
    return selected ? <StaffSectionContent data={selected.data} /> : <Text style={s.secondary}>Không tìm thấy mục thông tin.</Text>;
  }
  for (const key of Object.keys(remainder)) if (!hasStaffValue(remainder[key]) || typeof remainder[key] === 'string' && /Code$/.test(key) && remainder[key] === codeOf(row)) delete remainder[key];
  return <View style={{ gap: 12 }}>
    <View style={{ gap: 8 }}>
      <Text style={[s.section, { fontSize: 20, lineHeight: 28 }]}>{customer || (unit ? 'Kho ' + unit : text(row, 'subject', 'product.name') || 'Hồ sơ công việc')}</Text>
      {Boolean(customer && unit) && <Text style={s.secondary}>Kho {unit}</Text>}
      <StaffStatusBadge status={String(row.status ?? '')} />
      <Text selectable style={s.secondary}>{codeOf(row)}</Text>
    </View>
    {summary.values.length > 0 && <Panel title={resource === 'inquiries' ? 'Nhu cầu tư vấn' : resource === 'reservations' ? 'Thông tin thuê' : 'Thông tin cần xử lý'}><StaffInfoGrid values={summary.values} /></Panel>}
    {resource === 'returns' && rows(row.inspections).length > 0 && <Panel title="Kết quả kiểm tra kho">{rows(row.inspections).map((inspection, index) => <View key={idOf(inspection) + ':' + index} style={{ gap: 4 }}><Text style={s.body}>{text(inspection, 'unit.unitCode', 'storageUnit.unitCode') || 'Kho ' + (index + 1)}</Text><StaffStatusBadge status={text(inspection, 'result')} /></View>)}</Panel>}
    {resource === 'stock-movements' && rows(row.lines).length > 0 && <Panel title="Đối chiếu số lượng">{rows(row.lines).map((line, index) => <Facts key={idOf(line) + ':' + index} values={[[text(line, 'storedItem.name') || 'Hàng ' + (index + 1), 'Yêu cầu: ' + String(line.requestedQty ?? '—') + ' · Thực tế: ' + String(line.actualQty ?? 'Chưa kiểm đếm')]]} />)}</Panel>}
    {actionArea}
    {sections.filter(section => Object.keys(section.data).length > 0).map(({ title, data }) => title === 'Hợp đồng và hồ sơ thuê' ? <Panel key={title} title={title}><RentalRecordSummaries data={data} resource={resource} id={idOf(row)} /></Panel> : <Navigation compact key={title} title={title} path={`/staff/record-section?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(idOf(row))}&section=${encodeURIComponent(title)}`} />)}
    {(Object.keys(remainder).length > 0 || technical.length > 0) && <Navigation compact title="Chi tiết kỹ thuật" path={`/staff/record-section?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(idOf(row))}&section=${encodeURIComponent('Chi tiết kỹ thuật')}`} />}
  </View>;
}

function RentalRecordSummaries({ data, resource, id }: { data: Row; resource: string; id: string }) {
  const contracts = [...rows(data.contracts), ...(data.contract ? [object(data.contract)] : []), ...(data.rentalContract ? [object(data.rentalContract)] : [])];
  const unique = [...new Map(contracts.map(contract => [idOf(contract) || text(contract, 'contractCode'), contract])).values()];
  return <View style={{ gap: 12 }}>{unique.slice(0, 3).map((contract, index) => <View key={`${idOf(contract)}:${index}`} style={{ gap: 8 }}>
    <Text style={s.body}>{text(contract, 'contractCode') || 'Hợp đồng thuê'}</Text>{contract.status ? <StaffStatusBadge status={String(contract.status)} /> : null}
    <StaffInfoGrid values={[["Kho", text(contract, 'unitCode', 'unit.unitCode', 'storageUnit.unitCode')], ['Bắt đầu', text(contract, 'startDate') ? formatDate(text(contract, 'startDate')) : undefined], ['Kết thúc', text(contract, 'endDate') ? formatDate(text(contract, 'endDate')) : undefined]]} />
    {idOf(contract) && <Navigation compact title="Xem đầy đủ hợp đồng" path={'/staff/contract-details?id=' + encodeURIComponent(idOf(contract))} />}
  </View>)}
    {data.reservation && <View style={{ gap: 8 }}><Text style={s.body}>{text(object(data.reservation), 'reference') || 'Hồ sơ thuê liên quan'}</Text><StaffInfoGrid values={[["Trạng thái đơn", at(data, 'reservation.status') ? label(at(data, 'reservation.status')) : undefined], ['Số kho', at(data, 'reservation.quantity')], ['Loại kho', text(data, 'reservation.storageType.name')]]} /></View>}
    <Navigation compact title="Xem đầy đủ hồ sơ thuê" path={`/staff/record-section?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(id)}&section=${encodeURIComponent('Hợp đồng và hồ sơ thuê')}`} />
  </View>;
}

function StaffSectionContent({ data }: { data: Row }) {
  return <View style={{ gap: 12 }}>{Object.entries(data).map(([key, value]) => <View key={key} style={{ gap: 8 }}>
    {key === 'lines' ? rows(value).map((line, index) => <Panel key={idOf(line) + ':' + index} title={text(line, 'storedItem.name') || 'Mặt hàng'}><Facts values={[["Mã hàng", text(line, 'storedItem.itemCode')], ['Đơn vị', text(line, 'storedItem.unit')], ['Yêu cầu', line.requestedQty], ['Thực tế', line.actualQty], ['Tồn hiện tại', at(line, 'storedItem.balance')], ['Ghi chú', line.note]]} /></Panel>) :
    typeof value !== 'object' ? <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 }}><Text style={[s.secondary, { flex: 1 }]}>{fieldNames[key] ?? label(key)}</Text><Text selectable style={[s.body, { flex: 1, textAlign: 'right' }]}>{String(shownValue(key, value) ?? '')}</Text></View> : Array.isArray(value) ? rows(value).map((item, index) => <RecordView key={idOf(item) + ':' + index} row={item} root="/staff" />) : <RecordView row={object(value)} root="/staff" />}
  </View>)}</View>;
}
