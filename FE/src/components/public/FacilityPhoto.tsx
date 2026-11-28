import { useState } from 'react';
import { Warehouse } from 'lucide-react';

export function FacilityPhoto({ photo, name }: { photo?: string | null; name: string }) {
  const [failedPhoto, setFailedPhoto] = useState<string>();
  return photo && photo !== failedPhoto
    ? <img className="public-facility-photo" src={photo} alt={'Ảnh cơ sở ' + name} loading="lazy" onError={() => setFailedPhoto(photo)} />
    : <div className="landing-warehouse-placeholder"><Warehouse size={64} aria-hidden="true" /><span>Chưa có ảnh cơ sở</span></div>;
}
