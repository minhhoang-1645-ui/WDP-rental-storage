import { first, type Row } from '../manager/portal-data';

export function inspectionPhotos(inspection: Row): string[] {
  return Array.isArray(inspection.inspectionPhotos) ? inspection.inspectionPhotos.filter((photo): photo is string =>
    typeof photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(photo)) : [];
}

export function ReturnInspectionPhotos({ inspection }: { inspection: Row }) {
  const photos = inspectionPhotos(inspection);
  const links = [...first(inspection, 'conditionNote').matchAll(/^Chứng cứ: (https:\/\/[^\s]+)$/gm)];
  if (!photos.length && !links.length) return null;
  return <div>
    <h3>Ảnh kiểm tra kho {first(inspection, 'unit.unitCode')}</h3>
    {photos.length > 0 && <div className="staff-handover-photos">
      {photos.map((photo, index) => <img key={index} src={photo}
        alt={`Ảnh kiểm tra kho ${first(inspection, 'unit.unitCode')} (${index + 1})`} loading="lazy" />)}
    </div>}
    {links.length > 0 && <ul>{links.map((match, index) =>
      <li key={index}><a href={match[1]} target="_blank" rel="noreferrer">Mở liên kết ảnh {index + 1}</a></li>)}</ul>}
  </div>;
}
