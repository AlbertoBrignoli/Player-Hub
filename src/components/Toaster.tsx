import { useEffect, useState } from 'react'
import type { ToastAction } from '../lib/toast'

interface T { id: number; msg: string; kind: 'ok' | 'err'; action?: ToastAction; leaving?: boolean }

// Montato una volta nella Shell: ascolta gli eventi 'app-toast' e mostra
// conferme non bloccanti sopra la tab bar. I toast con azione (Annulla)
// restano visibili più a lungo, quanto la finestra di annullamento.
export default function Toaster() {
  const [items, setItems] = useState<T[]>([])

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent).detail as T
      const life = t.action ? 5000 : 2300
      setItems(prev => [...prev.slice(-2), t])
      setTimeout(() => setItems(prev => prev.map(x => x.id === t.id ? { ...x, leaving: true } : x)), life)
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), life + 350)
    }
    window.addEventListener('app-toast', on)
    return () => window.removeEventListener('app-toast', on)
  }, [])

  if (!items.length) return null
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.kind === 'err' ? 'toast-err' : ''} ${t.leaving ? 'toast-out' : ''}`}>
          <span>{t.msg}</span>
          {t.action && (
            <button className="toast-action" onClick={() => {
              t.action!.onClick()
              setItems(prev => prev.filter(x => x.id !== t.id))
            }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  )
}
