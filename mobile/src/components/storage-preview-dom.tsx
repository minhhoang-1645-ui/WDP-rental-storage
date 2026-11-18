'use dom';

import Viewer, { type StoragePreviewSize } from './storage-architectural-viewer';

export default function StoragePreview({size, assetOrigin}: {size: StoragePreviewSize; assetOrigin: string; dom: import('expo/dom').DOMProps}) {
  return <div className="storage-preview"><style>{`
    .storage-preview{width:100%;font-family:system-ui;background:white;overflow:hidden}
    .storage-preview .storage-viewer{height:220px;position:relative;background:#f4f6f8;border-radius:14px;overflow:hidden}
    .storage-preview canvas{touch-action:none}.storage-preview :is(.viewer-badge,.viewer-hint){position:absolute;left:10px;font-size:12px;background:white;padding:5px 8px;border-radius:6px;pointer-events:none}
    .storage-preview .viewer-badge{top:8px}.storage-preview .viewer-hint{bottom:6px}.storage-preview .viewer-controls{position:absolute;right:6px;top:42px;display:flex;flex-direction:column;gap:4px}
    .storage-preview button{width:40px;height:40px;border:1px solid #d0d5dd;background:white;border-radius:8px;color:#123e85;display:grid;place-items:center}
    .storage-preview .viewer-scene-loading{position:absolute;top:90px;left:20px;background:white;padding:10px;font-size:14px}
    .storage-preview .viewer-fallback{height:220px;position:relative}.storage-preview .viewer-fallback img{width:100%;height:160px;object-fit:contain}.storage-preview .viewer-fallback div{font-size:13px;display:grid;gap:4px}
  `}</style><Viewer key={size.id + size.dimensions} size={size} assetOrigin={assetOrigin} /></div>;
}
