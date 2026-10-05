// Programma settimanale: l'UNICA azione attiva dell'atleta.
// Carica il PDF/foto del club → l'AI lo legge → spunta cosa tenere → Salva: entra nel calendario,
// definitivo per la settimana, e il team riceve una notifica. Cambi in corsa dal calendario
// (il team viene avvisato: "Brignoli ha modificato l'allenamento: dalle 13:00 alle 16:00").
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Modal } from './ui'
import Icon from './Icon'

type Item = { key: string; on: boolean; date: string; start: string; end: string; type: string; title: string; location: string; notes: string }
type Plan = { id: string; week_start: string; status: string; file_path: string | null; file_name: string | null }

const TYPES: Record<string, string> = {
  allenamento: 'Allenamento', partita: 'Partita', viaggio: 'Viaggio', medico: 'Medico', visita: 'Visita',
  nutrizione: 'Pasto / nutrizione', call: 'Riunione / call', personale: 'Personale',
}
const WD = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export function mondayOf(d: Date) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
// da venerdì in poi il programma che serve è quello della settimana dopo
export function defaultWeek(now = new Date()) { const m = mondayOf(now); if (now.getDay() === 5 || now.getDay() === 6 || now.getDay() === 0) m.setDate(m.getDate() + 7); return iso(m) }
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d) }
const label = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
let seq = 0
const mk = (p: Partial<Item>): Item => ({ key: 'i' + (++seq), on: true, date: '', start: '', end: '', type: 'allenamento', title: '', location: '', notes: '', ...p })

// data/ora locali dello stadio dell'atleta (gli orari del club sono nel suo fuso)
function partsInTz(isoStr: string, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const p = Object.fromEntries(f.formatToParts(new Date(isoStr)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` }
}

export default function WeekPlanModal({ playerId, tz, onClose, onSaved }: {
  playerId: number; tz: string; onClose: () => void; onSaved: () => void
}) {
  const [week, setWeek] = useState(defaultWeek())
  const [step, setStep] = useState<'start' | 'reading' | 'review'>('start')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [existing, setExisting] = useState<Plan | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week])

  // programma già salvato per quella settimana: si riapre per modificarlo
  useEffect(() => {
    supabase.from('crm_week_plans').select('id, week_start, status, file_path, file_name')
      .eq('player_id', playerId).eq('week_start', week).eq('status', 'confermato')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setExisting((data as Plan) || null))
  }, [playerId, week])

  async function openExisting(p: Plan) {
    const { data } = await supabase.from('crm_events').select('title, type, start_at, end_at, location, notes')
      .eq('week_plan_id', p.id).order('start_at')
    setPlan(p)
    setItems(((data as any[]) || []).map(e => {
      const s = partsInTz(e.start_at, tz)
      return mk({ date: s.date, start: s.time, end: e.end_at ? partsInTz(e.end_at, tz).time : '', type: e.type, title: e.title, location: e.location || '', notes: e.notes || '' })
    }))
    setNote('Programma già salvato: modifica e salva di nuovo, il team riceve l\'aggiornamento.')
    setStep('review')
  }

  async function createPlan(file?: File): Promise<Plan | null> {
    let file_path: string | null = null
    if (file) {
      if (file.size > 20 * 1048576) { toast('File troppo grande (max 20 MB): fai una foto del programma', 'err'); return null }
      file_path = `${playerId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
      const up = await supabase.storage.from('week-plans').upload(file_path, file, { upsert: false, contentType: file.type || undefined })
      if (up.error) { toast(up.error.message, 'err'); return null }
    }
    const { data, error } = await supabase.from('crm_week_plans')
      .insert({ player_id: playerId, week_start: week, file_path, file_name: file?.name || null })
      .select('id, week_start, status, file_path, file_name').single()
    if (error) { toast(error.message, 'err'); return null }
    return data as Plan
  }

  async function upload(file: File) {
    setBusy(true)
    const p = await createPlan(file)
    if (!p) { setBusy(false); return }
    setPlan(p); setStep('reading')
    const { data, error } = await supabase.functions.invoke('parse-week-plan', { body: { plan_id: p.id } })
    setBusy(false)
    let code = ''
    if (error) {
      try { code = (await (error as any).context?.json())?.error || '' } catch { /* risposta non json */ }
    }
    if (error || !data) {
      setItems([])
      setNote(code === 'ai_not_configured'
        ? 'Lettura automatica non ancora attiva: aggiungi gli impegni qui sotto, bastano pochi tocchi.'
        : 'Non sono riuscito a leggere il programma: aggiungi gli impegni qui sotto o riprova con una foto più nitida.')
      setStep('review'); return
    }
    const list = ((data as any).items || []) as any[]
    setItems(list.map(it => mk({
      date: it.date, start: (it.start || '').slice(0, 5), end: (it.end || '').slice(0, 5),
      type: TYPES[it.type] ? it.type : 'allenamento', title: it.title || '', location: it.location || '', notes: it.notes || '',
    })))
    setNote((data as any).warnings || (list.length ? '' : 'Nel documento non ho trovato impegni con un orario: aggiungili qui sotto.'))
    setStep('review')
  }

  async function manual() {
    setBusy(true)
    const p = await createPlan()
    setBusy(false)
    if (!p) return
    setPlan(p); setItems([]); setNote(''); setStep('review')
  }

  async function openFile() {
    if (!plan?.file_path) return
    const { data } = await supabase.storage.from('week-plans').createSignedUrl(plan.file_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function save() {
    if (!plan) return
    const keep = items.filter(i => i.on && i.date && /^\d{1,2}:\d{2}$/.test(i.start))
    setBusy(true)
    const { data, error } = await supabase.rpc('crm_save_week_plan', {
      p_plan: plan.id,
      p_items: keep.map(i => ({ date: i.date, start: i.start, end: i.end, type: i.type, title: i.title || TYPES[i.type], location: i.location, notes: i.notes })),
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(`Programma salvato: ${data} impegni nel calendario, il tuo team è avvisato`)
    onSaved()
  }

  const set = (key: string, patch: Partial<Item>) => setItems(xs => xs.map(x => x.key === key ? { ...x, ...patch } : x))
  const onCount = items.filter(i => i.on).length

  return (
    <Modal title="Programma della settimana" onClose={onClose}
      footer={step === 'review' ? (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : `Salva programma · ${onCount}`}</button>
        </>
      ) : undefined}>
      {step === 'start' && (
        <div className="grid" style={{ gap: 14 }}>
          <div>
            <div className="kv-title">Settimana</div>
            <div className="flex gap wrap" style={{ gap: 6 }}>
              {[-7, 0, 7].map(off => {
                const w = addDays(defaultWeek(), off)
                return (
                  <button key={w} className={`btn btn-sm ${w === week ? 'btn-primary' : ''}`} onClick={() => setWeek(w)}>
                    {label(w)} – {label(addDays(w, 6))}
                  </button>
                )
              })}
            </div>
          </div>
          {existing ? (
            <div className="wp-existing">
              <Icon name="check" size={16} />
              <div style={{ flex: 1 }}>Hai già salvato il programma di questa settimana.</div>
              <button className="btn btn-sm" onClick={() => openExisting(existing)}>Modifica</button>
            </div>
          ) : null}
          <label className="wp-drop">
            <input type="file" accept="application/pdf,image/*" hidden disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
            <Icon name="upload" size={26} />
            <b>{busy ? 'Carico…' : 'Carica il PDF o fai una foto'}</b>
            <span>Il programma che ti manda il club: lo leggo io e ti mostro gli impegni da confermare.</span>
          </label>
          <button className="btn btn-ghost btn-sm" style={{ justifySelf: 'center' }} disabled={busy} onClick={manual}>Inseriscilo a mano</button>
        </div>
      )}

      {step === 'reading' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
          <div style={{ fontWeight: 700, marginTop: 12 }}>Leggo il programma…</div>
          <div className="faint" style={{ fontSize: 12.5 }}>Giorni, orari e luoghi: pochi secondi.</div>
        </div>
      )}

      {step === 'review' && (
        <div className="grid" style={{ gap: 12 }}>
          <div className="faint" style={{ fontSize: 12.5 }}>
            Settimana {label(week)} – {label(addDays(week, 6))} · togli la spunta a ciò che non ti riguarda, correggi un orario se serve.
            {plan?.file_path && <> · <button className="link-btn" onClick={openFile}>vedi il file</button></>}
          </div>
          {note && <div className="wp-note">{note}</div>}
          {days.map((d, i) => {
            const rows = items.filter(x => x.date === d).sort((a, b) => a.start.localeCompare(b.start))
            return (
              <div key={d} className="wp-day">
                <div className="wp-day-h">
                  <span>{WD[i]} <span className="faint">{label(d)}</span></span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setItems(xs => [...xs, mk({ date: d, start: '10:00', title: 'Allenamento' })])}>+ Aggiungi</button>
                </div>
                {rows.length === 0 ? <div className="faint" style={{ fontSize: 12 }}>Riposo</div> : rows.map(r => (
                  <div key={r.key} className={`wp-row ${r.on ? '' : 'off'}`}>
                    <input type="checkbox" checked={r.on} onChange={e => set(r.key, { on: e.target.checked })} aria-label="Tieni" />
                    <div className="wp-fields">
                      <div className="wp-line">
                        <input className="input wp-time" type="time" value={r.start} aria-label="Inizio" onChange={e => set(r.key, { start: e.target.value })} />
                        <span className="faint">–</span>
                        <input className="input wp-time" type="time" value={r.end} aria-label="Fine" onChange={e => set(r.key, { end: e.target.value })} />
                      </div>
                      <div className="wp-line2">
                        <select className="input" value={r.type} aria-label="Tipo" onChange={e => set(r.key, { type: e.target.value })}>
                          {Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        <input className="input" value={r.title} placeholder="Titolo" onChange={e => set(r.key, { title: e.target.value })} />
                      </div>
                      {(r.location || r.notes) && <div className="faint" style={{ fontSize: 11.5 }}>{[r.location, r.notes].filter(Boolean).join(' · ')}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
