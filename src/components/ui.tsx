import React, { useEffect } from 'react'

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" style={wide ? { maxWidth: 680 } : undefined} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props} />
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: 'green' | 'red' | 'gold' | 'blue' | 'accent' }) {
  return <span className={`badge${tone ? ' badge-' + tone : ''}`}>{children}</span>
}

export function Empty({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function Spinner() {
  return <div className="center"><div className="spinner" /></div>
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: string; tone?: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">{icon && <span className="stat-ico">{icon}</span>}{label}</div>
      <div className="stat-value" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function ConfirmButton({ onConfirm, children, className = 'btn btn-danger btn-sm' }: {
  onConfirm: () => void; children: React.ReactNode; className?: string
}) {
  const [armed, setArmed] = React.useState(false)
  useEffect(() => { if (armed) { const t = setTimeout(() => setArmed(false), 2600); return () => clearTimeout(t) } }, [armed])
  return (
    <button className={className} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Confermi?' : children}
    </button>
  )
}
