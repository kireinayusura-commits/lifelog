import type { ReactNode } from 'react'
import { useEffect } from 'react'

export function Screen({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-full">
      <header className="safe-top sticky top-0 z-10 border-b border-rulesoft bg-paper/90 px-4 pb-3 backdrop-blur">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-[19px] font-bold tracking-tight">{title}</h1>
          {action}
        </div>
      </header>
      <div className="px-4 pt-4 pb-6">{children}</div>
    </div>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-rule bg-surface ${className}`}>{children}</div>
  )
}

type BtnVariant = 'primary' | 'ghost' | 'outline' | 'danger'

export function Button({
  children,
  onClick,
  variant = 'outline',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: BtnVariant
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-opacity disabled:opacity-40'
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-time text-paper',
    ghost: 'text-muted',
    outline: 'border border-rule bg-surface text-ink',
    danger: 'border border-rule bg-surface text-danger',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule px-5 py-8 text-center text-[13.5px] leading-relaxed text-muted">
      {children}
    </div>
  )
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="safe-bottom relative w-full max-w-md rounded-t-3xl border border-rule bg-surface p-5 sm:rounded-3xl">
        <h2 className="text-[17px] font-bold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-rule bg-surface2 px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-time'
