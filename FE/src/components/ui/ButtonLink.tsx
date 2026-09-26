import type { PropsWithChildren } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type Props = PropsWithChildren<LinkProps & { variant?: 'primary' | 'secondary' | 'light' }>
export function ButtonLink({ variant = 'primary', className = '', children, ...props }: Props) {
  const styles = variant === 'primary' ? 'button-primary' : variant === 'light' ? 'button-light' : 'button-secondary'
  return <Link className={`${styles} ${className}`} {...props}>{children}</Link>
}
