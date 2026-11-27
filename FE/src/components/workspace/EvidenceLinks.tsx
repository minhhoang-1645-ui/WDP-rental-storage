import { date, first, rows } from '../manager/portal-data';
import { maintenanceMoney } from '../manager/MaintenanceCosts';

export function evidenceLinks(note: string) {
  return [...note.matchAll(/^Chứng cứ: (https:\/\/[^\s]+)$/gm)].map(match => match[1]);
}

export function EvidenceLinks({ links, label = 'Mở liên kết ảnh' }: { links: string[]; label?: string }) {
  if (!links.length) return null;
  return <ul>{[...new Set(links)].map((href, index) =>
    <li key={href}><a href={href} target="_blank" rel="noopener noreferrer">{label} {index + 1}</a></li>)}</ul>;
}
export function EvidenceSubmissions({ value, title, maintenance = false }: { value: unknown; title: string; maintenance?: boolean }) {
  return <>{rows(value).map(submission => {
    const photos = Array.isArray(submission.photos) ? submission.photos.filter((photo): photo is string =>
      typeof photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(photo)) : [];
    const links = evidenceLinks(first(submission, 'note'));
    const recordedAt = first(submission, 'recordedAt');
    const workNote = maintenance ? first(submission, 'note').split('\n').filter(line => !line.startsWith('Chứng cứ: ')).join('\n') : '';
    const rejection = maintenance ? first(submission, 'maintenanceRejectionReason') : '';
    const receipts = maintenance && Array.isArray(submission.maintenanceCostLinks)
      ? submission.maintenanceCostLinks.filter((link): link is string => typeof link === 'string' && /^https:\/\//i.test(link)) : [];
    if (!photos.length && !links.length && !workNote && !rejection) return null;
    return <div key={first(submission, 'id')}>
      <p className="record-attribution">{[first(submission, 'staffName'), recordedAt &&
        date(recordedAt, true)].filter(Boolean).join(' · ')}</p>
      {workNote && <p className="record-text">{workNote}</p>}
      {rejection && <p className="record-text"><strong>Yêu cầu sửa lại</strong> {rejection}</p>}
      {maintenance && submission.maintenanceCostVnd != null &&
        <p className="record-text">Chi phí đề xuất của lần sửa này <strong>{maintenanceMoney(submission.maintenanceCostVnd)}</strong></p>}
      <EvidenceLinks links={receipts} label="Mở chứng từ" />
      {photos.length > 0 && <div className="staff-handover-photos">{photos.map((photo, index) =>
        <img key={index} src={photo} alt={`${title} ${index + 1}`} loading="lazy" />)}</div>}
      <EvidenceLinks links={links} />
    </div>;
  })}</>;
}
