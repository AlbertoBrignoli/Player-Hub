import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast, undoable } from '../lib/toast'
import { useLang } from '../lib/i18n'
import { Modal, Field, Input, Select, Tabs, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { useNutriLibrary, SLOTS, FOOD_SLOTS, slotLabel, splitQty, splitList, type LibItem } from '../lib/nutriLibrary'

// "Alimentazione" del nutrizionista: la sua area di lavoro.
// Alimenti e integratori divisi per momento della giornata; si compila una volta
// (a mano, incollando un elenco o caricando il suo file letto dall'AI) e poi sul calendario
// dell'atleta si sceglie dal menu a tendina.
const ACCENT = '#4D7C0F'
type Kind = 'cibo' | 'integratore'

export default function NutriMenu() {
  const { t } = useLang()
  const { items, loading, reload, setItems } = useNutriLibrary()
  const [kind, setKind] = useState<Kind>('cibo')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<LibItem | null>(null)
  const [upload, setUpload] = useState(false)
  const slots = kind === 'cibo' ? FOOD_SLOTS : SLOTS
  const count = (k: Kind) => items.filter(i => i.kind === k).length

  const bySlot = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out: Record<string, LibItem[]> = {}
    items.filter(i => i.kind === kind && (!s || i.name.toLowerCase().includes(s) || t(i.name).toLowerCase().includes(s)))
      .forEach(i => { (out[i.category || 'pranzo'] ||= []).push(i) })
    Object.values(out).forEach(l => l.sort((a, b) => t(a.name).localeCompare(t(b.name))))
    return out
  }, [items, kind, q, t])

  async function addMany(slot: string, raw: string) {
    const list = splitList(raw).map(splitQty).filter(x => x.name)
    if (!list.length) return
    const { data, error } = await supabase.rpc('crm_nutri_library_import', {
      p_items: list.map(x => ({ kind, slot, name: x.name, qty: x.qty })),
    })
    if (error) { toast(error.message, 'err'); return }
    const n = Number(data) || 0
    const where = t(slotLabel(slot))
    toast(n === 0 ? t('Già nel menu') : n === 1 ? t('Aggiunto a {slot}').replace('{slot}', where) : t('{n} voci aggiunte a {slot}').replace('{n}', String(n)).replace('{slot}', where))
    reload()
  }

  function del(i: LibItem) {
    setItems(xs => xs.filter(x => x.id !== i.id))
    undoable(t('{name} tolto da {slot}').replace('{name}', t(i.name)).replace('{slot}', t(slotLabel(i.category))),
      async () => supabase.from('crm_nutri_library').delete().eq('id', i.id), reload)
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 14 }}>
      <style>{NM_CSS}</style>
      <div className="nm-hero">
        <div className="nm-hero-bar" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nm-kicker">{t('Alimentazione · Il mio menu')}</div>
          <div className="nm-title">{t('Alimenti e integratori per ogni momento')}</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
            {t('Compilalo una volta: sul calendario dei tuoi atleti li scegli dal menu a tendina. Quello che aggiungi lì resta anche qui.')}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setUpload(true)}><Icon name="upload" size={14} /> {t('Carica il tuo menu')}</button>
      </div>

      <div className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Tabs tabs={[{ key: 'cibo', label: `${t('Alimenti')} · ${count('cibo')}` }, { key: 'integratore', label: `${t('Integratori')} · ${count('integratore')}` }]}
          value={kind} onChange={(k: Kind) => setKind(k)} />
        <div className="nm-search">
          <Icon name="grid" size={14} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'cibo' ? t('Cerca un alimento…') : t('Cerca un integratore…')} />
        </div>
      </div>

      <div className="nm-slots">
        {slots.map(sl => (
          <SlotCard key={sl.key} label={t(sl.label)} kind={kind} rows={bySlot[sl.key] || []}
            onAdd={raw => addMany(sl.key, raw)} onEdit={setEdit} onDel={del} hidden={!!q && !(bySlot[sl.key] || []).length} />
        ))}
      </div>

      {edit && <ItemForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {upload && <UploadMenu onClose={() => setUpload(false)} onDone={() => { setUpload(false); reload() }} />}
    </div>
  )
}

function SlotCard({ label, kind, rows, onAdd, onEdit, onDel, hidden }: {
  label: string; kind: Kind; rows: LibItem[]; hidden: boolean
  onAdd: (raw: string) => void; onEdit: (i: LibItem) => void; onDel: (i: LibItem) => void
}) {
  const { t } = useLang()
  const [v, setV] = useState('')
  if (hidden) return null
  const add = () => { if (v.trim()) { onAdd(v); setV('') } }
  return (
    <div className="nm-slot">
      <div className="nm-slot-h"><b>{label}</b><span>{rows.length}</span></div>
      <div className="nm-items">
        {rows.length === 0 && <div className="faint" style={{ fontSize: 12 }}>{t('Ancora vuoto')}</div>}
        {rows.map(i => {
          const q = kind === 'cibo' ? i.details : i.dose
          return (
            <span key={i.id} className="nm-it">
              <button className="nm-it-b" onClick={() => onEdit(i)} title={t('Modifica')}>
                {t(i.name)}{q ? <em> · {t(q)}</em> : null}
              </button>
              <button className="nm-it-x" onClick={() => onDel(i)} aria-label={`${t('Togli')} ${t(i.name)}`}><Icon name="x" size={12} /></button>
            </span>
          )
        })}
      </div>
      <div className="nm-add">
        <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onPaste={e => { const txt = e.clipboardData.getData('text'); if (/[\n;]/.test(txt)) { e.preventDefault(); onAdd(txt) } }}
          placeholder={kind === 'cibo' ? t('Es. Avena 80 g, Uova 2, Miele') : t('Es. Creatina 5 g, Omega 3 2 g')} />
        <button className="btn btn-sm" disabled={!v.trim()} onClick={add}>{t('Aggiungi')}</button>
      </div>
    </div>
  )
}

function ItemForm({ value, onClose, onSaved }: { value: LibItem; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang()
  const food = value.kind === 'cibo'
  const [name, setName] = useState(value.name)
  const [qty, setQty] = useState((food ? value.details : value.dose) || '')
  const [slot, setSlot] = useState(value.category || 'pranzo')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('crm_nutri_library').update({
      name: name.trim(), category: slot, ...(food ? { details: qty.trim() || null } : { dose: qty.trim() || null }),
    }).eq('id', value.id)
    setBusy(false)
    if (error) { toast(error.code === '23505' ? t('C’è già una voce con questo nome in quel momento') : error.message, 'err'); return }
    toast(t('Aggiornato'))
    onSaved()
  }
  return (
    <Modal title={food ? t('Modifica alimento') : t('Modifica integratore')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}>{busy ? t('Salvo…') : t('Salva')}</button>
      </>}>
      <div className="grid" style={{ gap: 10 }}>
        <Field label={t('Nome')}><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
        <div className="grid g2" style={{ gap: 10 }}>
          <Field label={food ? t('Quantità') : t('Dose')}><Input value={qty} onChange={e => setQty(e.target.value)} placeholder={food ? t('Es. 80 g') : t('Es. 5 g')} /></Field>
          <Field label={t('Momento')}>
            <Select value={slot} onChange={e => setSlot(e.target.value)}>
              {(food ? FOOD_SLOTS : SLOTS).map(s => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  )
}

type Parsed = { kind: Kind; slot: string; name: string; qty: string; on: boolean }

// Carica il menu una volta: PDF, foto o testo incollato → l'AI lo divide per momento → anteprima → importa
function UploadMenu({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useLang()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Parsed[] | null>(null)
  const [warn, setWarn] = useState('')

  async function read(file?: File) {
    setBusy(true); setWarn('')
    let body: any = { text: text.trim() || undefined }
    if (file) {
      if (file.size > 10 * 1048576) { toast(t('File troppo grande (max 10 MB)'), 'err'); setBusy(false); return }
      if (/text|csv/.test(file.type) || /\.(txt|csv)$/i.test(file.name)) body = { text: await file.text() }
      else {
        const buf = new Uint8Array(await file.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        body = { file: { data: btoa(bin), mime: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg') } }
      }
    }
    const { data, error } = await supabase.functions.invoke('parse-nutri-menu', { body })
    setBusy(false)
    if (error || !data) {
      let code = ''
      try { code = (await (error as any)?.context?.json())?.error || '' } catch { /* risposta non json */ }
      toast(code === 'ai_not_configured' ? t('Lettura automatica non attiva') : t('Non sono riuscito a leggerlo: riprova o incolla il testo'), 'err')
      return
    }
    setRows(((data as any).items || []).map((i: any) => ({ ...i, on: true })))
    setWarn((data as any).warnings || '')
  }

  async function doImport() {
    if (!rows) return
    setBusy(true)
    const { data, error } = await supabase.rpc('crm_nutri_library_import', { p_items: rows.filter(r => r.on) })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(t('{n} voci aggiunte al tuo menu').replace('{n}', String(Number(data) || 0)))
    onDone()
  }

  const on = rows?.filter(r => r.on).length || 0
  return (
    <Modal title={t('Carica il tuo menu')} onClose={onClose}
      footer={rows ? <>
        <button className="btn btn-ghost" onClick={() => setRows(null)}>{t('Indietro')}</button>
        <button className="btn btn-primary" disabled={busy || !on} onClick={doImport}>{busy ? t('Importo…') : t('Aggiungi {n} voci').replace('{n}', String(on))}</button>
      </> : undefined}>
      {busy && !rows ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
          <div style={{ fontWeight: 700, marginTop: 12 }}>{t('Leggo il menu…')}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>{t('Lo divido per colazione, pranzo, merenda, cena e integratori.')}</div>
        </div>
      ) : !rows ? (
        <div className="grid" style={{ gap: 12 }}>
          <label className="wp-drop">
            <input type="file" accept="application/pdf,image/*,.txt,.csv,text/plain,text/csv" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = '' }} />
            <Icon name="upload" size={26} />
            <b>{t('Carica PDF, foto o file di testo')}</b>
            <span>{t('Il tuo schema alimentare o la lista di alimenti e integratori: lo leggo e lo divido per momento della giornata.')}</span>
          </label>
          <div className="faint" style={{ fontSize: 12, textAlign: 'center' }}>{t('oppure incolla il testo')}</div>
          <textarea className="input" rows={6} value={text} onChange={e => setText(e.target.value)}
            placeholder={t('Colazione: avena 80 g, yogurt greco, frutti rossi\nPranzo: pasta 100 g, pollo 150 g, verdure\nIntegratori: creatina 5 g dopo allenamento…')} />
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => read()}>{t('Leggi il testo')}</button>
        </div>
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          <div className="faint" style={{ fontSize: 12.5 }}>{t('Togli la spunta a ciò che non vuoi, poi aggiungi. Le voci già presenti non vengono duplicate.')}</div>
          {warn && <div className="wp-note">{warn}</div>}
          {(['cibo', 'integratore'] as Kind[]).map(k => {
            const ks = rows.filter(r => r.kind === k)
            if (!ks.length) return null
            return (
              <div key={k}>
                <div className="nm-group">{k === 'cibo' ? t('Alimenti') : t('Integratori')}</div>
                {SLOTS.map(sl => {
                  const rs = ks.filter(r => r.slot === sl.key)
                  if (!rs.length) return null
                  return (
                    <div key={sl.key} className="nm-prev">
                      <b>{t(sl.label)}</b>
                      <div className="nm-items">
                        {rs.map(r => {
                          const idx = rows.indexOf(r)
                          return (
                            <button key={idx} className={'nm-pv' + (r.on ? ' on' : '')}
                              onClick={() => setRows(xs => xs!.map((x, j) => j === idx ? { ...x, on: !x.on } : x))}>
                              {r.on ? '✓' : '✕'} {r.name}{r.qty ? <em> · {r.qty}</em> : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

const NM_CSS = `
.nm-hero { position: relative; overflow: hidden; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; border-radius: 18px; background: var(--bg-2); border: 1px solid var(--border); padding: 20px 22px; }
.nm-hero-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: ${ACCENT}; }
.nm-kicker { font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 800; color: ${ACCENT}; }
.nm-title { font-size: 22px; font-weight: 900; letter-spacing: -.3px; margin-top: 2px; }
.nm-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 38px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text-dim); flex: 1; max-width: 320px; min-width: 180px; }
.nm-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; color: var(--text); }
.nm-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
@media (max-width: 700px) { .nm-slots { grid-template-columns: 1fr; } }
.nm-slot { background: var(--card); border: 1px solid var(--border); border-top: 3px solid ${ACCENT}; border-radius: 16px; padding: 14px; display: grid; gap: 10px; align-content: start; }
.nm-slot-h { display: flex; align-items: baseline; gap: 8px; }
.nm-slot-h b { font-size: 15px; }
.nm-slot-h span { font-size: 12px; color: var(--text-dim); font-weight: 700; }
.nm-items { display: flex; flex-wrap: wrap; gap: 6px; }
.nm-it { display: inline-flex; align-items: center; border-radius: 999px; background: rgba(77,124,15,.07); border: 1px solid rgba(77,124,15,.25); max-width: 100%; }
.nm-it-b { border: 0; background: none; padding: 5px 4px 5px 11px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-it-b em, .nm-pv em { font-style: normal; font-weight: 500; color: var(--text-dim); }
.nm-it-x { border: 0; background: none; width: 24px; height: 24px; margin-right: 3px; border-radius: 999px; display: grid; place-items: center; color: var(--text-dim); cursor: pointer; }
.nm-it-x:hover { background: rgba(229,63,0,.1); color: var(--red); }
.nm-add { display: flex; gap: 6px; }
.nm-add input { flex: 1; min-width: 0; height: 36px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-2); padding: 0 10px; font: inherit; font-size: 13px; color: var(--text); }
.nm-group { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 800; color: var(--text-dim); margin: 6px 2px 8px; }
.nm-prev { display: grid; gap: 6px; padding: 8px 0; border-top: 1px solid var(--border); }
.nm-prev b { font-size: 13px; }
.nm-pv { border: 1px solid var(--border); background: var(--bg-2); border-radius: 999px; padding: 5px 10px; font: inherit; font-size: 12.5px; color: var(--text-dim); cursor: pointer; text-decoration: line-through; }
.nm-pv.on { text-decoration: none; color: var(--text); background: rgba(77,124,15,.07); border-color: rgba(77,124,15,.3); }
`
