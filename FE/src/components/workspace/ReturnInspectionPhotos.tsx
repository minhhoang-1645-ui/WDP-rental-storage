import { first, rows, type Row } from '../manager/portal-data';
import { evidenceLinks, EvidenceLinks, EvidenceSubmissions } from './EvidenceLinks';

export function inspectionPhotos(inspection: Row): string[] {
  return Array.isArray(inspection.inspectionPhotos) ? inspection.inspectionPhotos.filter((photo): photo is string =>
    typeof photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(photo)) : [];
}

export function ReturnInspectionPhotos({ inspection }: { inspection: Row }) {
  const photos = inspectionPhotos(inspection);
  const links = evidenceLinks(first(inspection, 'conditionNote'));
  const title = 'Ảnh kiểm tra kho ' + first(inspection, 'unit.unitCode');
  if (rows(inspection.evidenceSubmissions).length > 0) return <div>
    <h3>{title}</h3>
    <EvidenceSubmissions value={inspection.evidenceSubmissions} title={title} />
  </div>;
  if (!photos.length && !links.length) return null;
  return <div>
    <h3>Ảnh kiểm tra kho {first(inspection, 'unit.unitCode')}</h3>
    {photos.length > 0 && <div className="staff-handover-photos">
      {photos.map((photo, index) => <img key={index} src={photo}
        alt={`Ảnh kiểm tra kho ${first(inspection, 'unit.unitCode')} (${index + 1})`} loading="lazy" />)}
    </div>}
    <EvidenceLinks links={links} />
  </div>;
}
