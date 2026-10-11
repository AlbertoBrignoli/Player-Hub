// Menu a tendina del nutrizionista: alimenti o integratori del momento giusto in cima,
// gli altri sotto; scrivendo filtra, e se la voce non c'è la aggiunge (resta in memoria).
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { useLang } from '../lib/i18n'
import { slotLabel, splitQty, type LibItem } from '../lib/nutriLibrary'

export function NutriPick({ items, slot, exclude, placeholder, onPick }: {
  items: LibItem[]
  slot: string
  exclude: string[]                 // nomi già scelti (minuscolo)
  placeholder: string
  onPick: (v: { name: string; qty: string }) => void
}) {
  const { t } = useLang()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const s = q.trim().toLowerCase()
  const avail = useMemo(() => {
    const seen = new Set<string>()
    return items.filter(i => {
      const k = i.name.toLowerCase()
      if (exclude.includes(k)) return false
      if (s && !k.includes(s) && !t(i.name).toLowerCase().includes(s)) return false
      return true
    }).sort((a, b) => Number(b.category === slot) - Number(a.category === slot))
      // stesso alimento in più momenti: in tendina una volta sola (vince quello del momento scelto)
      .filter(i => { const k = i.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  }, [items, exclude, s, slot])
  const mine = avail.filter(i => i.category === slot)
  const others = avail.filter(i => i.category !== slot)
  const flat = [...mine, ...others]
  const typed = splitQty(q)
  const isNew = !!typed.name && !items.some(i => i.name.toLowerCase() === typed.name.toLowerCase())

  function pick(i?: LibItem) {
    if (i) onPick({ name: i.name, qty: (i.kind === 'integratore' ? i.dose : i.details) || '' })
    else if (typed.name) onPick(typed)
    setQ(''); setHi(0); setOpen(false)
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (isNew || !flat[hi]) pick(); else pick(flat[hi]) }
    else if (e.key === 'Escape') setOpen(false)
  }
  const row = (i: LibItem, idx: number) => (
    <button key={i.id} type="button" className={'np-opt' + (idx === hi ? ' hi' : '')} onMouseEnter={() => setHi(idx)} onClick={() => pick(i)}>
      <span>{t(i.name)}</span><em>{t((i.kind === 'integratore' ? i.dose : i.details) || '')}</em>
    </button>
  )

  return (
    <div className="np" ref={box}>
      <div className="np-in" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        <input value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onKeyDown={onKey}
          onChange={e => { setQ(e.target.value); setOpen(true); setHi(0) }} />
        <span className="np-caret">▾</span>
      </div>
      {open && (
        <div className="np-list">
          {isNew && (
            <button type="button" className="np-opt np-new" onClick={() => pick()}>
              <span>+ {t('Aggiungi')} “{typed.name}”{typed.qty ? ` · ${typed.qty}` : ''}</span><em>{t('resta nel tuo menu')}</em>
            </button>
          )}
          {mine.length > 0 && <div className="np-h">{t(slotLabel(slot))}</div>}
          {mine.map((i, k) => row(i, k))}
          {others.length > 0 && <div className="np-h">{t('Altri momenti')}</div>}
          {others.map((i, k) => row(i, mine.length + k))}
          {flat.length === 0 && !isNew && <div className="np-empty">{t('Scrivi per aggiungere una voce nuova')}</div>}
        </div>
      )}
    </div>
  )
}

export const NP_CSS = `
.np { position: relative; }
.np-in { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); color: #4D7C0F; cursor: text; }
.np-in:focus-within { border-color: #4D7C0F; box-shadow: 0 0 0 3px rgba(77,124,15,.12); }
.np-in input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; color: var(--text); }
.np-caret { color: var(--text-dim); font-size: 12px; }
.np-list { position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 4px); max-height: 260px; overflow-y: auto; background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.14); padding: 4px; }
.np-h { font-size: 10.5px; letter-spacing: .8px; text-transform: uppercase; font-weight: 800; color: var(--text-dim); padding: 8px 10px 4px; }
.np-opt { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 10px; border: 0; background: none; border-radius: 8px; text-align: left; font: inherit; font-size: 13.5px; color: var(--text); cursor: pointer; }
.np-opt em { font-style: normal; font-size: 12px; color: var(--text-dim); white-space: nowrap; }
.np-opt.hi { background: rgba(77,124,15,.1); }
.np-new span { color: #4D7C0F; font-weight: 700; }
.np-empty { padding: 10px; font-size: 12.5px; color: var(--text-dim); }
.np-sel { display: grid; gap: 6px; }
.np-row { display: grid; grid-template-columns: minmax(0,1fr) 110px auto; gap: 6px; align-items: center; padding: 6px 6px 6px 12px; border-radius: 10px; background: rgba(77,124,15,.06); border: 1px solid rgba(77,124,15,.2); }
.np-row.sup { grid-template-columns: minmax(0,1fr) 96px 120px auto; }
.np-row b { font-size: 13.5px; overflow-wrap: anywhere; }
.np-row input, .np-row select { height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); padding: 0 8px; font: inherit; font-size: 12.5px; color: var(--text); min-width: 0; width: 100%; }
@media (max-width: 560px) { .np-row.sup { grid-template-columns: minmax(0,1fr) 84px auto; } .np-row.sup select { grid-column: 1 / 3; } }
`
