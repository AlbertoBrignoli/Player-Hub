import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { useAthlete } from '../../lib/athlete'
import { goto as routeGoto, useRouteParam } from '../../lib/route'
import { toast, undoable } from '../../lib/toast'
import { notify } from '../../lib/notify'
import { fmtDate } from '../../lib/format'
import { useIsMobile } from '../../lib/useIsMobile'
import { Modal, Field, Input, Textarea, Select, Spinner, Empty, Badge } from '../../components/ui'
import Icon from '../../components/Icon'
import ExerciseLibrary, { ExMedia, ExlStyle } from './ExerciseLibrary'
import {
  PrescriptionModal, SchedaPreview, downloadPdf, prescParts, libraryDraft, programFields, exerciseRows,
  withKey, Chip, type EditEx,
} from '../Fitness'
import type { FitnessProgram, FitnessExercise, FitnessLibraryItem } from '../../lib/types'

/*
  Area "Crea scheda": il preparatore prepara modelli di scheda (is_template, senza atleta)
  e li assegna a uno o più atleti. Ogni assegnazione crea una COPIA indipendente del modello
  (fitness_programs con player_id + i suoi fitness_exercises): modificare il modello dopo
  non cambia le schede già assegnate.
  Rotta: #/training-builder (elenco modelli) · ?id=new (nuova) · ?id=<uuid> (modello).
*/

type Template = FitnessProgram & { is_template?: boolean; fitness_exercises?: { count: number }[] }
type ProgramRow = Omit<FitnessProgram, 'player_id'> & { player_id: number | null; is_template?: boolean }

const ROUTE = 'training-builder'
const nowIso = () => new Date().toISOString()
const todayKey = () => new Date().toISOString().slice(0, 10)

/** copia un programma (modello o scheda atleta) con i suoi esercizi; ritorna il nuovo id */
async function copyProgram(src: Partial<FitnessProgram>, srcId: string | null, over: Record<string, unknown>, exercises?: FitnessExercise[]): Promise<string> {
  let list = exercises
  if (!list) {
    const { data, error } = await supabase.from('fitness_exercises').select('*').eq('program_id', srcId!).order('order_index')
    if (error) throw error
    list = (data as FitnessExercise[]) || []
  }
  const { data, error } = await supabase.from('fitness_programs')
    .insert({ ...programFields(src), ...over, updated_at: nowIso() }).select('id').single()
  if (error) throw error
  const pid = (data as { id: string }).id
  const rows = exerciseRows(pid, list)
  if (rows.length) {
    const r = await supabase.from('fitness_exercises').insert(rows)
    if (r.error) throw r.error
  }
  return pid
}

/* ---- tempo stimato ---- */
// "90s", "1:30", "2 min", "2'", "90" → secondi. Numeri nudi: <=10 minuti, altrimenti secondi.
function toSecs(v: string | null | undefined): number | null {
  if (!v) return null
  const s = v.toLowerCase().replace(',', '.')
  const mmss = s.match(/(\d+):(\d{1,2})/)
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2])
  const min = s.match(/(\d+(?:\.\d+)?)\s*(min|mn|m\b|')/)
  if (min) return Math.round(Number(min[1]) * 60)
  const sec = s.match(/(\d+(?:\.\d+)?)\s*(s|sec|")/)
  if (sec) return Math.round(Number(sec[1]))
  const n = s.match(/(\d+(?:\.\d+)?)/)
  if (!n) return null
  const x = Number(n[1])
  return x <= 10 ? x * 60 : x
}
function repsCount(r: string | null | undefined): number | null {
  const nums = (r || '').match(/\d+/g)?.map(Number)
  if (!nums?.length) return null
  return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0]
}
function estimateMinutes(form: Partial<FitnessProgram>, list: FitnessExercise[]): number {
  if (!list.length) return 0
  const betweenSets = toSecs(form.recovery_between_sets) ?? 60
  const betweenEx = toSecs(form.recovery_between_exercises) ?? 90
  let total = 0
  list.forEach((e, i) => {
    const sets = e.sets || 1
    const work = toSecs(e.duration) ?? toSecs(e.isometry_time) ?? ((repsCount(e.reps) ?? 10) * 3.5)
    const rest = toSecs(e.recovery) ?? betweenSets
    total += sets * work + Math.max(0, sets - 1) * rest
    if (i < list.length - 1) total += betweenEx
  })
  total += toSecs(form.warmup) ?? 0
  total += toSecs(form.cooldown) ?? 0
  return Math.max(1, Math.round(total / 60))
}

/* ========================= COMPONENTE ========================= */

export default function TrainingBuilder({ goto }: { goto?: (r: string) => void }) {
  const id = useRouteParam('id')
  const nav = goto || routeGoto
  return (
    <div className="tb">
      <style>{TB_CSS}</style>
      <ExlStyle />
      {id ? <Builder key={id} id={id} nav={nav} /> : <Landing nav={nav} />}
    </div>
  )
}

/* ---------- Elenco modelli ---------- */

function Landing({ nav }: { nav: (r: string) => void }) {
  const { session } = useAuth()
  const uid = session?.user.id || null
  const [items, setItems] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromExisting, setFromExisting] = useState(false)
  const [assign, setAssign] = useState<Template | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    if (!uid) { setLoading(false); return }
    setError('')
    const { data, error } = await supabase.from('fitness_programs').select('*, fitness_exercises(count)')
      .eq('is_template', true).eq('trainer_id', uid).is('deleted_at', null)
      .order('updated_at', { ascending: false, nullsFirst: false })
    if (error) setError(error.message)
    setItems((data as Template[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  async function duplicate(t: Template) {
    if (!uid) return
    setBusyId(t.id)
    try {
      const pid = await copyProgram(t, t.id, { name: `${t.name} (copia)`, is_template: true, player_id: null, trainer_id: uid, status: 'draft', program_date: null, start_time: null })
      toast('Modello duplicato', 'ok', { label: 'Apri', onClick: () => nav(`${ROUTE}?id=${pid}`) })
      load()
    } catch (e) { toast((e as Error).message || 'Non riesco a duplicare il modello', 'err') }
    setBusyId(null)
  }

  function remove(t: Template) {
    const snapshot = items
    setItems(prev => prev.filter(x => x.id !== t.id))
    undoable(`Modello eliminato: ${t.name}`,
      async () => { const { error } = await supabase.from('fitness_programs').delete().eq('id', t.id); if (error) throw error },
      () => setItems(snapshot))
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="tb-head">
        <div>
          <h1 className="tb-title">Crea scheda</h1>
          <div className="tb-sub">Prepari la scheda una volta sola, poi la assegni agli atleti che vuoi.</div>
        </div>
        <div className="tb-head-actions">
          <button className="btn" onClick={() => setFromExisting(true)}><Icon name="copy" size={14} /> Da una scheda esistente</button>
          <button className="btn btn-primary" onClick={() => nav(`${ROUTE}?id=new`)}><Icon name="plus" size={14} /> Nuova scheda</button>
        </div>
      </div>

      {error && <div className="tb-error">Non riesco a caricare i modelli: {error}</div>}

      {items.length === 0 && !error ? (
        <div className="card">
          <Empty icon={<Icon name="layers" size={22} />} title="Nessun modello ancora"
            hint="Un modello è una scheda senza atleta: scegli gli esercizi dalla libreria, imposta serie e carichi, poi assegnala a uno o più atleti in un passaggio."
            action={{ label: 'Crea la prima scheda', onClick: () => nav(`${ROUTE}?id=new`) }} />
        </div>
      ) : (
        <>
          <div className="tb-section">I miei modelli <span>{items.length}</span></div>
          <div className="tb-grid">
            {items.map(t => {
              const n = t.fitness_exercises?.[0]?.count ?? 0
              return (
                <div key={t.id} className="card tb-tcard">
                  <button className="tb-tcard-main" onClick={() => nav(`${ROUTE}?id=${t.id}`)}>
                    <div className="tb-tcard-name">{t.name}</div>
                    {(t.focus || t.objective) && <div className="tb-tcard-focus">{t.focus || t.objective}</div>}
                    <div className="tb-tcard-meta">
                      <span><b>{n}</b> {n === 1 ? 'esercizio' : 'esercizi'}</span>
                      {t.duration_min ? <span><b>{t.duration_min}</b> min</span> : null}
                      {t.intensity ? <span>Intensità {t.intensity.toLowerCase()}</span> : null}
                    </div>
                    {t.updated_at && <div className="tb-tcard-date">Aggiornato il {fmtDate(t.updated_at.slice(0, 10))}</div>}
                  </button>
                  <div className="tb-tcard-actions">
                    <button className="btn btn-sm" onClick={() => nav(`${ROUTE}?id=${t.id}`)}><Icon name="edit" size={12} /> Apri</button>
                    <button className="btn btn-sm" disabled={busyId === t.id} onClick={() => duplicate(t)}><Icon name="copy" size={12} /> {busyId === t.id ? 'Duplico…' : 'Duplica'}</button>
                    <button className="btn btn-sm" disabled={n === 0} title={n === 0 ? 'Aggiungi almeno un esercizio' : undefined} onClick={() => setAssign(t)}><Icon name="send" size={12} /> Assegna</button>
                    <button className="btn btn-sm btn-danger tb-del" onClick={() => remove(t)} aria-label={`Elimina ${t.name}`}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {fromExisting && <FromExistingModal onClose={() => setFromExisting(false)}
        onCreated={pid => { setFromExisting(false); nav(`${ROUTE}?id=${pid}`) }} />}
      {assign && <AssignModal template={assign} nav={nav} onClose={() => setAssign(null)} />}
    </div>
  )
}

/* ---------- Da una scheda esistente ---------- */

function FromExistingModal({ onClose, onCreated }: { onClose: () => void; onCreated: (pid: string) => void }) {
  const { session } = useAuth()
  const { athletes } = useAthlete()
  const uid = session?.user.id || null
  const [rows, setRows] = useState<ProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const nameOf = (pid: number | null) => athletes.find(a => a.api_player_id === pid)?.name || 'Atleta'

  useEffect(() => {
    const ids = athletes.map(a => a.api_player_id)
    if (!ids.length) { setLoading(false); return }
    supabase.from('fitness_programs').select('*').eq('is_template', false).in('player_id', ids).is('deleted_at', null)
      .order('program_date', { ascending: false, nullsFirst: false }).limit(200)
      .then(({ data }) => { setRows((data as ProgramRow[]) || []); setLoading(false) })
  }, [athletes])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r => `${r.name} ${r.focus || ''} ${nameOf(r.player_id)}`.toLowerCase().includes(s))
  }, [rows, q]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(r: ProgramRow) {
    if (!uid) return
    setBusy(r.id)
    try {
      const pid = await copyProgram(r as unknown as FitnessProgram, r.id, { is_template: true, player_id: null, trainer_id: uid, status: 'draft', program_date: null, start_time: null, pdf_path: null, recurring: false, recurrence: null })
      toast('Modello creato dalla scheda')
      onCreated(pid)
    } catch (e) { toast((e as Error).message || 'Non riesco a copiare la scheda', 'err'); setBusy(null) }
  }

  return (
    <Modal wide title="Da una scheda esistente" onClose={onClose}>
      <div className="tb-hint">Scegli una scheda di un tuo atleta: diventa un nuovo modello, l'originale resta com'è.</div>
      <Field label="Cerca"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome scheda, focus o atleta" /></Field>
      {loading ? <Spinner /> : list.length === 0 ? (
        <Empty title={rows.length ? 'Nessuna scheda trovata' : 'Nessuna scheda da copiare'}
          hint={rows.length ? 'Prova con un altro nome.' : 'Le schede che crei per i tuoi atleti compariranno qui.'} />
      ) : (
        <div className="tb-pick-list">
          {list.map(r => (
            <button key={r.id} className="tb-pick-row" disabled={!!busy} onClick={() => pick(r)}>
              <div style={{ minWidth: 0 }}>
                <div className="tb-pick-name">{r.name}</div>
                <div className="tb-pick-sub">{[nameOf(r.player_id), r.program_date ? fmtDate(r.program_date) : '', r.focus].filter(Boolean).join(' · ')}</div>
              </div>
              {busy === r.id ? <span className="tb-pick-sub">Copio…</span> : <Badge tone={r.status === 'published' ? 'green' : 'gold'}>{r.status === 'published' ? 'Pubblicata' : 'Bozza'}</Badge>}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ---------- Assegna ---------- */

function AssignModal({ template, exercises, nav, onClose }: {
  template: Partial<FitnessProgram> & { id: string }; exercises?: FitnessExercise[]; nav: (r: string) => void; onClose: () => void
}) {
  const { session } = useAuth()
  const { athletes } = useAthlete()
  const uid = session?.user.id || null
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [date, setDate] = useState(todayKey())
  const [time, setTime] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [busy, setBusy] = useState(false)

  const toggle = (id: number) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOn = athletes.length > 0 && sel.size === athletes.length

  async function run() {
    if (!uid || sel.size === 0) return
    setBusy(true)
    let list = exercises
    if (!list) {
      const { data } = await supabase.from('fitness_exercises').select('*').eq('program_id', template.id).order('order_index')
      list = (data as FitnessExercise[]) || []
    }
    let ok = 0
    const failed: string[] = []
    for (const pid of sel) {
      try {
        await copyProgram(template, template.id, {
          is_template: false, player_id: pid, trainer_id: uid, status,
          program_date: date || null, start_time: time || null,
        }, list)
        ok++
        if (status === 'published') {
          notify('player', `Nuova scheda: ${template.name}`, 'Il preparatore ti ha inviato una nuova scheda. Aprila in Area Fitness.', 'fitness', pid)
        }
      } catch {
        failed.push(athletes.find(a => a.api_player_id === pid)?.name || String(pid))
      }
    }
    setBusy(false)
    if (ok) toast(`Scheda assegnata a ${ok} ${ok === 1 ? 'atleta' : 'atleti'}`, 'ok', { label: 'Apri', onClick: () => nav('fitness') })
    if (failed.length) toast(`Non assegnata a: ${failed.join(', ')}`, 'err')
    if (!failed.length) onClose()
  }

  return (
    <Modal wide title={`Assegna · ${template.name || 'scheda'}`} onClose={onClose}
      footer={athletes.length ? <>
        <button className="btn" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={run} disabled={busy || sel.size === 0}>
          {busy ? 'Assegno…' : sel.size === 0 ? 'Scegli gli atleti' : `Assegna a ${sel.size} ${sel.size === 1 ? 'atleta' : 'atleti'}`}
        </button>
      </> : undefined}>
      {athletes.length === 0 ? (
        <Empty icon={<Icon name="users" size={22} />} title="Non hai ancora atleti collegati"
          hint="Collega i tuoi atleti per assegnare loro le schede."
          action={{ label: 'Vai ai miei atleti', onClick: () => { onClose(); nav('my-athletes') } }} />
      ) : (
        <>
          <div className="tb-hint">Ogni atleta riceve una copia della scheda: puoi personalizzarla dopo senza toccare il modello.</div>
          <div className="tb-assign-top">
            <span className="tb-label-inline">Atleti</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(allOn ? new Set() : new Set(athletes.map(a => a.api_player_id)))}>
              {allOn ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
          </div>
          <div className="tb-athletes">
            {athletes.map(a => {
              const on = sel.has(a.api_player_id)
              return (
                <button key={a.api_player_id} className={`tb-ath ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(a.api_player_id)}>
                  {a.photo_url
                    ? <img src={a.photo_url} alt="" className="tb-ath-img" />
                    : <span className="tb-ath-img tb-ath-ini">{(a.name || '?').slice(0, 1)}</span>}
                  <span className="tb-ath-name">{a.name || 'Atleta'}</span>
                  <span className="tb-ath-check">{on && <Icon name="check" size={12} />}</span>
                </button>
              )
            })}
          </div>
          <div className="tb-form-grid" style={{ marginTop: 16 }}>
            <Field label="Data"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Orario di inizio"><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
          </div>
          <div className="tb-label-inline" style={{ marginTop: 4 }}>Come la invio</div>
          <div className="tb-seg" role="radiogroup">
            <button role="radio" aria-checked={status === 'draft'} className={status === 'draft' ? 'on' : ''} onClick={() => setStatus('draft')}>
              <b>Bozza</b><span>La rivedi prima di inviarla</span>
            </button>
            <button role="radio" aria-checked={status === 'published'} className={status === 'published' ? 'on' : ''} onClick={() => setStatus('published')}>
              <b>Pubblica subito</b><span>L'atleta la vede e riceve l'avviso</span>
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ---------- Costruttore ---------- */

const EMPTY_FORM: Partial<FitnessProgram> = { name: '', intensity: 'Media', recurring: false }

function Builder({ id, nav }: { id: string; nav: (r: string) => void }) {
  const { session } = useAuth()
  const uid = session?.user.id || null
  const isNew = id === 'new'
  const [pid, setPid] = useState<string | null>(isNew ? null : id)
  const [form, setForm] = useState<Partial<FitnessProgram>>(EMPTY_FORM)
  const [exercises, setExercises] = useState<EditEx[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [presc, setPresc] = useState<{ index: number; draft: FitnessExercise; item?: FitnessLibraryItem } | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [assign, setAssign] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const compact = useIsMobile(1100) // sotto i 1100px la libreria si apre a foglio

  useEffect(() => {
    if (isNew) return
    ;(async () => {
      const [{ data: p }, { data: ex }] = await Promise.all([
        supabase.from('fitness_programs').select('*').eq('id', id).eq('is_template', true).maybeSingle(),
        supabase.from('fitness_exercises').select('*').eq('program_id', id).order('order_index'),
      ])
      if (!p) { setNotFound(true); setLoading(false); return }
      setForm(p as FitnessProgram)
      setExercises(((ex as FitnessExercise[]) || []).map(withKey))
      setLoading(false)
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // avviso se si chiude la pagina con modifiche non salvate
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const set = (k: keyof FitnessProgram, v: unknown) => { setForm(f => ({ ...f, [k]: v })); setDirty(true) }
  const changeList = (fn: (l: EditEx[]) => EditEx[]) => { setExercises(fn); setDirty(true) }

  const named = exercises.filter(e => e.name?.trim())
  const estimate = estimateMinutes(form, named)
  const totalSets = named.reduce((s, e) => s + (e.sets || 0), 0)

  function onPicked(item: FitnessLibraryItem) {
    setPresc({ index: -1, item, draft: libraryDraft(item) })
  }
  function confirmPresc(d: FitnessExercise) {
    if (!presc) return
    if (presc.index < 0) { changeList(prev => [...prev, withKey(d)]); toast(`Aggiunto: ${d.name}`) }
    else changeList(prev => prev.map((e, i) => (i === presc.index ? { ...e, ...d } : e)))
    setPresc(null)
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= exercises.length) return
    changeList(prev => { const c = [...prev];[c[i], c[j]] = [c[j], c[i]]; return c })
  }
  function onDrop(target: number) {
    if (dragIdx === null || dragIdx === target) { setDragIdx(null); setOverIdx(null); return }
    const from = dragIdx
    changeList(prev => { const c = [...prev]; const [m] = c.splice(from, 1); c.splice(target, 0, m); return c })
    setDragIdx(null); setOverIdx(null)
  }
  function removeAt(i: number) {
    const ex = exercises[i]
    changeList(prev => prev.filter(e => e._k !== ex._k))
    // nessuna scrittura nel DB: l'annulla rimette l'esercizio al suo posto
    undoable(`Rimosso: ${ex.name || 'esercizio'}`, () => undefined,
      () => changeList(prev => { if (prev.some(e => e._k === ex._k)) return prev; const c = [...prev]; c.splice(Math.min(i, c.length), 0, ex); return c }))
  }

  async function save(): Promise<string | null> {
    if (!form.name?.trim()) { toast('Dai un nome alla scheda', 'err'); document.getElementById('tb-name')?.focus(); return null }
    if (!uid) { toast('Sessione non valida: rientra e riprova.', 'err'); return null }
    setSaving(true)
    const payload = {
      ...programFields(form), program_date: null, start_time: null,
      is_template: true, player_id: null, trainer_id: uid, status: 'draft', updated_at: nowIso(),
    }
    let target = pid
    if (target) {
      const { error } = await supabase.from('fitness_programs').update(payload).eq('id', target)
      if (error) { setSaving(false); toast(error.message, 'err'); return null }
    } else {
      const { data, error } = await supabase.from('fitness_programs').insert(payload).select('id').single()
      if (error || !data) { setSaving(false); toast(error?.message || 'Salvataggio non riuscito', 'err'); return null }
      target = (data as { id: string }).id
      setPid(target)
      // aggiorna l'indirizzo senza ricaricare la vista (il refresh riapre questo modello)
      window.history.replaceState(null, '', `#/${ROUTE}?id=${target}`)
    }
    const del = await supabase.from('fitness_exercises').delete().eq('program_id', target)
    const rows = exerciseRows(target, exercises)
    const ins = rows.length ? await supabase.from('fitness_exercises').insert(rows) : { error: null }
    setSaving(false)
    if (del.error || ins.error) { toast((del.error || ins.error)!.message, 'err'); return null }
    setDirty(false)
    toast('Scheda salvata')
    return target
  }

  async function openAssign() {
    if (!named.length) { toast('Aggiungi almeno un esercizio prima di assegnare', 'err'); return }
    const target = dirty || !pid ? await save() : pid
    if (target) setAssign(true)
  }

  async function pdf() {
    if (!named.length) { toast('Aggiungi almeno un esercizio', 'err'); return }
    toast('Preparo il PDF…')
    try { await downloadPdf({ ...form, program_date: null, start_time: null }, named); toast('PDF pronto') }
    catch { toast('Non riesco a generare il PDF', 'err') }
  }

  function back() {
    if (dirty && !confirm('Hai modifiche non salvate. Uscire comunque?')) return
    setDirty(false)
    nav(ROUTE)
  }

  if (loading) return <Spinner />
  if (notFound) return (
    <div className="card">
      <Empty icon={<Icon name="layers" size={22} />} title="Modello non trovato"
        hint="Potrebbe essere stato eliminato, oppure appartiene a un altro preparatore."
        action={{ label: 'Torna ai miei modelli', onClick: () => nav(ROUTE) }} />
    </div>
  )

  const library = <ExerciseLibrary mode="pick" onPick={onPicked} />

  return (
    <div className="tb-builder">
      {/* barra superiore */}
      <div className="tb-bar">
        <button className="btn btn-ghost btn-sm tb-back" onClick={back}>
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron-right" size={14} /></span> I miei modelli
        </button>
        <div className="tb-bar-title">
          <h1 className="tb-title tb-title-sm">{form.name?.trim() || 'Nuova scheda'}</h1>
          <span className={`tb-state ${dirty ? 'dirty' : ''}`}>{saving ? 'Salvo…' : dirty ? 'Modifiche non salvate' : pid ? 'Salvata' : 'Non ancora salvata'}</span>
        </div>
        <div className="tb-bar-actions">
          <button className="btn btn-sm" onClick={() => setPreview(true)}><Icon name="file" size={13} /> Anteprima</button>
          <button className="btn btn-sm" onClick={pdf}><Icon name="download" size={13} /> PDF</button>
          <button className="btn btn-sm" onClick={openAssign} disabled={saving}><Icon name="send" size={13} /> Assegna</button>
          <button className="btn btn-primary btn-sm tb-save-desk" onClick={save} disabled={saving}><Icon name="check" size={13} /> {saving ? 'Salvo…' : 'Salva'}</button>
        </div>
      </div>

      <div className="tb-panes">
        {/* SINISTRA: libreria (solo desktop) */}
        {!compact && (
          <aside className="tb-lib" aria-label="Libreria esercizi">
            <div className="tb-pane-label">Libreria esercizi</div>
            {library}
          </aside>
        )}

        {/* DESTRA: la scheda */}
        <section className="tb-plan" aria-label="Scheda">
          <div className="card tb-card">
            <Field label="Nome scheda">
              <Input id="tb-name" className="input tb-name-input" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Es. Forza arti inferiori, settimana 1" />
            </Field>
            <div className="tb-form-grid">
              <Field label="Focus"><Input value={form.focus || ''} onChange={e => set('focus', e.target.value)} placeholder="Gambe, core…" /></Field>
              <Field label="Intensità">
                <Select value={form.intensity || 'Media'} onChange={e => set('intensity', e.target.value)}>
                  <option>Bassa</option><option>Media</option><option>Alta</option>
                </Select>
              </Field>
              <Field label="Durata (min)"><Input type="number" inputMode="numeric" min={0} value={form.duration_min ?? ''} onChange={e => set('duration_min', e.target.value ? Number(e.target.value) : null)} placeholder={estimate ? String(estimate) : '60'} /></Field>
            </div>
            <Field label="Obiettivo"><Input value={form.objective || ''} onChange={e => set('objective', e.target.value)} placeholder="Cosa deve ottenere l'atleta da questa seduta" /></Field>
            <div className="tb-form-grid">
              <Field label="Riscaldamento"><Input value={form.warmup || ''} onChange={e => set('warmup', e.target.value)} placeholder="Es. 10 min mobilità" /></Field>
              <Field label="Recupero tra serie"><Input value={form.recovery_between_sets || ''} onChange={e => set('recovery_between_sets', e.target.value)} placeholder="Es. 90s" /></Field>
              <Field label="Recupero tra esercizi"><Input value={form.recovery_between_exercises || ''} onChange={e => set('recovery_between_exercises', e.target.value)} placeholder="Es. 2 min" /></Field>
              <Field label="Defaticamento"><Input value={form.cooldown || ''} onChange={e => set('cooldown', e.target.value)} placeholder="Es. 5 min stretching" /></Field>
            </div>
            <Field label="Note per l'atleta"><Textarea rows={2} value={form.note_athlete || ''} onChange={e => set('note_athlete', e.target.value)} placeholder="Compaiono in fondo alla scheda dell'atleta" /></Field>
          </div>

          {/* riepilogo */}
          <div className="tb-summary" aria-live="polite">
            <div><b>{named.length}</b><span>{named.length === 1 ? 'esercizio' : 'esercizi'}</span></div>
            <div><b>{totalSets || 0}</b><span>serie totali</span></div>
            <div><b>{estimate ? `${estimate}′` : '0′'}</b><span>tempo stimato</span></div>
            {form.duration_min ? <div><b>{form.duration_min}′</b><span>durata indicata</span></div> : null}
          </div>

          {/* esercizi */}
          <div className="tb-list-head">
            <span className="tb-pane-label" style={{ margin: 0 }}>Esercizi</span>
            <span className="tb-list-hint">Trascina o usa le frecce per riordinare</span>
          </div>
          {exercises.length === 0 ? (
            <div className="card tb-empty-list">
              <div className="tb-empty-title">La scheda è vuota</div>
              <div className="tb-empty-text">
                <span className="tb-desk">Scegli un esercizio dalla libreria a sinistra: imposti serie, ripetizioni e carico e lo trovi qui.</span>
                <span className="tb-mob">Tocca “Aggiungi esercizio” in basso: imposti serie, ripetizioni e carico e lo trovi qui.</span>
              </div>
            </div>
          ) : (
            <ol className="tb-list">
              {exercises.map((ex, i) => {
                const parts = prescParts(ex)
                return (
                  <li key={ex._k}
                    className={`card tb-ex ${dragIdx === i ? 'dragging' : ''} ${overIdx === i && dragIdx !== i ? 'over' : ''}`}
                    draggable
                    onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={e => { e.preventDefault(); if (overIdx !== i) setOverIdx(i) }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                    onDrop={() => onDrop(i)}>
                    <span className="tb-ex-n" title="Trascina per riordinare">{i + 1}</span>
                    <span className="tb-ex-img"><ExMedia url={ex.image_url} width={160} className="exl-thumb" /></span>
                    <div className="tb-ex-body">
                      <div className="tb-ex-name">{ex.name || 'Esercizio senza nome'}</div>
                      {ex.muscle_group && <div className="tb-ex-sub">{ex.muscle_group}</div>}
                      <div className="tb-ex-chips">
                        {parts.length ? parts.map((p, j) => <Chip key={j}>{p}</Chip>) : <span className="tb-ex-sub">Nessuna prescrizione</span>}
                      </div>
                      {ex.technical_notes && <div className="tb-ex-note">{ex.technical_notes}</div>}
                    </div>
                    <div className="tb-ex-actions">
                      <button className="btn btn-sm" onClick={() => setPresc({ index: i, draft: { ...ex } })}><Icon name="sliders" size={12} /> Prescrizione</button>
                      <div className="tb-ex-move">
                        <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su">↑</button>
                        <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === exercises.length - 1} aria-label="Sposta giù">↓</button>
                        <button className="btn btn-sm btn-danger" onClick={() => removeAt(i)} aria-label={`Rimuovi ${ex.name}`}><Icon name="trash" size={13} /></button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      {/* barra fissa su telefono/tablet */}
      <div className="tb-mobilebar">
        <button className="btn" onClick={() => setLibOpen(true)}><Icon name="plus" size={14} /> Aggiungi esercizio</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</button>
      </div>

      {libOpen && compact && (
        <Modal wide title={`Aggiungi esercizio${named.length ? ` · ${named.length} in scheda` : ''}`} onClose={() => setLibOpen(false)}
          footer={<button className="btn btn-primary" onClick={() => setLibOpen(false)}>Fatto</button>}>
          <div className="tb-sheet-lib">{library}</div>
        </Modal>
      )}
      {presc && (
        <PrescriptionModal draft={presc.draft} item={presc.item} isNew={presc.index < 0}
          onCancel={() => setPresc(null)} onConfirm={confirmPresc} />
      )}
      {preview && (
        <Modal wide title="Anteprima scheda" onClose={() => setPreview(false)} dismissable
          footer={<>
            <button className="btn" onClick={pdf}><Icon name="download" size={14} /> Scarica PDF</button>
            <button className="btn btn-primary" onClick={() => setPreview(false)}>Chiudi</button>
          </>}>
          <div style={{ maxWidth: 460, margin: '0 auto' }}>
            <SchedaPreview form={{ ...form, program_date: null, start_time: null }} exercises={named} athleteName="Modello" />
          </div>
        </Modal>
      )}
      {assign && pid && (
        <AssignModal template={{ ...form, id: pid }} exercises={named} nav={nav} onClose={() => setAssign(false)} />
      )}
    </div>
  )
}

/* ========================= STILE ========================= */

const TB_CSS = `
.content:has(.tb-builder) { max-width: 1560px; }
.tb-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
.tb-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.tb-title { font-family: var(--font-display); font-stretch: 125%; font-weight: 800; text-transform: uppercase; font-size: 28px; line-height: 1.05; letter-spacing: -.2px; margin: 0; }
.tb-title-sm { font-size: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-sub { color: var(--text-dim); font-size: 14px; margin-top: 6px; max-width: 60ch; }
.tb-error { color: var(--red); font-size: 13px; margin-bottom: 14px; }
.tb-hint { color: var(--text-dim); font-size: 13px; margin-bottom: 14px; max-width: 62ch; }
.tb-section { font-size: 13px; font-weight: 700; color: var(--text-dim); margin: 0 0 12px; }
.tb-section span { color: var(--text-faint); font-weight: 600; margin-left: 4px; }

.tb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 14px; }
.tb-tcard { padding: 0; display: flex; flex-direction: column; overflow: hidden; transition: border-color .15s, box-shadow .15s; }
.tb-tcard:hover { border-color: var(--border-2); box-shadow: var(--shadow-sm); }
.tb-tcard-main { text-align: left; padding: 18px 18px 12px; display: flex; flex-direction: column; gap: 6px; flex: 1; cursor: pointer; background: none; border: 0; color: inherit; font: inherit; }
.tb-tcard-name { font-family: var(--font-display); font-stretch: 125%; font-weight: 800; text-transform: uppercase; font-size: 16px; line-height: 1.15; }
.tb-tcard-focus { font-size: 13px; color: var(--text-dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tb-tcard-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--text-dim); margin-top: 4px; }
.tb-tcard-meta b { color: var(--text); font-variant-numeric: tabular-nums; }
.tb-tcard-date { font-size: 11.5px; color: var(--text-faint); }
.tb-tcard-actions { display: flex; gap: 6px; padding: 10px 12px 12px; border-top: 1px solid var(--border); flex-wrap: wrap; }
.tb-del { margin-left: auto; }

.tb-pick-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.tb-pick-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; color: inherit; font: inherit; min-height: var(--tap); }
.tb-pick-row:hover:not(:disabled) { border-color: var(--border-2); background: var(--surface-2); }
.tb-pick-name { font-weight: 700; font-size: 14px; }
.tb-pick-sub { font-size: 12.5px; color: var(--text-faint); margin-top: 2px; }

.tb-assign-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.tb-label-inline { font-size: 12.5px; font-weight: 700; color: var(--text-dim); }
.tb-athletes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); gap: 8px; }
.tb-ath { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; text-align: left; color: inherit; font: inherit; min-height: var(--tap); }
.tb-ath:hover { border-color: var(--border-2); }
.tb-ath.on { border-color: var(--ink); background: var(--yellow-soft); }
.tb-ath-img { width: 32px; height: 32px; border-radius: 9px; object-fit: cover; flex: 0 0 auto; }
.tb-ath-ini { display: grid; place-items: center; background: var(--bg-2); font-weight: 800; font-size: 13px; }
.tb-ath-name { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-ath-check { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--border-2); display: grid; place-items: center; flex: 0 0 auto; background: var(--surface); }
.tb-ath.on .tb-ath-check { background: var(--ink); border-color: var(--ink); color: var(--yellow); }
.tb-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.tb-seg button { text-align: left; padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); cursor: pointer; display: flex; flex-direction: column; gap: 2px; color: inherit; font: inherit; }
.tb-seg button b { font-size: 14px; }
.tb-seg button span { font-size: 12px; color: var(--text-faint); }
.tb-seg button.on { border-color: var(--ink); background: var(--yellow-soft); }
.tb-seg button.on span { color: var(--text-dim); }

.tb-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 0 12px; }

/* costruttore */
.tb-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.tb-back { margin-left: -10px; }
.tb-bar-title { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
.tb-state { font-size: 12px; color: var(--text-faint); }
.tb-state.dirty { color: var(--text-dim); font-weight: 600; }
.tb-bar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.tb-panes { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(min(400px, 100%), 1fr); gap: 22px; align-items: start; }
.tb-lib { position: sticky; top: 12px; max-height: calc(100dvh - 24px); overflow: auto; overscroll-behavior: contain; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.tb-lib .exl-grid { grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); }
.tb-pane-label { font-size: 12.5px; font-weight: 700; color: var(--text-dim); margin-bottom: 12px; }
.tb-card { padding: 18px 18px 6px; }
.tb-name-input { font-size: 16px; font-weight: 700; }
.tb-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(110px, 100%), 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; margin: 16px 0 20px; }
.tb-summary > div { background: var(--surface); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
.tb-summary b { font-family: var(--font-display); font-stretch: 125%; font-size: 22px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.tb-summary span { font-size: 12px; color: var(--text-faint); }
.tb-list-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.tb-list-hint { font-size: 12px; color: var(--text-faint); }
.tb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tb-ex { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px; transition: border-color .12s, opacity .12s, transform .12s; }
.tb-ex.dragging { opacity: .4; }
.tb-ex.over { border-color: var(--ink); }
.tb-ex-n { width: 26px; height: 26px; border-radius: 8px; background: var(--yellow); color: var(--ink); font-weight: 800; font-size: 12.5px; display: grid; place-items: center; cursor: grab; font-variant-numeric: tabular-nums; margin-top: 2px; }
.tb-ex-img { width: 56px; height: 56px; border-radius: 10px; overflow: hidden; background: var(--bg-2); display: block; }
.tb-ex-body { min-width: 0; }
.tb-ex-name { font-weight: 700; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-ex-sub { font-size: 12px; color: var(--text-faint); margin-top: 1px; }
.tb-ex-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.tb-ex-note { font-size: 12.5px; color: var(--text-dim); margin-top: 6px; }
.tb-ex-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.tb-ex-move { display: flex; gap: 4px; }
.tb-empty-list { padding: 28px 20px; text-align: center; border-style: dashed; }
.tb-empty-title { font-weight: 700; }
.tb-empty-text { font-size: 13px; color: var(--text-faint); margin-top: 4px; }
.tb-mob { display: none; }
.tb-mobilebar { display: none; }

@media (max-width: 1100px) {
  .tb-panes { grid-template-columns: minmax(0, 1fr); }
  .tb-lib { display: none; }
  .tb-desk { display: none; }
  .tb-mob { display: inline; }
  .tb-save-desk { display: none; }
  .tb-builder { padding-bottom: 76px; }
  .tb-mobilebar { display: flex; gap: 8px; position: fixed; left: 0; right: 0; bottom: 0; z-index: 55; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: var(--surface); border-top: 1px solid var(--border); box-shadow: 0 -8px 24px -16px rgba(10,10,10,.18); }
  .tb-mobilebar .btn { flex: 1; justify-content: center; min-height: var(--tap); }
}
@media (max-width: 880px) {
  .tb-mobilebar { bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); padding-bottom: 10px; }
  .tb-builder { padding-bottom: 72px; }
  .tb-title { font-size: 24px; }
  .tb-head-actions { width: 100%; }
  .tb-head-actions .btn { flex: 1; justify-content: center; }
  .tb-ex { grid-template-columns: auto auto minmax(0, 1fr); }
  .tb-ex-actions { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; }
  .tb-seg { grid-template-columns: 1fr; }
  .modal:has(.tb-sheet-lib) { max-height: 100dvh; height: 100dvh; border-radius: 0; }
}
@media (prefers-reduced-motion: reduce) { .tb-ex, .tb-tcard { transition: none; } }
`
