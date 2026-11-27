import { date, first, rows } from '../manager/portal-data';

export function evidenceLinks(note: string) {
  return [...note.matchAll(/^Chứng cứ: (https:\/\/[^\s]+)$/gm)].map(match => match[1]);
}

export function EvidenceLinks({ links }: { links: string[] }) {
  if (!links.length) return null;
  return <ul>{[...new Set(links)].map((href, index) =>
    <li key={href}><a href={href} target="_blank" rel="noopener noreferrer">Mở liên kết ảnh {index + 1}</a></li>)}</ul>;
}
export function EvidenceSubmissions({ value, title }: { value: unknown; title: string }) {
  return <>{rows(value).map(submission => {
    const photos = Array.isArray(submission.photos) ? submission.photos.filter((photo): photo is string =>
      typeof photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(photo)) : [];
    const links = evidenceLinks(first(submission, 'note'));
    const recordedAt = first(submission, 'recordedAt');
    if (!photos.length && !links.length) return null;
    return <div key={first(submission, 'id')}>
      <p className="record-attribution">{[first(submission, 'staffName'), recordedAt &&
        date(recordedAt, true)].filter(Boolean).join(' · ')}</p>
      {photos.length > 0 && <div className="staff-handover-photos">{photos.map((photo, index) =>
        <img key={index} src={photo} alt={`${title} ${index + 1}`} loading="lazy" />)}</div>}
      <EvidenceLinks links={links} />
    </div>;
  })}</>;
}
