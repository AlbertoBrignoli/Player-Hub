import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Input } from './ui'
import Icon from './Icon'

// Campo "Luogo" con autocomplete indirizzi reali (Geoapify, via Edge Function
// che nasconde la chiave). Se il servizio non è configurato o non risponde,
// il campo funziona comunque come input di testo normale.
type Sugg = { label: string; lat?: number; lon?: number }

export default function LuogoAutocomplete({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [items, setItems] = useState<Sugg[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const skip = useRef(false)          // evita di ricercare subito dopo una selezione
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (skip.current) { skip.current = false; return }
    const text = value.trim()
    if (text.length < 3) { setItems([]); setOpen(false); return }
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('geoapify-autocomplete', { body: { text } })
        if (!alive) return
        if (error) { setItems([]); setOpen(false) }
        else {
          const res: Sugg[] = (data?.results as Sugg[]) || []
          setItems(res); setOpen(res.length > 0)
        }
      } catch {
        if (alive) { setItems([]); setOpen(false) }
      } finally {
        if (alive) setLoading(false)
      }
    }, 320)
    return () => { alive = false; clearTimeout(t) }
  }, [value])

  // chiudi cliccando fuori
  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(s: Sugg) {
    skip.current = true
    onChange(s.label)
    setItems([]); setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <Input value={value} placeholder={placeholder || 'Inizia a scrivere un indirizzo…'}
        autoComplete="off"
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true) }} />
      {loading && (
        <span style={{ position: 'absolute', right: 12, top: 11, fontSize: 11, color: 'var(--text-dim)' }}>…</span>
      )}
      {open && items.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
          background: 'var(--card, #141419)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 34px rgba(0,0,0,.45)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {items.map((s, i) => (
            <button key={i} type="button" onClick={() => pick(s)}
              className="flex gap"
              style={{ width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', cursor: 'pointer',
                border: 'none', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'transparent', color: 'var(--text)', padding: '10px 12px', fontSize: 13.5 }}
              onMouseDown={e => e.preventDefault()}>
              <span style={{ color: 'var(--text-dim)', display: 'inline-flex', flexShrink: 0 }}><Icon name="pin" size={14} /></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
