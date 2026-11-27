/* oxlint-disable react/jsx-key -- Facts renders each tuple inside a keyed field. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { at, customer, date, first, label, object, rows, transferHandoverSchedule, type Row } from '../../components/manager/portal-data';
import { Facts, Status } from '../../components/manager/PortalUi';
import { DetailDisclosure } from '../../components/workspace/DetailDisclosure';
import { RecordTimeline } from '../../components/workspace/RecordTimeline';
import { DocumentFile } from '../../components/customer/DocumentFile';
import type { StaffOperation } from './staff-resources';
import { transferProblem } from '../../utils/transfer-problem';
import { incidentArea } from '../../utils/maintenance-incident';
import { MaintenancePhotoGallery } from '../../components/manager/MaintenancePhotoGallery';
import { ReturnInspectionPhotos } from '../../components/workspace/ReturnInspectionPhotos';
type Fact = [string, ReactNode];

function DateFact({ value, withTime = false }: { value: string; withTime?: boolean }) {
  return <time dateTime={value}>{date(value, withTime)}</time>;
}

function facts(items: Fact[]) {
  return items.filter(([, value]) => value !== '' && value != null && value !== false);
}

function References({ items }: { items: Fact[] }) {
  const visible = facts(items);
  return visible.length ? <DetailDisclosure title="Hồ sơ liên quan"><Facts items={visible} /></DetailDisclosure> : null;
}

function Section({ title, items, note, children }: { title: string; items: Fact[]; note?: string; children?: ReactNode }) {
  const visible = facts(items);
  return <section className="manager-section">
    <h2>{title}</h2>
    {visible.length > 0 && <Facts items={visible} />}
    {note && <p className="record-text">{note}</p>}
    {children}
  </section>;
}

export function StaffOperationDetails({ resource, row, actions }: { resource: StaffOperation; row: Row; actions: ReactNode }) {
  const person = customer(row);
  const name = first(person, 'fullName');
  const assigned = first(row, 'assignedStaff.fullName');
  const reservation = first(row, 'reservation.reference');
  const contract = first(row, 'contract.contractCode');
  const dateField = (path: string, withTime = false) => {
    const value = first(row, path);
    return value && <DateFact value={value} withTime={withTime} />;
  };

  if (resource === 'transfers') {
    const handover = object(row.handoverReport);
    const { pending, review } = transferProblem(row);
    const completed = row.status === 'COMPLETED';
    const completedBy = first(row, 'completedBy.fullName', 'handoverReport.recordedByName');
    const contractId = first(row, 'contract.id');
    const transferId = first(row, 'id');
    const supportId = first(row, 'supportRequest.id');
    const maintenanceId = first(row, 'sourceMaintenance.id');
    const timeline = [
      { action: 'Gửi yêu cầu', at: first(row, 'createdAt'), actor: first(row, 'requestedBy.fullName') },
      { action: row.status === 'REJECTED' ? 'Từ chối' : 'Phê duyệt', at: first(row, 'approvedAt'), actor: first(row, 'approvedBy.fullName') },
      { action: 'Hoàn tất chuyển kho', at: first(row, 'completedAt'), actor: completedBy },
    ].filter(event => event.at || event.actor)
      .sort((left, right) => (Date.parse(left.at) || Infinity) - (Date.parse(right.at) || Infinity));
    return <>
      <section className="manager-section staff-transfer-overview">
        <h2>Thông tin điều chuyển</h2>
        <div className="staff-transfer-route">
          <TransferUnit title="Kho nguồn" unit={object(row.fromUnit)} />
          <span aria-hidden="true" className="staff-transfer-arrow">→</span>
          <TransferUnit title="Kho đích" unit={object(row.toUnit)} />
        </div>
        <Facts items={facts([
          ['Khách hàng', name], ['Cơ sở', first(row, 'facility.name')], ['Hợp đồng', contract], ['Người phụ trách', !completed ? assigned : ''],
          ['Lý do chuyển', row.reason ? label(row.reason) : ''],
          ['Quản lý phê duyệt', first(row, 'approvedBy.fullName')],
          ['Lịch bàn giao', transferHandoverSchedule(row)],
          ['Ngày hoàn tất', completed ? dateField('completedAt', true) : ''],
          ['Lý do từ chối', row.status === 'REJECTED' ? first(row, 'rejectionReason') : ''],
        ])} />
        {first(row, 'requestDescription') && <p>{first(row, 'requestDescription')}</p>}
      </section>
      {pending && <div className="booking-alert is-warning" role="status">
        Đã báo vướng mắc. Chờ quản lý xử lý.
      </div>}
      {review.decision && <Section title="Quyết định của quản lý" items={[
        ['Kết quả', review.decision === 'CANCEL' ? 'Đã hủy chuyển kho' : 'Cho tiếp tục bàn giao'],
        ['Thời điểm', first(review, 'reviewedAt') && date(review.reviewedAt, true)],
      ]} note={first(review, 'note')} />}
      {actions}
      {completed && <Section title="Kết quả chuyển kho" items={[
        ['Kết quả điều chuyển', 'Đã hoàn tất điều chuyển'],
        ['Người thực hiện', completedBy],
        ['Di chuyển hàng', handover.goodsMoved === true ? 'Đã xác nhận di chuyển hàng' : 'Chưa ghi nhận biên bản'],
        ['Người nhận kho đích', first(handover, 'recipientName')],
        ['Chìa khóa hoặc thẻ đã thu', typeof handover.returnedKeyCount === 'number' ? handover.returnedKeyCount : null],
        ['Chìa khóa hoặc thẻ đã giao', typeof handover.deliveredKeyCount === 'number' ? handover.deliveredKeyCount : null],
        ['Yêu cầu của khách', supportId && first(row, 'supportRequest.status') === 'RESOLVED' &&
          first(row, 'supportRequest.resolutionType') !== 'TRANSFER_RECOMMENDED' ? 'Đã cập nhật kết quả' : ''],
      ]} note={first(handover, 'note')}>
        {Array.isArray(handover.photos) && handover.photos.length > 0 && <div className="staff-handover-photos">
          {handover.photos.map((photo, index) => typeof photo === 'string' &&
            <img key={index} src={photo} alt={`Ảnh bàn giao chuyển kho ${index + 1}`} />)}
        </div>}
        {handover.goodsMoved === true && contractId && transferId && <DocumentFile
          path={`/staff/management/documents/contracts/${encodeURIComponent(contractId)}/transfers/${encodeURIComponent(transferId)}`}
          name={`${first(row, 'transferCode')}-BB`} description="Biên bản chuyển kho · PDF" />}
      </Section>}
      <References items={[
        ['Đơn đặt kho', reservation],
        ['Yêu cầu hỗ trợ', supportId && <Link to={`/staff/support-requests/${encodeURIComponent(supportId)}`}>{first(row, 'supportRequest.supportCode')}</Link>],
        ['Bảo trì hiện tại của kho nguồn', maintenanceId && <Link to={`/staff/maintenance/${encodeURIComponent(maintenanceId)}`}>{first(row, 'sourceMaintenance.maintenanceCode')}</Link>],
      ]} />
      {timeline.length > 0 && <DetailDisclosure title="Lịch sử xử lý"><RecordTimeline events={timeline} /></DetailDisclosure>}
    </>;
  }

  if (resource === 'returns') {
    const inspections = rows(row.inspections);
    const received = Boolean(row.physicallyReturnedAt);
    const hasResults = inspections.some(item => ['PASS', 'ISSUE_FOUND'].includes(String(item.result)));
    const settlementStatus = first(row, 'settlementStatus');
    return <>
      <Section title="Thông tin trả kho" items={[
        ['Khách hàng', name],
        ['Cơ sở', first(row, 'facility.name')],
        ['Kho trả', inspections.map(item => first(item, 'unit.unitCode')).filter(Boolean).join(', ')],
        ['Hợp đồng', inspections.map(item => first(item, 'contract.contractCode')).filter(Boolean).join(', ')],
        ...(inspections.length === 1 ? [['Hạn thuê thực tế', dateField('reservation.effectiveEndDate') ||
          <DateFact value={first(inspections[0], 'contract.endDate')} />] as Fact] : []),
        ['Loại yêu cầu', row.timing === 'EARLY' ? 'Trả trước hạn' : row.timing === 'ON_OR_AFTER_END' ? 'Trả từ ngày hết hạn' : ''],
        ['Ngày gửi yêu cầu', dateField('requestedAt', true)],
        ['Người phụ trách', assigned],
      ]} note={first(row, 'note')} />
      <section className="manager-section">
        <h2>Hướng dẫn tiếp nhận trả kho</h2>
        <p>Đối chiếu ngày khách gửi yêu cầu và hạn thuê trong hồ sơ trước khi bố trí lịch. Chuyển Quản lý cơ sở xử lý quyết toán, phí hoặc hoàn tiền.</p>
        <Link to="/staff/policies#returnNoticeDays">Tra cứu thời hạn báo trước hiện hành</Link>
      </section>
      {actions}
      {hasResults && <section className="manager-section">
        <h2>Kết quả kiểm tra</h2>
        {inspections.map(item => {
          const checkedAt = first(item, 'inspectedAt');
          const condition = first(item, 'conditionNote');
          const issue = first(item, 'issueNote');
          return <div className="staff-operation-unit" key={first(item, 'id')}>
            {inspections.length > 1 && <h3>{first(item, 'unit.unitCode')}</h3>}
            <Facts items={facts([
              ['Kết luận', <Status value={item.result} text={item.issueType === 'NORMAL_WEAR' ? 'Ghi nhận hao mòn' : undefined} />],
              ['Phân loại', item.issueType ? label(item.issueType) : ''],
              ['Người kiểm tra', first(item, 'inspectedBy.fullName')],
              ['Thời điểm kiểm tra', checkedAt && <DateFact value={checkedAt} withTime />],
              ['Hạn thuê thực tế', inspections.length > 1 && first(item, 'contract.endDate') ? <DateFact value={first(item, 'contract.endDate')} /> : null],
              ['Hiện trạng', condition],
              ['Ghi chú vấn đề', issue !== condition ? issue : ''],
            ])} />
            <ReturnInspectionPhotos inspection={item} />
          </div>;
        })}
      </section>}
      {received && <section className="manager-section">
        <h2>Kết quả tiếp nhận kho</h2>
        <Facts items={facts([
          ['Đã nhận kho thực tế', dateField('physicallyReturnedAt', true)],
          ['Người tiếp nhận', first(row, 'physicallyReturnedBy.fullName')],
          ['Quyết toán cọc', settlementStatus && <Status value={settlementStatus} text={settlementStatus === 'SETTLED' ? 'Đã quyết toán'
            : row.status === 'PENDING_SETTLEMENT' && settlementStatus === 'PENDING_REVIEW' ? 'Chờ quản lý quyết toán' : undefined} />],
        ])} />
        {inspections.map(item => {
          const unit = first(item, 'unit.unitCode');
          const maintenanceId = first(item, 'maintenance.id');
          return <div className="staff-operation-unit" key={first(item, 'id')}>
            {inspections.length > 1 && <h3>{unit}</h3>}
            <Facts items={facts([
              ['Xử lý khi nhận kho', item.result === 'ISSUE_FOUND' ? 'Chuyển bảo trì' : item.result === 'PASS' ? 'Đã nhận kho' : ''],
              ['Tình trạng kho hiện tại', first(item, 'unit.status') && <Status value={at(item, 'unit.status')} />],
              ['Phiếu bảo trì', maintenanceId && <Link to={`/staff/maintenance/${encodeURIComponent(maintenanceId)}`}>{first(item, 'maintenance.maintenanceCode')}</Link>],
            ])} />
          </div>;
        })}
      </section>}
      <References items={[[ 'Đơn đặt kho', reservation ]]} />
    </>;
  }

  if (resource === 'maintenance') {
    const location = [first(row, 'unit.unitCode'), first(row, 'unit.floor'), first(row, 'unit.zone'),
      incidentArea(row.commonArea), first(row, 'locationNote')].filter(Boolean).join(' · ');
    const returnId = first(row, 'returnContext.returnRequest.id');
    const workNote = first(row, 'workNote');
    const verification = first(row, 'verificationNote');
    return <>
      <Section title="Thông tin bảo trì" items={[
        ['Cơ sở', first(row, 'facility.name')], ['Vị trí', location], ['Loại vấn đề', row.category ? label(row.category) : ''],
        ['Ưu tiên', row.priority ? <Status value={row.priority} /> : null], ['Người phụ trách', assigned],
        ['Nguồn phát sinh', row.source ? label(row.source) : ''],
        ['Khóa đặt thuê của phiếu', row.blocksUnit === true ? 'Đang tạm chặn' : 'Không còn chặn'],
      ]} note={first(row, 'description')}>
        <MaintenancePhotoGallery record={first(row, 'id')} ids={rows(row.photos).map(photo => first(photo, 'id')).filter(Boolean)} />
      </Section>
      {actions}
      {(workNote || verification || row.workCompletedAt || row.verifiedAt || ['COMPLETED', 'AWAITING_VERIFICATION'].includes(String(row.status))) &&
        <Section title="Kết quả bảo trì" items={[
          ['Công việc đã làm', workNote], ['Ngày hoàn thành sửa chữa', dateField('workCompletedAt', true)],
          ['Nghiệm thu', row.status === 'COMPLETED' ? 'Đã nghiệm thu' : row.status === 'AWAITING_VERIFICATION' ? 'Chờ quản lý nghiệm thu' : ''],
          ['Người nghiệm thu', first(row, 'verifiedBy.fullName')], ['Ngày nghiệm thu', dateField('verifiedAt', true)],
          ['Nhận xét nghiệm thu', verification],
          ['Tình trạng kho hiện tại', first(row, 'unit.status') && <Status value={at(row, 'unit.status')} />],
        ]}>
          {Array.isArray(row.workPhotos) && row.workPhotos.length > 0 && <div className="staff-handover-photos">
            {row.workPhotos.map((photo, index) => typeof photo === 'string' &&
              <img key={index} src={photo} alt={'Ảnh kết quả sửa chữa ' + (index + 1)} />)}
          </div>}
        </Section>}
      <References items={[[ 'Trả kho', returnId && <Link to={`/staff/returns/${encodeURIComponent(returnId)}`}>{first(row, 'returnContext.returnRequest.returnCode')}</Link> ]]} />
    </>;
  }

  const phone = first(person, 'phone');
  const email = first(person, 'email');
  const resolved = row.status === 'RESOLVED';
  const escalated = row.status === 'ESCALATED';
  const invoice = first(row, 'invoice.invoiceCode');
  const transfers = rows(row.transfers);
  return <>
    <Section title="Nội dung yêu cầu" items={[
      ['Vấn đề', first(row, 'subject') || (row.category ? label(row.category) : '')], ['Kho', first(row, 'unit.unitCode')],
      ['Cơ sở', first(row, 'facility.name')],
      ['Ưu tiên', row.priority ? <Status value={row.priority} /> : null], ['Người phụ trách', assigned],
      ['Liên hệ khách hàng', (phone || email) && <span className="record-links">{phone && <a href={`tel:${phone}`}>{phone}</a>}{email && <a href={`mailto:${email}`}>{email}</a>}</span>],
    ]} note={first(row, 'description')} />
    {actions}
    {(resolved || escalated) && <Section title="Kết quả xử lý" items={[
      ['Hướng xử lý', resolved ? row.resolutionType ? label(row.resolutionType) : '' : 'Đã chuyển quản lý xem xét'],
      ['Người thực hiện', first(row, resolved ? 'resolvedBy.fullName' : 'escalatedBy.fullName')],
      [resolved ? 'Ngày hoàn tất' : 'Ngày chuyển quản lý', dateField(resolved ? 'resolvedAt' : 'escalatedAt', true)],
    ]} note={first(row, resolved ? 'resolutionNote' : 'escalationReason')} />}
    {resolved && Array.isArray(row.resolutionPhotos) && row.resolutionPhotos.length > 0 && <section className="manager-section">
      <h2>Ảnh kết quả hỗ trợ</h2>
      <div className="staff-handover-photos">{row.resolutionPhotos.map((photo, index) =>
        typeof photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(photo)
          ? <img key={index} src={photo} alt={'Ảnh hỗ trợ ' + (index + 1)} /> : null)}</div>
    </section>}
    <References items={[
      ['Đơn đặt kho', reservation], ['Hợp đồng', contract], ['Hóa đơn', invoice],
      ['Chuyển kho', transfers.length > 0 && <span className="record-links">{transfers.map(transfer =>
        <Link key={first(transfer, 'id')} to={`/staff/transfers/${encodeURIComponent(first(transfer, 'id'))}`}>{first(transfer, 'transferCode')}</Link>
      )}</span>],
    ]} />
  </>;
}

function TransferUnit({ title, unit }: { title: string; unit: Row }) {
  const unitCode = first(unit, 'unitCode', 'unitNumber');
  const position = [first(unit, 'floor'), first(unit, 'zone'), first(unit, 'row'), first(unit, 'position')].filter(Boolean).join(' · ');
  return <div className="staff-transfer-unit">
    <h3>{title}</h3>
    <strong>{unitCode || 'Chưa xác định'}</strong>
    {position && <span>{position}</span>}
    {unit.status != null && <div><span>Trạng thái hiện tại</span> <Status value={unit.status} /></div>}
  </div>;
}
