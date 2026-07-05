import { useEffect, useState } from 'react'

interface T { id: number; msg: string; kind: 'ok' | 'err'; leaving?: boolean }

// Montato una volta nella Shell: ascolta gli eventi 'app-toast' e mostra
// conferme non bloccanti sopra la tab bar.
export default function Toaster() {
  const [items, setItems] = useState<T[]>([])

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent).detail as T
      setItems(prev => [...prev.slice(-2), t])
      setTimeout(() => setItems(prev => prev.map(x => x.id === t.id ? { ...x, leaving: true } : x)), 2300)
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), 2650)
    }
    window.addEventListener('app-toast', on)
    return () => window.removeEventListener('app-toast', on)
  }, [])

  if (!items.length) return null
  return (
    <div className="toaster">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.kind === 'err' ? 'toast-err' : ''} ${t.leaving ? 'toast-out' : ''}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
