import { useState } from 'react';
import { Text } from 'react-native';
import { OperationForm, type FormAction } from './form';
import { rows, type Row } from './model';
import { RecordView } from './record-view';
import { Panel, styles } from './ui';

export const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function Availability({ catalog, root }: { catalog?: Row; root: string }) {
  const [result, setResult] = useState<Row>();
  const [revision, setRevision] = useState(0);
  const products = rows(catalog?.products);
  if (!products.length) return null;
  const action: FormAction = { title: 'Kiểm tra khả dụng toàn kỳ', submitTitle: 'Kiểm tra', path: '/booking/availability', method: 'POST', description: 'Chỉ kiểm tra, không giữ kho. Giá và kết quả lấy từ BE.', fields: [
    { name: 'productId', title: 'Loại kho', required: true, choices: products.map(row => ({ value: String(row.id), label: String(row.name) })), initial: String(products[0].id) },
    { name: 'quantity', title: 'Số kho', required: true, numeric: true, minimum: 1, maximum: 3, initial: '1' },
    { name: 'startDate', title: 'Ngày bắt đầu (YYYY-MM-DD)', required: true, maxLength: 10 },
    { name: 'periodMode', title: 'Cách chọn kỳ thuê', required: true, choices: [{ value: 'duration', label: 'Số tháng' }, { value: 'dates', label: 'Ngày kết thúc' }], initial: 'duration' },
    { name: 'durationMonths', title: 'Số tháng (khi chọn thuê theo tháng)', choices: (Array.isArray(catalog?.approvedDurations) ? catalog.approvedDurations : [1, 3, 6, 12]).map(value => ({ value: String(value), label: `${value} tháng` })), initial: '3' },
    { name: 'endDate', title: 'Ngày kết thúc (khi chọn theo ngày, YYYY-MM-DD)', maxLength: 10 },
    { name: 'paymentPlan', title: 'Kế hoạch thanh toán', required: true, choices: [{ value: 'PAY_MONTHLY', label: 'Hàng tháng' }, { value: 'PREPAID', label: 'Trả trước' }], initial: 'PAY_MONTHLY' },
    { name: 'adjacencyPreference', title: 'Ưu tiên kho gần nhau', checkbox: true, initial: 'false' },
  ], transform: input => ({ ...input, durationMonths: input.periodMode === 'duration' ? Number(input.durationMonths) : undefined, endDate: input.periodMode === 'dates' ? input.endDate : undefined }), validate: input => !validDate(input.startDate) ? 'Ngày bắt đầu không hợp lệ.' : input.periodMode === 'dates' && (!validDate(input.endDate) || String(input.endDate) <= String(input.startDate)) ? 'Ngày kết thúc phải hợp lệ và sau ngày bắt đầu.' : input.periodMode === 'duration' && ![1, 3, 6, 12].includes(Number(input.durationMonths)) ? 'Chọn số tháng được hỗ trợ.' : undefined };
  return <><OperationForm key={revision} action={action} onClose={() => { setResult(undefined); setRevision(value => value + 1); }} onSaved={setResult} />{result && <Panel title="Kết quả từ hệ thống"><Text style={styles.copy}>{result.available === true ? 'Còn kho phù hợp toàn kỳ.' : 'Chưa thể đáp ứng toàn kỳ.'}</Text><RecordView row={result} root={root} /></Panel>}</>;
}
