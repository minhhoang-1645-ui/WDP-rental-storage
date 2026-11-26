import { useState } from 'react';

const groups = [
  ['locker', 'Tủ lưu trữ'],
  ['smallDaily', 'Kho nhỏ thuê ngắn ngày'],
  ['other', 'Các trường hợp còn lại'],
] as const;
const terms = [3, 6, 12] as const;
const labels = {
  NONE: 'Không đặt cọc',
  FIXED_AMOUNT: 'Số tiền cố định mỗi ô',
  RENT_PERCENTAGE: 'Tỷ lệ trên tiền thuê trước giảm giá',
  MONTHLY_RENT_MULTIPLIER: 'Theo số tháng tiền thuê mỗi ô',
};
type DepositRule = { method: keyof typeof labels; amount: number };
type Deposits = Record<(typeof groups)[number][0], DepositRule>;
type Prepaid = Record<(typeof terms)[number], { enabled: boolean; percent: number }>;
type Renewal = { opensDaysBefore: number; closesDaysBefore: number; priceMode: 'CURRENT_LIST_PRICE' | 'CONTRACT_RATE' };
const earlyReturnFees = { NONE: 'Miễn phí', FIXED_AMOUNT: 'Phí cố định (đ)', UNUSED_RENT_PERCENTAGE: 'Tỷ lệ tiền thuê chưa sử dụng (%)' };
const earlyReturnRefunds = { NONE: 'Không hoàn tiền thuê trả trước', ORIGINAL_DISCOUNT: 'Hoàn theo giá đã giảm', RECALCULATE_DISCOUNT: 'Tính lại ưu đãi theo bảng đã cam kết' };
type EarlyReturn = { feeMethod: keyof typeof earlyReturnFees; feeAmount: number; refundMode: keyof typeof earlyReturnRefunds };
const overdueFees = { NONE: 'Miễn phí', FIXED_AMOUNT: 'Phí cố định (đ)', RENT_DEBT_PERCENTAGE: 'Tỷ lệ tiền thuê còn nợ (%)' };
type PaymentOverdue = { graceDays: number; managerDays: number; feeMethod: keyof typeof overdueFees; feeAmount: number };
const cancellationFields = {
  farDays: ['Mốc xa (ngày)', 2, 365], nearDays: ['Mốc gần (ngày)', 1, 364], farPercent: ['Hoàn từ mốc xa (%)', 0, 100],
  middlePercent: ['Hoàn từ mốc gần (%)', 0, 100], nearPercent: ['Hoàn sát ngày thuê (%)', 0, 100],
  startedPercent: ['Hoàn khi đã đến ngày thuê (%)', 0, 100], refundDays: ['Hạn hoàn tiền (ngày)', 1, 30],
} as const;
const returnOverdueFields = { graceDays: ['Số ngày cho phép quá hạn', 0, 7], managerDays: ['Chuyển quản lý (ngày)', 1, 30], multiplier: ['Hệ số phí (%)', 100, 150] } as const;
type Cancellation = Record<keyof typeof cancellationFields, number>;
type ReturnOverdue = Record<keyof typeof returnOverdueFields, number>;
type Config = { key: 'deposit'; value: Deposits } | { key: 'prepaid'; value: Prepaid } | { key: 'renewal'; value: Renewal } |
  { key: 'earlyReturn'; value: EarlyReturn } | { key: 'paymentOverdue'; value: PaymentOverdue } |
  { key: 'cancellation'; value: Cancellation } | { key: 'returnOverdue'; value: ReturnOverdue };
type Version = {
  id: string; version: number; effectiveFrom: string; effectiveTo: string | null;
  createdAt: string; status: string; author: string | null;
};
export type PricingPolicy = Config & {
  title: string; description: string; updatedAt: string | null; effectiveVersion: number;
  history: (Version & { value: Config['value'] })[];
};

export function readPricingPolicy(key: Config['key'], form: FormData): Config {
  if (key === 'cancellation') return { key, value: Object.fromEntries(Object.keys(cancellationFields).map(field => [field, Number(form.get(field))])) as Cancellation };
  if (key === 'returnOverdue') return { key, value: Object.fromEntries(Object.keys(returnOverdueFields).map(field => [field, Number(form.get(field))])) as ReturnOverdue };
  if (key === 'paymentOverdue') {
    const feeMethod = form.get('feeMethod') as PaymentOverdue['feeMethod'];
    return { key, value: { feeMethod, feeAmount: feeMethod === 'NONE' ? 0 : Number(form.get('feeAmount')),
      graceDays: Number(form.get('graceDays')), managerDays: Number(form.get('managerDays')) } };
  }
  if (key === 'earlyReturn') {
    const feeMethod = form.get('feeMethod') as EarlyReturn['feeMethod'];
    return { key, value: { feeMethod, feeAmount: feeMethod === 'NONE' ? 0 : Number(form.get('feeAmount')),
      refundMode: form.get('refundMode') as EarlyReturn['refundMode'] } };
  }
  if (key === 'renewal') return { key, value: {
    opensDaysBefore: Number(form.get('opensDaysBefore')),
    closesDaysBefore: Number(form.get('closesDaysBefore')),
    priceMode: form.get('priceMode') as Renewal['priceMode'],
  } };
  if (key === 'deposit') {
    const rule = (group: (typeof groups)[number][0]) => {
      const method = form.get(group + '-method') as keyof typeof labels;
      return { method, amount: method === 'NONE' ? 0 : Number(form.get(group + '-amount')) };
    };
    return { key, value: { locker: rule('locker'), smallDaily: rule('smallDaily'), other: rule('other') } };
  }
  const rule = (term: number) => ({
    enabled: form.has(term + '-enabled'), percent: Number(form.get(term + '-percent')),
  });
  return { key, value: { 3: rule(3), 6: rule(6), 12: rule(12) } };
}

export function pricingPolicySummary(key: Config['key'], value: Config['value'], showManagerThreshold = true) {
  if (key === 'cancellation') {
    const v = value as Cancellation;
    return [`Trước ngày thuê từ ${v.farDays} ngày · ${v.farPercent}%`, `Trước từ ${v.nearDays} đến dưới ${v.farDays} ngày · ${v.middlePercent}%`,
      `Trước ngày thuê dưới ${v.nearDays} ngày · ${v.nearPercent}%`, `Từ ngày thuê, kho chưa sử dụng · ${v.startedPercent}%`, `Hạn hoàn tiền hủy đơn · ${v.refundDays} ngày`].join('\n');
  }
  if (key === 'returnOverdue') {
    const v = value as ReturnOverdue;
    return `Cho phép quá hạn ${v.graceDays} ngày${showManagerThreshold ? "\nChuyển quản lý sau " + v.managerDays + " ngày" : ""}\nHệ số phí ${v.multiplier}%`;
  }
  if (key === 'paymentOverdue') {
    const terms = value as PaymentOverdue;
    const fee = terms.feeMethod === 'NONE' ? 'Miễn phí' : terms.feeMethod === 'FIXED_AMOUNT' ? `${numberFormat.format(terms.feeAmount)} VNĐ` : `${terms.feeAmount}% tiền thuê còn nợ`;
    return `Cho phép quá hạn ${terms.graceDays} ngày${showManagerThreshold ? "\nChuyển quản lý sau " + terms.managerDays + " ngày" : ""}\n${fee}`;
  }
  if (key === 'earlyReturn') {
    const terms = value as EarlyReturn;
    const fee = terms.feeMethod === 'NONE' ? 'Miễn phí' : terms.feeMethod === 'FIXED_AMOUNT' ? `${numberFormat.format(terms.feeAmount)} VNĐ` : `${terms.feeAmount}% tiền thuê chưa sử dụng`;
    return `${fee}\n${earlyReturnRefunds[terms.refundMode]}`;
  }
  if (key === 'renewal') {
    const rule = value as Renewal;
    return `Mở trước ${rule.opensDaysBefore} ngày · Đóng trước ${rule.closesDaysBefore} ngày · ${rule.priceMode === 'CONTRACT_RATE' ? 'Giá hợp đồng' : 'Giá niêm yết hiện hành'}`;
  }
  if (key === 'prepaid') {
    const rules = value as Prepaid;
    return terms.map(term => `${term} tháng ${rules[term].enabled ? 'giảm ' + rules[term].percent + '%' : 'không giảm'}`).join(' · ');
  }
  const rules = value as Deposits;
  return groups.map(([group, title]) => {
    const { method, amount } = rules[group];
    const display = method === 'NONE' ? 'Không cọc' : method === 'FIXED_AMOUNT' ? `${numberFormat.format(amount)} VNĐ/ô`
      : method === 'RENT_PERCENTAGE' ? `${amount}% tiền thuê` : `${amount} tháng tiền thuê/ô`;
    return `${title} · ${display}`;
  }).join('\n');
}

const numberFormat = new Intl.NumberFormat('vi-VN');

function NumberField({ name, label, value, min = 0, max = Number.MAX_SAFE_INTEGER, unit, errors, disabled, showHint = true, onValue, hint, draft }: {
  name: string; label: string; value: number; min?: number; max?: number; unit: string; errors: Record<string, string>; disabled?: boolean; showHint?: boolean;
  onValue?: (value: string) => void; hint?: string; draft?: string;
}) {
  return <label className="policy-field">{label}
    <span className="policy-input-unit"><input name={name} type="number" min={min} max={max} step={1} {...(draft === undefined ? { defaultValue: value } : { value: draft })}
      required={!disabled} disabled={disabled} onChange={event => onValue?.(event.target.value)} aria-invalid={Boolean(errors[name])} aria-describedby={showHint || errors[name] ? 'policy-hint-' + name : undefined} />
      <span>{unit}</span></span>
    {(showHint || errors[name]) && <small id={'policy-hint-' + name}>{errors[name] || (disabled ? 'Mức áp dụng bằng 0.' : max === Number.MAX_SAFE_INTEGER ?
      'Nhập số nguyên từ 0.' : `Từ ${numberFormat.format(min)} đến ${numberFormat.format(max)}.`)}{!errors[name] && hint && ' ' + hint}</small>}
  </label>;
}

function MethodFields({ name, amountName, method, amount, options, percentMethod, label, errors }: {
  name: string; amountName: string; method: string; amount: number; options: Record<string, string>;
  percentMethod: string; label: string; errors: Record<string, string>;
}) {
  const [selected, setSelected] = useState(method);
  return <div className="policy-field-grid">
    <label className="policy-field">Phương thức
      <select name={name} value={selected} onChange={event => setSelected(event.target.value)}>
        {Object.entries(options).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select>
    </label>
    <MethodAmount amountName={amountName} label={label} amount={amount} selected={selected} percentMethod={percentMethod} errors={errors} />
  </div>;
}

function MethodAmount({ amountName, label, amount, selected, percentMethod, errors }: {
  amountName: string; label: string; amount: number; selected: string; percentMethod: string; errors: Record<string, string>;
}) {
  const zero = selected === 'NONE';
  const [draft, setDraft] = useState(String(amount));
  return <NumberField name={amountName} label={label} value={amount} draft={zero ? '0' : draft} onValue={setDraft} max={selected === percentMethod ? 100 : undefined}
    unit={selected === percentMethod ? '%' : selected === 'MONTHLY_RENT_MULTIPLIER' ? 'tháng' : 'VNĐ'} disabled={zero} showHint={!zero && label === 'Mức phí'} errors={zero ? {} : errors} />;
}

function DepositRow({ group, title, rule, errors }: { group: string; title: string; rule: DepositRule; errors: Record<string, string> }) {
  const [method, setMethod] = useState(rule.method);
  return <div className="policy-option-row policy-deposit-row">
    <strong>{title}</strong>
    <label className="policy-field">Phương thức<select aria-label={'Phương thức đặt cọc · ' + title} name={group + '-method'} value={method} onChange={event => setMethod(event.target.value as DepositRule['method'])}>
      {Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select></label>
    <MethodAmount amountName={group + '-amount'} label="Mức cọc" amount={rule.amount} selected={method} percentMethod="RENT_PERCENTAGE" errors={errors} />
  </div>;
}

function PrepaidRow({ term, rule, errors }: { term: number; rule: Prepaid[keyof Prepaid]; errors: Record<string, string> }) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [percent, setPercent] = useState(String(rule.percent));
  const name = term + '-percent';
  return <div className="policy-option-row policy-prepaid-row">
    <strong>Trả trước {term} tháng</strong>
    <label className="policy-checkbox"><input type="checkbox" role="switch" name={term + '-enabled'} checked={enabled} onChange={event => {
      if (!event.target.checked && (!/^\d+$/.test(percent) || Number(percent) > 30)) setPercent(String(rule.percent));
      setEnabled(event.target.checked);
    }} /> Áp dụng ưu đãi</label>
    <NumberField name={name} label="Tỷ lệ giảm" value={rule.percent} draft={percent} max={30} unit="%" disabled={!enabled} onValue={setPercent} showHint={false} errors={enabled ? errors : {}} />
    {!enabled && <input type="hidden" name={name} value={percent} />}
  </div>;
}

function CancellationFields({ value, errors }: { value: Cancellation; errors: Record<string, string> }) {
  const [far, setFar] = useState(String(value.farDays));
  const [near, setNear] = useState(String(value.nearDays));
  const bands = [
    ['farPercent', far ? 'Trước ngày thuê từ ' + far + ' ngày trở lên' : 'Nhập mốc hoàn tiền sớm'],
    ['middlePercent', far && near ? 'Trước ngày thuê từ ' + near + ' đến dưới ' + far + ' ngày' : 'Nhập cả hai mốc hoàn tiền'],
    ['nearPercent', near ? 'Trước ngày thuê dưới ' + near + ' ngày' : 'Nhập mốc hoàn tiền gần ngày thuê'],
    ['startedPercent', 'Từ ngày thuê, kho chưa sử dụng'],
  ] as const;
  return <div className="policy-field-group policy-span">
    <div className="policy-field-grid">
      <NumberField name="farDays" label="Mốc hoàn tiền sớm" value={value.farDays} min={2} max={365} unit="ngày" errors={errors} onValue={setFar} hint="Từ mốc này áp dụng tỷ lệ hoàn sớm nhất." />
      <NumberField name="nearDays" label="Mốc hoàn tiền gần ngày thuê" value={value.nearDays} min={1} max={364} unit="ngày" errors={errors} onValue={setNear} hint="Mốc phân biệt hai khoảng gần ngày thuê." />
    </div>
    <table className="policy-table policy-refund-table"><thead><tr><th scope="col">Thời điểm hủy</th><th scope="col">Tỷ lệ hoàn tiền thuê <small>0% đến 100%</small></th></tr></thead>
      <tbody>{bands.map(([name, label]) => <tr key={name}><th scope="row">{label}</th>
        <td><NumberField name={name} label={label + ' (%)'} value={value[name]} max={100} unit="%" errors={errors} showHint={false} /></td></tr>)}</tbody>
    </table>
    <NumberField name="refundDays" label="Hạn xử lý hoàn tiền hủy đơn đã thanh toán" value={value.refundDays} min={1} max={30} unit="ngày" errors={errors} />
  </div>;
}

function RenewalFields({ value, errors }: { value: Renewal; errors: Record<string, string> }) {
  const [opens, setOpens] = useState(String(value.opensDaysBefore));
  const [closes, setCloses] = useState(String(value.closesDaysBefore));
  return <>
    <NumberField name="opensDaysBefore" label="Cho phép yêu cầu gia hạn trước ngày hết hạn" value={value.opensDaysBefore} min={7} max={90} unit="ngày" errors={errors} onValue={setOpens} />
    <NumberField name="closesDaysBefore" label="Ngừng nhận yêu cầu gia hạn trước ngày hết hạn" value={value.closesDaysBefore} max={7} unit="ngày" errors={errors} onValue={setCloses} />
    {opens && closes && Number(opens) > Number(closes) && <p className="policy-span policy-muted">Khách có thể gửi yêu cầu từ {opens} ngày trước ngày hết hạn đến hết {Number(closes) ? 'mốc ' + closes + ' ngày trước ngày hết hạn' : 'ngày liền trước ngày hết hạn'}.</p>}
    <label className="policy-field policy-span">Cách xác định giá gia hạn<select name="priceMode" defaultValue={value.priceMode}>
      <option value="CURRENT_LIST_PRICE">Giá niêm yết hiện hành</option><option value="CONTRACT_RATE">Giá hợp đồng</option>
    </select></label>
  </>;
}

export function PricingPolicyFields({ policy, errors }: { policy: PricingPolicy; errors: Record<string, string> }) {
  if (policy.key === 'cancellation') return <CancellationFields value={policy.value} errors={errors} />;
  if (policy.key === 'returnOverdue') return <>
    <NumberField name="graceDays" label="Thời gian cho phép quá hạn" value={policy.value.graceDays} max={7} unit="ngày" errors={errors} />
    <NumberField name="managerDays" label="Chuyển quản lý sau" value={policy.value.managerDays} min={1} max={30} unit="ngày" errors={errors} />
    <NumberField name="multiplier" label="Hệ số phí sử dụng kho" value={policy.value.multiplier} min={100} max={150} unit="%" errors={errors} />
    <p className="policy-span policy-muted">Mức 100% bằng phí cơ sở. Mức 120% và 150% lần lượt bằng 1,2 và 1,5 lần phí cơ sở.</p>
  </>;
  if (policy.key === 'paymentOverdue') return <>
    <NumberField name="graceDays" label="Thời gian cho phép quá hạn" value={policy.value.graceDays} max={30} unit="ngày" errors={errors} />
    <NumberField name="managerDays" label="Chuyển quản lý sau" value={policy.value.managerDays} min={1} max={60} unit="ngày" errors={errors} />
    <div className="policy-field-group policy-span"><h3>Phí chậm thanh toán</h3>
      <MethodFields name="feeMethod" amountName="feeAmount" method={policy.value.feeMethod} amount={policy.value.feeAmount}
        options={overdueFees} percentMethod="RENT_DEBT_PERCENTAGE" label="Mức phí" errors={errors} />
      <p className="policy-muted">Sau thời gian cho phép quá hạn, mỗi hóa đơn đủ điều kiện chỉ bị tính phí một lần. Khi tính theo tỷ lệ, chỉ dùng phần tiền thuê còn nợ đã xác định được.</p>
    </div>
  </>;
  if (policy.key === 'earlyReturn') return <>
    <div className="policy-field-group policy-span"><h3>Phí trả kho trước hạn</h3>
      <MethodFields name="feeMethod" amountName="feeAmount" method={policy.value.feeMethod} amount={policy.value.feeAmount}
        options={earlyReturnFees} percentMethod="UNUSED_RENT_PERCENTAGE" label="Mức phí" errors={errors} />
    </div>
    <div className="policy-field-group policy-span"><h3>Xử lý tiền thuê đã trả trước</h3>
      <label className="policy-field">Cách tính khoản hoàn<select name="refundMode" defaultValue={policy.value.refundMode}>
        {Object.entries(earlyReturnRefunds).map(([mode, title]) => <option key={mode} value={mode}>{title}</option>)}
      </select></label>
      <p className="policy-muted">Hoàn theo giá đã giảm dùng mức giá khách đã trả cho phần chưa sử dụng. Tính lại ưu đãi dùng số kỳ đã sử dụng và bảng ưu đãi đã cam kết.</p>
    </div>
  </>;
  if (policy.key === 'renewal') return <RenewalFields value={policy.value} errors={errors} />;
  if (policy.key === 'prepaid') {
    const value = policy.value;
    return <div className="policy-option-list policy-span">
      <p className="policy-muted">Trả từng tháng không áp dụng chiết khấu trả trước. Mức giảm mỗi kỳ từ 0% đến 30%.</p>
      {terms.map(term => <PrepaidRow key={term} term={term} rule={value[term]} errors={errors} />)}
    </div>;
  }
  const value = policy.value;
  return <div className="policy-option-list policy-span">
    {groups.map(([group, title]) => <DepositRow key={group} group={group} title={title} rule={value[group]} errors={errors} />)}
  </div>;
}

