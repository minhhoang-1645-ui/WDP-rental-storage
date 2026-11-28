import { label } from '../manager/portal-data';
import { LoadState } from '../manager/PortalUi';
import { maintenanceMoney } from '../manager/MaintenanceCosts';
import './maintenance-cost-table.css';

type MaintenanceCostGroup = {
  facilityId: string; facilityName: string; category: string; month: string; ticketCount: number;
  confirmedVnd: string | null; pendingVnd: string | null;
};

export type MaintenanceCostReport = {
  items: MaintenanceCostGroup[];
  revenue: {
    facilityId: string; facilityName: string; rentVnd: string; servicesVnd: string; totalVnd: string;
  }[];
};

const costColumns = [
  ['confirmedVnd', 'Đã xác nhận'], ['pendingVnd', 'Chờ xác nhận'],
] as const;

export function MaintenanceCostTable({ className, data, loading, error, refresh, managerFacilityId }: {
  className: string; data?: MaintenanceCostReport | null; loading: boolean; error: string; refresh: () => void;
  managerFacilityId?: string;
}) {
  const maintenanceItems = data?.items ?? [];
  const showFacility = managerFacilityId === undefined;
  const revenue = data?.revenue?.find(item => item.facilityId === managerFacilityId);
  return <>
    <section className={className}>
      <h2>Chi phí bảo trì</h2>
      <p>Số phiếu và khoản chờ xác nhận theo ngày tạo phiếu. Chi phí đã xác nhận và các điều chỉnh thuộc kỳ xác nhận lần đầu.</p>
      <LoadState loading={loading} error={error} retry={refresh} />
      {data?.items.length === 0 && <p>Không có phiếu hoặc chi phí bảo trì trong kỳ.</p>}
      {maintenanceItems.length > 0 && <div className="maintenance-report-scroll" tabIndex={0} role="region" aria-label="Bảng chi phí bảo trì">
        <table className="manager-table maintenance-report-table" aria-label="Chi phí bảo trì">
          <thead><tr><th scope="col">Tháng</th>{showFacility && <th scope="col">Cơ sở</th>}<th scope="col">Loại sự cố</th><th scope="col" className="maintenance-report-number">Số phiếu</th>
            {costColumns.map(([key, title]) => <th key={key} scope="col" className="maintenance-report-number">{title}</th>)}
          </tr></thead>
          <tbody>{maintenanceItems.map(item => <tr key={JSON.stringify([item.month, item.facilityId, item.category])}>
            <td>{item.month.replace(/^(\d{4})-(\d{2})$/, '$2/$1')}</td>{showFacility && <td>{item.facilityName}</td>}<td>{label(item.category)}</td><td className="maintenance-report-number">{item.ticketCount}</td>
            {costColumns.map(([key]) => <td key={key} className="maintenance-report-number">{item[key] === null ? '—' : maintenanceMoney(item[key])}</td>)}
          </tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={showFacility ? 3 : 2}>Tổng cộng</th><td className="maintenance-report-number">{maintenanceItems.reduce((sum, item) => sum + item.ticketCount, 0)}</td>
            {costColumns.map(([key]) => {
              const values = maintenanceItems.flatMap(item => item[key] === null ? [] : [item[key]]);
              return <td key={key} className="maintenance-report-number">{values.length ? maintenanceMoney(values.reduce((sum, value) => sum + BigInt(value), 0n).toString()) : '—'}</td>;
            })}
          </tr></tfoot>
        </table>
      </div>}
    </section>
    {(showFacility ? Boolean(data?.revenue?.length) : Boolean(revenue)) && <section className={className}>
      <h2>Doanh thu theo hóa đơn</h2>
      <p>Gồm tiền thuê và tiền dịch vụ trên hóa đơn có hiệu lực trong kỳ, tính theo ngày phát hành. Khoản thực thu được theo dõi riêng.</p>
      {revenue && <dl className="maintenance-report-kpis">
        <div><dt>Tiền thuê kho</dt><dd>{maintenanceMoney(revenue.rentVnd)}</dd></div>
        <div><dt>Tiền dịch vụ</dt><dd>{maintenanceMoney(revenue.servicesVnd)}</dd></div>
        <div><dt>Tổng doanh thu theo hóa đơn</dt><dd>{maintenanceMoney(revenue.totalVnd)}</dd></div>
      </dl>}
      {showFacility && <div className="maintenance-report-scroll" tabIndex={0} role="region" aria-label="Bảng doanh thu theo hóa đơn">
        <table className="manager-table maintenance-report-table" aria-label="Doanh thu theo hóa đơn">
          <thead><tr><th scope="col">Cơ sở</th><th scope="col" className="maintenance-report-number">Doanh thu thuê kho</th><th scope="col" className="maintenance-report-number">Doanh thu dịch vụ</th><th scope="col" className="maintenance-report-number">Tổng doanh thu</th></tr></thead>
          <tbody>{data?.revenue.map(item => <tr key={item.facilityId}>
            <th scope="row">{item.facilityName}</th><td className="maintenance-report-number">{maintenanceMoney(item.rentVnd)}</td><td className="maintenance-report-number">{maintenanceMoney(item.servicesVnd)}</td>
            <td className="maintenance-report-number">{maintenanceMoney(item.totalVnd)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}
  </>;
}
