import type { CustomerInvoice } from '../../types/customer';
import { moneyLabel } from './CustomerPortalHelpers';
import '../../styles/invoice-breakdown.css';

const serviceBillingLabels = { ONE_TIME: 'Một lần', DAY: 'Theo ngày', MONTH: 'Theo tháng' };

export function InvoiceBreakdown({ details, currency }: { details?: CustomerInvoice['breakdown']; currency?: string }) {
  const money = (amount: number) => moneyLabel(amount, currency);
  if (!details) return <p className="invoice-breakdown-note">Chứng từ này lưu số tiền tổng hợp.</p>;
  return <div className="invoice-breakdown">
    {!!details.units.length && <section>
      <h3>Chi tiết từng kho</h3>
      <div className="customer-table-wrap customer-responsive-table"><table className="customer-table">
        <thead><tr><th scope="col">Kho và hợp đồng</th><th scope="col">Tiền thuê</th><th scope="col">Tiền cọc</th><th scope="col">Tổng</th></tr></thead>
        <tbody>{details.units.map(unit => <tr key={unit.contractId}>
          <th scope="row" data-label="Kho và hợp đồng"><strong>{unit.unitCode}</strong><small>{unit.storageTypeName} · {unit.contractCode}</small></th>
          <td data-label="Tiền thuê"><span>{money(unit.rentalAmount)}<small>Giá tháng {money(unit.monthlyRate)}</small>
            {!!unit.discountAmount && <small>Đã giảm {money(unit.discountAmount)}</small>}</span></td><td data-label="Tiền cọc">{money(unit.depositAmount)}</td>
          <td data-label="Tổng"><strong>{money(unit.rentalAmount + unit.depositAmount)}</strong></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    {!!details.sharedServices.length && <section>
      <h3>Dịch vụ chung</h3>
      <div className="customer-table-wrap customer-responsive-table"><table className="customer-table">
        <thead><tr><th scope="col">Dịch vụ</th><th scope="col">Số lượng</th><th scope="col">Đơn giá</th><th scope="col">Thành tiền</th></tr></thead>
        <tbody>{details.sharedServices.map(service => <tr key={service.id}>
          <th scope="row" data-label="Dịch vụ"><strong>{service.name}</strong><small>{serviceBillingLabels[service.billingUnit]}</small></th>
          <td data-label="Số lượng">{service.quantity} {service.physicalUnit}{service.billablePeriods ? ` × ${service.billablePeriods} ${service.billingUnit === 'DAY' ? 'ngày' : 'tháng'}` : ''}</td>
          <td data-label="Đơn giá">{money(service.unitPrice)}</td><td data-label="Thành tiền"><strong>{money(service.amount)}</strong></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
