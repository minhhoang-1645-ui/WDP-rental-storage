import { label } from '../manager/portal-data';
import { LoadState } from '../manager/PortalUi';
import { maintenanceMoney } from '../manager/MaintenanceCosts';

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

export function MaintenanceCostTable({ className, data, loading, error, refresh }: {
  className: string; data?: MaintenanceCostReport | null; loading: boolean; error: string; refresh: () => void;
}) {
  const maintenanceItems = data?.items ?? [];
  return <>
    <section className={className}>
      <h2>Chi phí bảo trì</h2>
      <p>Số phiếu và khoản chờ xác nhận theo ngày tạo phiếu. Chi phí đã xác nhận và các điều chỉnh thuộc kỳ xác nhận lần đầu.</p>
      <LoadState loading={loading} error={error} retry={refresh} />
      {data?.items.length === 0 && <p>Không có phiếu hoặc chi phí bảo trì trong kỳ.</p>}
      {maintenanceItems.length > 0 && <div style={{ overflowX: 'auto' }}>
        <table className="portal-table">
          <thead><tr><th>Tháng</th><th>Cơ sở</th><th>Loại sự cố</th><th>Số phiếu</th>
            {costColumns.map(([key, title]) => <th key={key}>{title}</th>)}
          </tr></thead>
          <tbody>{maintenanceItems.map(item => <tr key={JSON.stringify([item.month, item.facilityId, item.category])}>
            <td>{item.month}</td><td>{item.facilityName}</td><td>{label(item.category)}</td><td>{item.ticketCount}</td>
            {costColumns.map(([key]) => <td key={key}>{item[key] === null ? '—' : maintenanceMoney(item[key])}</td>)}
          </tr>)}</tbody>
          <tfoot><tr><th colSpan={3}>Tổng</th><td>{maintenanceItems.reduce((sum, item) => sum + item.ticketCount, 0)}</td>
            {costColumns.map(([key]) => {
              const values = maintenanceItems.flatMap(item => item[key] === null ? [] : [item[key]]);
              return <td key={key}>{values.length ? maintenanceMoney(values.reduce((sum, value) => sum + BigInt(value), 0n).toString()) : '—'}</td>;
            })}
          </tr></tfoot>
        </table>
      </div>}
    </section>
    {Boolean(data?.revenue?.length) && <section className={className}>
      <h2>Doanh thu theo hóa đơn</h2>
      <p>Chỉ gồm tiền thuê và tiền dịch vụ trên hóa đơn có hiệu lực trong kỳ.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="portal-table">
          <thead><tr><th>Cơ sở</th><th>Doanh thu thuê kho</th><th>Doanh thu dịch vụ</th><th>Tổng doanh thu</th></tr></thead>
          <tbody>{data?.revenue.map(item => <tr key={item.facilityId}>
            <th scope="row">{item.facilityName}</th><td>{maintenanceMoney(item.rentVnd)}</td><td>{maintenanceMoney(item.servicesVnd)}</td>
            <td>{maintenanceMoney(item.totalVnd)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </>;
}
