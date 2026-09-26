import type { HTMLAttributes, PropsWithChildren } from 'react'

export function Container({ className = '', children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 ${className}`} {...props}>{children}</div>
}
