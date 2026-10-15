import { useState, type ImgHTMLAttributes } from 'react'

// Catalog photos are external. Keep their failure from leaving broken images in the UI.
export function StorageImage({ src, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<string>()
  const fallback = !src || failedSource === src
  return <img {...props} src={fallback ? '/storage-space.svg' : src} alt={alt} data-fallback={fallback ? 'true' : undefined} onError={() => { if (!fallback) setFailedSource(src) }} />
}
