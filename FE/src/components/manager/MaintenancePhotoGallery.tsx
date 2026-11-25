import { useEffect, useReducer, useState } from 'react';
import { apiRequest } from '../../services/api';

export function MaintenancePhotoGallery({ record, ids }: { record: string; ids: string[] }) {
  if (!ids.length) return null;
  return <div className="maintenance-evidence">
    <h3>Hình ảnh sự cố</h3>
    <ul className="incident-photos">{ids.map((id, index) => <li key={id}>
      <MaintenancePhoto path={`/manager/maintenance/${encodeURIComponent(record)}/photos/${encodeURIComponent(id)}`} index={index + 1} />
    </li>)}</ul>
  </div>;
}

function MaintenancePhoto({ path, index }: { path: string; index: number }) {
  const [version, retry] = useReducer((value: number) => value + 1, 0);
  const [result, setResult] = useState<{ url: string; error: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void apiRequest<Blob>(path, { responseType: 'blob', headers: { Accept: 'image/jpeg, image/png, image/webp' }, signal: controller.signal })
      .then(photo => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(photo);
        setResult({ url, error: false });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ url: '', error: true }); });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, version]);
  if (result?.error) return <button type="button" className="button-secondary" onClick={() => { setResult(undefined); retry(); }}>Tải lại ảnh {index}</button>;
  if (!result) return <span role="status">Đang tải ảnh {index}…</span>;
  return <a href={result.url} target="_blank" rel="noreferrer"><img src={result.url} alt={`Ảnh sự cố ${index}, mở ảnh đầy đủ`} /></a>;
}
