'use dom';

import Viewer from '../../../FE/src/components/public/StorageArchitecturalViewer';
import type { StorageSize } from '../../../FE/src/types/storage';

export default function StoragePreview({size, assetOrigin}: {size: StorageSize; assetOrigin: string; dom: import('expo/dom').DOMProps}) {
  return <><base href={assetOrigin + '/'}/><style>{`
    html,body,#root{margin:0;width:100%;height:100%;font-family:system-ui;background:white;overflow:hidden}
    .storage-viewer{height:220px;position:relative;background:#f4f6f8;border-radius:14px;overflow:hidden}
    .storage-viewer canvas{touch-action:none}.viewer-badge,.viewer-hint{position:absolute;left:10px;font-size:12px;background:white;padding:5px 8px;border-radius:6px;pointer-events:none}
    .viewer-badge{top:8px}.viewer-hint{bottom:6px}.viewer-controls{position:absolute;right:6px;top:42px;display:flex;flex-direction:column;gap:4px}
    button{width:40px;height:40px;border:1px solid #d0d5dd;background:white;border-radius:8px;color:#123e85;display:grid;place-items:center}
    .viewer-scene-loading{position:absolute;top:90px;left:20px;background:white;padding:10px;font-size:14px}
    .viewer-fallback{height:220px;position:relative}.viewer-fallback img{width:100%;height:160px;object-fit:contain}.viewer-fallback div{font-size:13px;display:grid;gap:4px}
  `}</style><Viewer key={size.id + size.dimensions} size={size}/></>;
}
