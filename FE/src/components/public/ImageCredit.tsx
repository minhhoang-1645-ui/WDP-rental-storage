export function ImageCredit({ label, href }: { label: string; href: string }) {
  return <a className="image-credit" href={href} target="_blank" rel="noreferrer">{label}</a>
}
