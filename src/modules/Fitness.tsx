import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Modal, Field, Input, Textarea, Select, Spinner, Empty, Badge, Tabs } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'
import { useRouteParam } from '../lib/route'
import ExerciseLibrary, { ExerciseDetail, ExMedia, ExlStyle, exImage, exName, exThumb } from './fitness/ExerciseLibrary'
import { toast } from '../lib/toast'
import { notify } from '../lib/notify'
import type { FitnessProgram, FitnessExercise, FitnessFeedback, FitnessLibraryItem } from '../lib/types'

const ACCENT = '#3F7F00' // verde fitness (scurito per il tema chiaro)
const label: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, margin: '18px 0 10px' }
const grid = (min = 150): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 })
const todayKey = () => new Date().toISOString().slice(0, 10)

export default function Fitness({ goto }: { goto?: (r: string) => void }) {
  const { role } = useAuth()
  const isTrainer = role === 'admin' || role === 'creator' || role === 'preparatore'
  return isTrainer ? <TrainerFitness /> : <AthleteFitness goto={goto} />
}

/* ========================= VISTA PREPARATORE ========================= */

type TrainerView = 'programmi' | 'libreria'

// Cambia solo il parametro ?view= della vista corrente (tasto indietro e refresh funzionano).
function setViewParam(v: TrainerView) {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [route, query = ''] = raw.split('?')
  const params = new URLSearchParams(query)
  if (v === 'libreria') params.set('view', 'libreria'); else params.delete('view')
  const qs = params.toString()
  window.location.hash = '#/' + (route || 'fitness') + (qs ? '?' + qs : '')
}

function TrainerFitness() {
  const view: TrainerView = useRouteParam('view') === 'libreria' ? 'libreria' : 'programmi'
  return (
    <div>
      <Tabs<TrainerView> value={view} onChange={setViewParam} style={{ marginBottom: 18 }} tabs={[
        { key: 'programmi', label: 'Programmi', icon: <Icon name="layers" size={13} /> },
        { key: 'libreria', label: 'Libreria esercizi', icon: <Icon name="dumbbell" size={13} /> },
      ]} />
      {view === 'libreria' ? <ExerciseLibrary mode="browse" /> : <TrainerPrograms />}
    </div>
  )
}

function TrainerPrograms() {
  const { athleteId, athletes } = useAthlete()
  const { session } = useAuth()
  const [programs, setPrograms] = useState<FitnessProgram[]>([])
  const [trash, setTrash] = useState<FitnessProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FitnessProgram | 'new' | null>(null)

  async function load() {
    if (!athleteId) { setPrograms([]); setTrash([]); setLoading(false); return }
    setLoading(true)
    const [{ data }, { data: del }] = await Promise.all([
      supabase.from('fitness_programs').select('*')
        .eq('player_id', athleteId).is('deleted_at', null)
        .order('program_date', { ascending: false, nullsFirst: false }),
      supabase.from('fitness_programs').select('*')
        .eq('player_id', athleteId).not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
    ])
    setPrograms((data as FitnessProgram[]) || [])
    setTrash((del as FitnessProgram[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function restore(p: FitnessProgram) {
    await supabase.from('fitness_programs').update({ deleted_at: null }).eq('id', p.id)
    load()
  }
  async function purge(p: FitnessProgram) {
    if (!confirm(`Eliminare DEFINITIVAMENTE "${p.name}"? Questa operazione non è reversibile.`)) return
    await supabase.from('fitness_programs').delete().eq('id', p.id)
    load()
  }

  if (loading) return <Spinner />
  if (!athleteId) return <Empty title="Nessun atleta selezionato" hint="Seleziona un atleta dal menù in alto per gestire i suoi programmi." />

  const athleteName = athletes.find(a => a.api_player_id === athleteId)?.name || 'Atleta'
  const bozze = programs.filter(p => p.status === 'draft')
  const pubblicate = programs.filter(p => p.status === 'published')

  return (
    <div style={{ maxWidth: 1080 }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Programmi di {athleteName}</div>
          <div className="faint" style={{ fontSize: 13 }}>{programs.length} totali · {bozze.length} bozze · {pubblicate.length} pubblicati</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> Nuovo programma
        </button>
      </div>

      <TrainerSummary athletes={athletes} athleteId={athleteId} />

      <ProgramList title="Schede pubblicate" tone="published" items={pubblicate} onOpen={setEditing} />
      <ProgramList title="Schede in bozza" tone="draft" items={bozze} onOpen={setEditing} />

      {trash.length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 22 }}>
          <div style={label}>Cestino · {trash.length}</div>
          <div className="faint" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
            I programmi eliminati restano qui e si possono ripristinare in qualsiasi momento.
          </div>
          <div style={grid(260)}>
            {trash.map(p => (
              <div key={p.id} className="card" style={{ padding: 16, border: '1px dashed var(--border)', opacity: .85 }}>
                <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <Badge tone="red">Eliminato</Badge>
                </div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
                  {p.program_date ? fmtDate(p.program_date) : 'Data da definire'}{p.start_time ? ` · ${p.start_time.slice(0, 5)}` : ''}
                </div>
                <div className="flex gap" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => restore(p)}>
                    <Icon name="rotate-ccw" size={14} /> Ripristina
                  </button>
                  <button className="btn" style={{ color: 'var(--red)' }} onClick={() => purge(p)} title="Elimina definitivamente">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <ProgramEditor
          program={editing}
          athleteId={athleteId}
          athleteName={athleteName}
          trainerId={session?.user.id || null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function ProgramList({ title, items, tone, onOpen }: {
  title: string; items: FitnessProgram[]; tone: 'draft' | 'published'; onOpen: (p: FitnessProgram) => void
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={label}>{title}</div>
      <div style={grid(260)}>
        {items.map(p => (
          <button key={p.id} className="card" style={{ padding: 16, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => onOpen(p)}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <Badge tone={tone === 'published' ? 'green' : 'gold'}>{tone === 'published' ? 'Pubblicata' : 'Bozza'}</Badge>
            </div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
              {p.program_date ? fmtDate(p.program_date) : 'Data da definire'}{p.start_time ? ` · ${p.start_time.slice(0, 5)}` : ''}
            </div>
            {p.focus && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text-dim)' }}>{p.focus}</div>}
          </button>
        ))}
      </div>
    </div>
  )
}

// Esercizio in modifica: _k è solo una chiave locale (stabile anche quando si riordina), non va nel DB.
export type EditEx = FitnessExercise & { _k: string }
let exSeq = 0
export const withKey = (e: FitnessExercise): EditEx => ({ ...e, _k: `ex${++exSeq}` })
export const emptyExercise = (): FitnessExercise => ({
  name: '', muscle_group: '', sets: null, reps: '', load: '', isometry_time: '',
  recovery: '', side: '', priority: 'Media', alternative: '', technical_notes: '', mistakes: '',
  image_url: '', video_url: '', library_id: null,
  duration: '', distance: '', load_unit: '', rpe: null, rir: null, tempo: '',
})

const LOAD_UNITS: [string, string][] = [['kg', 'kg'], ['%1RM', '% 1RM'], ['lb', 'lb'], ['bw', 'Peso corporeo']]
const SIDES = ['Entrambi', 'Destro', 'Sinistro', 'Alternato']
const RPE_VALUES = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5)

/** carico leggibile: "20 kg", "70 % 1RM", "peso corporeo" */
export function loadText(e: FitnessExercise) {
  const unit = e.load_unit === 'bw' ? 'peso corporeo' : e.load_unit === '%1RM' ? '% 1RM' : e.load_unit || ''
  if (e.load && unit) return e.load_unit === 'bw' ? `${e.load} + peso corporeo` : `${e.load} ${unit}`
  return e.load || (e.load_unit === 'bw' ? 'peso corporeo' : '')
}
/** riga di prescrizione compatta, usata in editor, anteprima, vista atleta e PDF */
export function prescParts(e: FitnessExercise): string[] {
  const vol = e.sets != null ? (e.reps ? `${e.sets}×${e.reps}` : `${e.sets} serie`) : (e.reps ? `${e.reps} rip` : '')
  return [
    vol, e.duration ? e.duration : '', e.distance ? e.distance : '', loadText(e),
    e.isometry_time ? `iso ${e.isometry_time}` : '',
    e.rpe != null ? `RPE ${String(e.rpe).replace('.', ',')}` : '', e.rir != null ? `RIR ${e.rir}` : '',
    e.tempo ? `tempo ${e.tempo}` : '', e.recovery ? `rec ${e.recovery}` : '', e.side || '',
  ].filter(Boolean)
}

/** istantanea dell'esercizio scelto dalla libreria, pronta per il passo "Prescrizione" */
export function libraryDraft(item: FitnessLibraryItem): FitnessExercise {
  const muscles = (item.primary_muscles || []).filter(Boolean).join(', ') || item.muscle_group || ''
  return { ...emptyExercise(), library_id: item.id, name: exName(item), image_url: exImage(item) || '', video_url: item.video_url || '', muscle_group: muscles }
}

/** campi della scheda da scrivere in fitness_programs (senza player/trainer/status) */
export function programFields(form: Partial<FitnessProgram>) {
  return {
    name: form.name, program_date: form.program_date || null, start_time: form.start_time || null,
    duration_min: form.duration_min || null, focus: form.focus || null, objective: form.objective || null,
    intensity: form.intensity || null, warmup: form.warmup || null,
    recovery_between_sets: form.recovery_between_sets || null, recovery_between_exercises: form.recovery_between_exercises || null,
    cooldown: form.cooldown || null, general_notes: form.general_notes || null,
    note_staff: form.note_staff || null, note_athlete: form.note_athlete || null,
    pdf_path: form.pdf_path || null,
    recurring: !!form.recurring, recurrence: form.recurring ? 'weekly' : null,
  }
}

/** righe fitness_exercises per il programma pid (ordine = posizione nella lista) */
export function exerciseRows(pid: string, exercises: FitnessExercise[]) {
  return exercises.filter(e => e.name?.trim()).map((e, i) => ({
    program_id: pid, name: e.name, muscle_group: e.muscle_group || null, sets: e.sets || null,
    reps: e.reps || null, load: e.load || null, isometry_time: e.isometry_time || null, recovery: e.recovery || null,
    side: e.side || null, alternative: e.alternative || null, technical_notes: e.technical_notes || null,
    mistakes: e.mistakes || null, priority: e.priority || null, image_url: e.image_url || null,
    video_url: e.video_url || null, order_index: i,
    library_id: e.library_id || null, duration: e.duration || null, distance: e.distance || null,
    load_unit: e.load_unit || null, rpe: e.rpe ?? null, rir: e.rir ?? null, tempo: e.tempo || null,
  }))
}

function ProgramEditor({ program, athleteId, athleteName, trainerId, onClose, onSaved }: {
  program: FitnessProgram | 'new'; athleteId: number; athleteName: string; trainerId: string | null; onClose: () => void; onSaved: () => void
}) {
  const isNew = program === 'new'
  const [form, setForm] = useState<Partial<FitnessProgram>>(
    isNew ? { name: '', intensity: 'Media', program_date: todayKey(), recurring: false } : (program as FitnessProgram)
  )
  const [exercises, setExercises] = useState<EditEx[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [busy, setBusy] = useState<'' | 'draft' | 'published'>('')
  const [uploading, setUploading] = useState(false)
  const [picking, setPicking] = useState(false)
  // passo "Prescrizione": dopo la scelta dalla libreria (index = -1) o per modificare un esercizio esistente
  const [presc, setPresc] = useState<{ index: number; draft: FitnessExercise; item?: FitnessLibraryItem } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpanded = (k: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [uploadingImg, setUploadingImg] = useState<number | null>(null)
  const [review, setReview] = useState(false)

  async function uploadImage(i: number, file: File) {
    setUploadingImg(i)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const base = (exercises[i]?.name || 'esercizio').replace(/[^a-z0-9]/gi, '_').slice(0, 40)
    const path = `exercises/${Date.now()}-${base}.${ext}`
    const up = await supabase.storage.from('exercise-images').upload(path, file, { upsert: false })
    setUploadingImg(null)
    if (up.error) { toast(up.error.message, 'err'); return }
    const url = supabase.storage.from('exercise-images').getPublicUrl(path).data.publicUrl
    setEx(i, 'image_url', url)
    toast('Immagine caricata')
  }

  useEffect(() => {
    if (isNew) return
    supabase.from('fitness_exercises').select('*').eq('program_id', (program as FitnessProgram).id)
      .order('order_index').then(({ data }) => { setExercises(((data as FitnessExercise[]) || []).map(withKey)); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof FitnessProgram, v: any) => setForm({ ...form, [k]: v })
  const setEx = (i: number, k: keyof FitnessExercise, v: any) => setExercises(exercises.map((e, idx) => idx === i ? { ...e, [k]: v } : e))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= exercises.length) return
    const copy = [...exercises];[copy[i], copy[j]] = [copy[j], copy[i]]; setExercises(copy)
  }
  // Scelta dalla libreria → passo "Prescrizione" con l'istantanea dell'esercizio già pronta.
  function onPicked(item: FitnessLibraryItem) {
    setPicking(false)
    setPresc({ index: -1, item, draft: libraryDraft(item) })
  }
  function confirmPresc(d: FitnessExercise) {
    if (!presc) return
    if (presc.index < 0) { setExercises(prev => [...prev, withKey(d)]); toast(`Aggiunto: ${d.name}`) }
    else setExercises(prev => prev.map((e, i) => (i === presc.index ? { ...e, ...d } : e)))
    setPresc(null)
  }
  function addFree() {
    const e = withKey(emptyExercise())
    setExercises(prev => [...prev, e])
    setExpanded(prev => new Set(prev).add(e._k))
  }

  // Salva un esercizio libero come esercizio personalizzato in libreria e lo collega alla sessione.
  async function saveToLibrary(i: number) {
    const ex = exercises[i]
    if (!ex?.name?.trim()) { toast('Dai un nome all\'esercizio prima di salvarlo in libreria.', 'err'); return }
    if (!trainerId) { toast('Sessione non valida: rientra e riprova.', 'err'); return }
    const muscles = (ex.muscle_group || '').split(',').map(x => x.trim()).filter(Boolean)
    const { data, error } = await supabase.from('fitness_exercise_library').insert({
      name: ex.name.trim(), name_it: ex.name.trim(), muscle_group: ex.muscle_group || null, primary_muscles: muscles,
      image_url: ex.image_url || null, video_url: ex.video_url || null, archived: false,
      is_custom: true, source: 'custom', source_license: 'AUVI', curated: true, created_by: trainerId,
      slug: `custom:${crypto.randomUUID()}`,
    }).select('id').single()
    if (error) { toast(error.message, 'err'); return }
    setEx(i, 'library_id', (data as { id: string }).id)
    toast('Salvato in libreria')
  }
  const onDrop = (target: number) => {
    if (dragIdx === null || dragIdx === target) return
    const copy = [...exercises]; const [m] = copy.splice(dragIdx, 1); copy.splice(target, 0, m)
    setExercises(copy); setDragIdx(null)
  }

  async function save(status: 'draft' | 'published') {
    if (!form.name?.trim()) { alert('Inserisci il nome del programma'); return }
    setBusy(status)
    const payload: any = { player_id: athleteId, trainer_id: trainerId, status, ...programFields(form) }
    let pid = isNew ? undefined : (program as FitnessProgram).id
    if (pid) await supabase.from('fitness_programs').update(payload).eq('id', pid)
    else { const { data } = await supabase.from('fitness_programs').insert(payload).select('id').single(); pid = (data as any)?.id }

    if (pid) {
      await supabase.from('fitness_exercises').delete().eq('program_id', pid)
      const rows = exerciseRows(pid, exercises)
      if (rows.length) await supabase.from('fitness_exercises').insert(rows)
    }
    if (status === 'published') {
      notify('player', `Nuova scheda: ${form.name}`, 'Il preparatore ti ha inviato una nuova scheda. Aprila in Area Fitness.', 'fitness', athleteId)
    }
    setBusy(''); onSaved()
  }

  async function del() {
    if (isNew) return
    if (!confirm('Spostare questo programma nel cestino? Potrai ripristinarlo dal cestino in fondo alla pagina.')) return
    setBusy('draft')
    await supabase.from('fitness_programs').update({ deleted_at: new Date().toISOString() }).eq('id', (program as FitnessProgram).id)
    setBusy(''); onSaved()
  }

  return (
    <Modal
      wide
      title={isNew ? 'Nuovo programma' : 'Modifica programma'}
      onClose={onClose}
      footer={
        <>
          {!isNew && <button className="btn" style={{ color: 'var(--red)' }} onClick={del} disabled={!!busy}>Sposta nel cestino</button>}
          <button className="btn" onClick={() => save('draft')} disabled={!!busy}>{busy === 'draft' ? 'Salvo…' : 'Salva bozza'}</button>
          <button className="btn btn-primary" disabled={!!busy}
            onClick={() => { if (!form.name?.trim()) { toast('Inserisci il nome del programma', 'err'); return } setReview(true) }}>
            Rivedi e invia
          </button>
        </>
      }
    >
      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' }}>
          <div>
          {/* Dati programma */}
          <div style={grid(200)}>
            <Field label="Nome programma"><Input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Es. Forza arti inferiori" /></Field>
            <Field label="Data"><Input type="date" value={form.program_date || ''} onChange={e => set('program_date', e.target.value)} /></Field>
            <Field label="Orario"><Input type="time" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} /></Field>
            <Field label="Durata (min)"><Input type="number" value={form.duration_min ?? ''} onChange={e => set('duration_min', e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Focus"><Input value={form.focus || ''} onChange={e => set('focus', e.target.value)} placeholder="Gambe, core…" /></Field>
            <Field label="Intensità">
              <Select value={form.intensity || 'Media'} onChange={e => set('intensity', e.target.value)}>
                <option>Bassa</option><option>Media</option><option>Alta</option>
              </Select>
            </Field>
          </div>
          <Field label="Obiettivo seduta"><Input value={form.objective || ''} onChange={e => set('objective', e.target.value)} /></Field>
          <div style={grid(180)}>
            <Field label="Riscaldamento"><Input value={form.warmup || ''} onChange={e => set('warmup', e.target.value)} /></Field>
            <Field label="Recupero tra serie"><Input value={form.recovery_between_sets || ''} onChange={e => set('recovery_between_sets', e.target.value)} placeholder="Es. 90s" /></Field>
            <Field label="Recupero tra esercizi"><Input value={form.recovery_between_exercises || ''} onChange={e => set('recovery_between_exercises', e.target.value)} placeholder="Es. 2 min" /></Field>
            <Field label="Defaticamento"><Input value={form.cooldown || ''} onChange={e => set('cooldown', e.target.value)} /></Field>
          </div>
          <Field label="Note generali"><Textarea rows={2} value={form.general_notes || ''} onChange={e => set('general_notes', e.target.value)} /></Field>

          {/* Esercizi */}
          <ExlStyle />
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', ...label }}>
            <span>Esercizi ({exercises.length})</span>
          </div>
          {exercises.length === 0 && (
            <div className="faint" style={{ fontSize: 13, marginBottom: 12 }}>
              Nessun esercizio. Scegli dalla libreria AUVI e imposta la prescrizione (serie, ripetizioni, carico, RPE…).
            </div>
          )}
          {exercises.map((ex, i) => {
            const open = expanded.has(ex._k)
            const parts = prescParts(ex)
            return (
            <div key={ex._k} className="card"
              draggable onDragStart={() => setDragIdx(i)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(i)}
              style={{ padding: 12, marginBottom: 10, borderLeft: `3px solid ${ACCENT}`, opacity: dragIdx === i ? 0.4 : 1 }}>
              <div className="flex" style={{ gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', flex: '0 0 auto', background: 'var(--bg-2)' }}>
                  <ExMedia url={ex.image_url} width={160} className="exl-thumb" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex" style={{ gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, color: ACCENT, cursor: 'grab', flex: '0 0 auto' }} title="Trascina per riordinare">#{i + 1}</span>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name || 'Esercizio senza nome'}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {[ex.muscle_group, ex.library_id ? 'dalla libreria' : 'esercizio libero'].filter(Boolean).join(' · ')}
                  </div>
                  <div className="flex" style={{ flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                    {parts.length ? parts.map((p, j) => <Chip key={j}>{p}</Chip>) : <span className="faint" style={{ fontSize: 12 }}>Nessuna prescrizione</span>}
                  </div>
                  {ex.technical_notes && <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--text-dim)' }}>{ex.technical_notes}</div>}
                </div>
              </div>
              <div className="flex" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="btn btn-sm" onClick={() => setPresc({ index: i, draft: { ...ex } })}><Icon name="sliders" size={12} /> Prescrizione</button>
                <button className="btn btn-sm" onClick={() => toggleExpanded(ex._k)}><Icon name="edit" size={12} /> {open ? 'Chiudi dettagli' : 'Dettagli'}</button>
                <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su">↑</button>
                <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === exercises.length - 1} aria-label="Sposta giù">↓</button>
                {!ex.library_id && ex.name?.trim() && <button className="btn btn-sm" title="Salva come esercizio personalizzato per riusarlo" onClick={() => saveToLibrary(i)}><Icon name="archive" size={12} /> In libreria</button>}
                <button className="btn btn-sm btn-danger" onClick={() => setExercises(exercises.filter((_, idx) => idx !== i))}><Icon name="trash" size={12} /> Rimuovi</button>
              </div>
              {open && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <Field label="Nome esercizio"><Input value={ex.name} onChange={e => setEx(i, 'name', e.target.value)} /></Field>
                  <div style={grid(120)}>
                    <Field label="Gruppo muscolare"><Input value={ex.muscle_group || ''} onChange={e => setEx(i, 'muscle_group', e.target.value)} /></Field>
                    <Field label="Serie"><Input type="number" value={ex.sets ?? ''} onChange={e => setEx(i, 'sets', e.target.value ? Number(e.target.value) : null)} /></Field>
                    <Field label="Ripetizioni"><Input value={ex.reps || ''} onChange={e => setEx(i, 'reps', e.target.value)} placeholder="8-12" /></Field>
                    <Field label="Isometria"><Input value={ex.isometry_time || ''} onChange={e => setEx(i, 'isometry_time', e.target.value)} placeholder="30s" /></Field>
                    <Field label="Priorità">
                      <Select value={ex.priority || 'Media'} onChange={e => setEx(i, 'priority', e.target.value)}>
                        <option>Alta</option><option>Media</option><option>Bassa</option>
                      </Select>
                    </Field>
                  </div>
                  <div style={grid(200)}>
                    <Field label="Immagine">
                      <div className="flex gap" style={{ alignItems: 'center' }}>
                        <Input value={ex.image_url || ''} onChange={e => setEx(i, 'image_url', e.target.value)} placeholder="Carica o incolla URL…" />
                        <label className="btn btn-sm" style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {uploadingImg === i ? 'Carico…' : <><Icon name="upload" size={12} /> Foto</>}
                          <input type="file" accept="image/*" hidden disabled={uploadingImg !== null} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(i, f); e.target.value = '' }} />
                        </label>
                      </div>
                    </Field>
                    <Field label="Video (URL)"><Input value={ex.video_url || ''} onChange={e => setEx(i, 'video_url', e.target.value)} placeholder="https://…" /></Field>
                    <Field label="Variante alternativa"><Input value={ex.alternative || ''} onChange={e => setEx(i, 'alternative', e.target.value)} /></Field>
                  </div>
                  <Field label="Errori da evitare"><Textarea rows={2} value={ex.mistakes || ''} onChange={e => setEx(i, 'mistakes', e.target.value)} /></Field>
                  <div className="faint" style={{ fontSize: 12 }}>Carico, RPE, RIR, tempo, durata, distanza, lato e note si impostano da “Prescrizione”.</div>
                </div>
              )}
            </div>
            )
          })}
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setPicking(true)}><Icon name="plus" size={14} /> Aggiungi esercizio</button>
            <button className="btn" onClick={addFree}><Icon name="edit" size={14} /> Esercizio libero</button>
          </div>
          {picking && (
            <Modal wide title="Aggiungi esercizio" onClose={() => setPicking(false)}>
              <ExerciseLibrary mode="pick" onPick={onPicked} />
            </Modal>
          )}
          {presc && (
            <PrescriptionModal draft={presc.draft} item={presc.item} isNew={presc.index < 0}
              onCancel={() => setPresc(null)} onConfirm={confirmPresc} />
          )}

          {review && (
            <Modal wide title="Anteprima scheda — pronta da inviare" onClose={() => setReview(false)}
              footer={
                <>
                  <button className="btn" onClick={() => setReview(false)} disabled={!!busy}>← Modifica</button>
                  <button className="btn btn-primary" disabled={!!busy} onClick={() => save('published')}>
                    {busy === 'published' ? 'Invio…' : 'Conferma e invia all\'atleta'}
                  </button>
                </>
              }>
              <div className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>
                Ecco come l'atleta vedrà la scheda. Se è tutto ok premi “Conferma e invia”, altrimenti torna a modificarla.
              </div>
              <div style={{ maxWidth: 460, margin: '0 auto' }}>
                <SchedaPreview form={form} exercises={exercises} athleteName={athleteName} />
              </div>
            </Modal>
          )}

          {/* Scheda PDF */}
          <div style={label}>Scheda PDF</div>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            {form.pdf_path
              ? <><span className="faint" style={{ fontSize: 13 }}>PDF caricato ✓</span><button className="btn btn-sm" onClick={() => set('pdf_path', null)}>Rimuovi</button></>
              : <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Carico…' : 'Carica PDF'}
                  <input type="file" accept="application/pdf" hidden onChange={async ev => {
                    const file = ev.target.files?.[0]; if (!file) return
                    setUploading(true)
                    const path = `fitness/${athleteId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
                    const { error } = await supabase.storage.from('crm-media').upload(path, file, { upsert: false, contentType: 'application/pdf' })
                    setUploading(false)
                    if (!error) set('pdf_path', path)
                  }} />
                </label>}
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Se carichi un PDF, l'atleta lo apre direttamente come sua scheda.</div>

          {/* Note */}
          <div style={label}>Note</div>
          <Field label="Nota visibile all'atleta"><Textarea rows={2} value={form.note_athlete || ''} onChange={e => set('note_athlete', e.target.value)} /></Field>
          <Field label="Nota privata (solo staff)"><Textarea rows={2} value={form.note_staff || ''} onChange={e => set('note_staff', e.target.value)} /></Field>
          <label className="flex gap" style={{ alignItems: 'center', marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={!!form.recurring} onChange={e => set('recurring', e.target.checked)} /> Programma ricorrente settimanale
          </label>
          </div>
          <div><SchedaPreview form={form} exercises={exercises} athleteName={athleteName} /></div>
        </div>
      )}
    </Modal>
  )
}

/* ========================= VISTA ATLETA ========================= */

type ProgramFull = FitnessProgram & { fitness_exercises: FitnessExercise[]; fitness_feedback: FitnessFeedback[] }

function CoachCard({ goto, athleteId }: { goto?: (r: string) => void; athleteId: number | null }) {
  const [coach, setCoach] = useState<any | null>(null)
  useEffect(() => {
    if (!athleteId) return
    ;(async () => {
      const { data: a } = await supabase.from('fitness_trainer_athletes').select('trainer_id').eq('player_id', athleteId).limit(1).maybeSingle()
      const tid = (a as any)?.trainer_id
      if (!tid) return
      const { data: c } = await supabase.from('fitness_coach_profile').select('*').eq('trainer_id', tid).maybeSingle()
      if (c) setCoach(c)
    })()
  }, [athleteId])
  if (!coach) return null
  return (
    <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      {coach.photo_url
        ? <img src={coach.photo_url} alt="" style={{ width: 52, height: 52, borderRadius: 13, objectFit: 'cover' }} />
        : <div style={{ width: 52, height: 52, borderRadius: 13, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{(coach.name || 'C').slice(0, 1)}</div>}
      <div style={{ flex: 1, minWidth: 140 }}>
        <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Il tuo preparatore</div>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{coach.name || 'Preparatore'}</div>
        <div className="faint" style={{ fontSize: 12.5 }}>{coach.headline || ''}{coach.experience ? ` · ${coach.experience}` : ''}</div>
        {(coach.specializations || []).length > 0 && <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{(coach.specializations || []).slice(0, 3).join(' · ')}</div>}
      </div>
      {goto && <button className="btn btn-sm" onClick={() => goto('coach-profile')}>Visualizza profilo</button>}
    </div>
  )
}

function AthleteFitness({ goto }: { goto?: (r: string) => void }) {
  const { athleteId } = useAthlete()
  const [programs, setPrograms] = useState<ProgramFull[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<ProgramFull | null>(null)

  async function load() {
    if (!athleteId) { setPrograms([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('fitness_programs')
      .select('*, fitness_exercises(*), fitness_feedback(*)')
      .eq('player_id', athleteId).eq('status', 'published').is('deleted_at', null)
      .order('program_date', { ascending: true })
    setPrograms((data as ProgramFull[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />
  if (programs.length === 0) return <div style={{ maxWidth: 900 }}><CoachCard goto={goto} athleteId={athleteId} /><Empty icon={<Icon name="dumbbell" size={22} />} title="Nessun programma ancora" hint="Quando il preparatore pubblica una scheda, la trovi qui." /></div>

  const today = todayKey()
  const oggi = programs.filter(p => p.program_date === today)
  const prossimi = programs.filter(p => p.program_date && p.program_date > today)
  const storico = programs.filter(p => !p.program_date || p.program_date < today)

  return (
    <div style={{ maxWidth: 900 }}>
      <CoachCard goto={goto} athleteId={athleteId} />
      {oggi.length > 0 && <>
        <div style={label}>Programma di oggi</div>
        {oggi.map(p => <BigProgramCard key={p.id} p={p} onOpen={() => setOpen(p)} highlight />)}
      </>}
      {prossimi.length > 0 && <>
        <div style={label}>Prossimi allenamenti</div>
        {prossimi.map(p => <BigProgramCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
      </>}
      {storico.length > 0 && <>
        <div style={label}>Storico</div>
        {storico.slice().reverse().map(p => <BigProgramCard key={p.id} p={p} onOpen={() => setOpen(p)} muted />)}
      </>}
      {open && <ProgramDetail program={open} athleteId={athleteId!} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
    </div>
  )
}

function BigProgramCard({ p, onOpen, highlight, muted }: { p: ProgramFull; onOpen: () => void; highlight?: boolean; muted?: boolean }) {
  const fb = p.fitness_feedback?.[0]
  const stato = fb?.status || 'programmato'
  const toneMap: any = { completato: 'green', saltato: 'red', programmato: 'gold' }
  return (
    <button className="card" onClick={onOpen}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: 18, marginBottom: 12, cursor: 'pointer', opacity: muted ? 0.7 : 1, border: highlight ? `1px solid ${ACCENT}` : '1px solid var(--border)' }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{p.name}</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
            {p.program_date ? fmtDate(p.program_date) : ''}{p.start_time ? ` · ${p.start_time.slice(0, 5)}` : ''}{p.duration_min ? ` · ${p.duration_min} min` : ''}
          </div>
          {p.focus && <div style={{ fontSize: 13, marginTop: 4, color: ACCENT }}>{p.focus}</div>}
        </div>
        <Badge tone={toneMap[stato]}>{stato}</Badge>
      </div>
      <div className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>{p.fitness_exercises?.length || 0} esercizi · tocca per aprire</div>
    </button>
  )
}

function ProgramDetail({ program, athleteId, onClose, onSaved }: {
  program: ProgramFull; athleteId: number; onClose: () => void; onSaved: () => void
}) {
  const exercises = (program.fitness_exercises || []).slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  const existing = program.fitness_feedback?.[0]
  const [fb, setFb] = useState<FitnessFeedback>(existing || { program_id: program.id, player_id: athleteId, status: 'programmato', completed: false, feeling: '', discomfort: '', athlete_notes: '' })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  // Schede tecniche della libreria: l'atleta di norma non può leggerle (RLS) → in quel caso
  // la query torna vuota e il pulsante "Come si fa" semplicemente non compare.
  const [lib, setLib] = useState<Record<string, FitnessLibraryItem>>({})
  const [howTo, setHowTo] = useState<FitnessLibraryItem | null>(null)
  useEffect(() => {
    const ids = [...new Set(exercises.map(e => e.library_id).filter(Boolean) as string[])]
    if (!ids.length) return
    supabase.from('fitness_exercise_library').select('*').in('id', ids).then(({ data, error }) => {
      if (error || !data) return
      setLib(Object.fromEntries((data as FitnessLibraryItem[]).map(x => [x.id, x])))
    }, () => { /* rete assente: niente scheda tecnica */ })
  }, [program.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    setBusy(true)
    const payload = { ...fb, program_id: program.id, player_id: athleteId, completed: fb.status === 'completato' }
    const { error } = await supabase.from('fitness_feedback').upsert(payload, { onConflict: 'program_id' })
    setBusy(false)
    if (!error) { setSaved(true); setTimeout(() => { setSaved(false); onSaved() }, 1000) }
  }

  return (
    <Modal wide title={program.name} onClose={onClose}
      footer={<>
        {program.pdf_path
          ? <button className="btn" onClick={async () => { const { data } = await supabase.storage.from('crm-media').createSignedUrl(program.pdf_path!, 300); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }}><Icon name="download" size={14} /> Apri scheda PDF</button>
          : <button className="btn" onClick={async () => {
              toast('Preparo il PDF…')
              try { await downloadPdf(program, exercises); toast('PDF pronto — salvalo dove vuoi') }
              catch { toast('Non riesco a generare il PDF', 'err') }
            }}><Icon name="download" size={14} /> Scarica PDF</button>}
      </>}>
      <div className="faint" style={{ fontSize: 13 }}>
        {program.program_date ? fmtDate(program.program_date) : ''}{program.start_time ? ` · ${program.start_time.slice(0, 5)}` : ''}{program.duration_min ? ` · ${program.duration_min} min` : ''}{program.intensity ? ` · intensità ${program.intensity}` : ''}
      </div>
      {program.focus && <div style={{ marginTop: 6, color: ACCENT, fontWeight: 700 }}>{program.focus}</div>}
      {program.objective && <div style={{ marginTop: 4 }}>{program.objective}</div>}

      {(program.warmup || program.recovery_between_sets || program.recovery_between_exercises || program.cooldown) && (
        <div className="card" style={{ padding: 12, marginTop: 14, ...grid(150) }}>
          {program.warmup && <Info k="Riscaldamento" v={program.warmup} />}
          {program.recovery_between_sets && <Info k="Rec. tra serie" v={program.recovery_between_sets} />}
          {program.recovery_between_exercises && <Info k="Rec. tra esercizi" v={program.recovery_between_exercises} />}
          {program.cooldown && <Info k="Defaticamento" v={program.cooldown} />}
        </div>
      )}

      <div style={label}>Esercizi</div>
      {exercises.map((ex, i) => (
        <div key={i} className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `3px solid ${ACCENT}` }}>
          <div className="flex" style={{ justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>{i + 1}. {ex.name}</div>
            {ex.muscle_group && <Badge tone="accent">{ex.muscle_group}</Badge>}
          </div>
          <div className="flex gap" style={{ flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
            {prescParts(ex).map((p, j) => <Chip key={j}>{p}</Chip>)}
          </div>
          {((ex.library_id && lib[ex.library_id]) || ex.image_url || ex.video_url) && (
            <div className="flex gap" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              {ex.library_id && lib[ex.library_id] && <button className="btn btn-sm btn-primary" onClick={() => setHowTo(lib[ex.library_id!])}><Icon name="activity" size={12} /> Come si fa</button>}
              {ex.image_url && !ex.image_url.includes('raw.githubusercontent.com') && <a className="btn btn-sm" href={ex.image_url} target="_blank" rel="noreferrer"><Icon name="image" size={12} /> Immagine</a>}
              {ex.video_url && <a className="btn btn-sm" href={ex.video_url} target="_blank" rel="noreferrer">Video</a>}
            </div>
          )}
          {ex.technical_notes && <div style={{ fontSize: 13, marginTop: 8 }}><b>Note:</b> {ex.technical_notes}</div>}
          {ex.mistakes && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text-dim)' }}><b>Da evitare:</b> {ex.mistakes}</div>}
          {ex.alternative && <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--text-dim)' }}>Alternativa: {ex.alternative}</div>}
        </div>
      ))}
      {howTo && <ExerciseDetail item={howTo} onClose={() => setHowTo(null)} />}

      {program.note_athlete && (
        <div className="card" style={{ padding: 14, marginTop: 6, borderLeft: `3px solid ${ACCENT}` }}>
          <div style={{ ...label, margin: '0 0 6px' }}>Nota del preparatore</div>
          <div style={{ fontSize: 14 }}>{program.note_athlete}</div>
        </div>
      )}

      {/* Feedback rapido (<20s) */}
      <div style={label}>Come è andata?</div>
      <div className="card" style={{ padding: 16 }}>
        <FbQ title="Allenamento completato?">
          {([['completato', '✅ Completato'], ['parziale', '⭕ Parziale'], ['non_completato', '❌ Non completato']] as const).map(([v, l]) => (
            <TapBtn key={v} on={fb.status === v} onClick={() => setFb({ ...fb, status: v })}>{l}</TapBtn>
          ))}
        </FbQ>
        <FbQ title="Come ti sei sentito?">
          {([['ottimo', '😀'], ['bene', '🙂'], ['normale', '😐'], ['affaticato', '😕'], ['pesante', '😣']] as const).map(([v, em]) => (
            <TapBtn key={v} on={fb.feeling === v} onClick={() => setFb({ ...fb, feeling: v })}><span style={{ fontSize: 20 }}>{em}</span></TapBtn>
          ))}
        </FbQ>
        <FbQ title="Hai avuto fastidi?">
          {['nessuno', 'ginocchio', 'caviglia', 'schiena', 'adduttori', 'flessori', 'altro'].map(v => (
            <TapBtn key={v} small on={fb.discomfort === v} onClick={() => setFb({ ...fb, discomfort: v })}>{cap(v)}</TapBtn>
          ))}
        </FbQ>
        <Field label={fb.discomfort === 'altro' ? 'Specifica il fastidio (facoltativo)' : 'Nota (facoltativa, max 150)'}>
          <Input maxLength={150} value={fb.athlete_notes || ''} onChange={e => setFb({ ...fb, athlete_notes: e.target.value })} placeholder="Opzionale" />
        </Field>
        <div className="flex gap" style={{ marginTop: 12, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={send} disabled={busy || !fb.status || fb.status === 'programmato'}>{busy ? 'Invio…' : 'Invia'}</button>
          {saved && <span style={{ color: 'var(--green)', fontSize: 13 }}>Inviato ✓</span>}
        </div>
      </div>
    </Modal>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return <div><div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{k}</div><div style={{ fontSize: 13, marginTop: 2 }}>{v}</div></div>
}
export function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 9px', fontSize: 12.5 }}>{children}</span>
}

function FbQ({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div className="flex gap" style={{ flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}
function TapBtn({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? '7px 12px' : '9px 15px', borderRadius: 10, cursor: 'pointer',
      border: on ? `1.5px solid ${ACCENT}` : '1px solid var(--border)',
      background: on ? ACCENT + '26' : 'transparent', color: 'inherit',
      fontSize: 13.5, fontWeight: on ? 700 : 500,
    }}>{children}</button>
  )
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const FEELING: Record<string, string> = { ottimo: '😀', bene: '🙂', normale: '😐', affaticato: '😕', pesante: '😣' }
const STATUS_LABEL: Record<string, string> = { completato: 'Completato', parziale: 'Completato parzialmente', non_completato: 'Non completato', saltato: 'Saltato', programmato: 'Programmato' }

function TrainerSummary({ athletes, athleteId }: { athletes: { api_player_id: number; name: string | null }[]; athleteId: number | null }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('fitness_feedback').select('*, fitness_programs(name, program_date, player_id)').then(({ data }) => {
      const byPlayer: Record<number, any> = {}
      ;(data as any[] || []).forEach(f => {
        const pid = f.fitness_programs?.player_id
        if (!pid) return
        // mostra solo il feedback dell'atleta selezionato
        if (athleteId && pid !== athleteId) return
        const d = f.fitness_programs?.program_date || ''
        if (!byPlayer[pid] || (byPlayer[pid].fitness_programs?.program_date || '') < d) byPlayer[pid] = f
      })
      setRows(Object.values(byPlayer))
      setLoading(false)
    })
  }, [athleteId])
  if (loading || rows.length === 0) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={label}>Ultimo feedback</div>
      <div className="card" style={{ padding: 6 }}>
        <div className="list">
          {rows.map(f => {
            const name = athletes.find(a => a.api_player_id === f.fitness_programs?.player_id)?.name || '—'
            const disc = f.discomfort && f.discomfort !== 'nessuno' ? f.discomfort : ''
            const issue = f.status !== 'completato' || !!disc
            return (
              <div key={f.id} className="row" style={{ alignItems: 'center', borderLeft: issue ? '2px solid var(--orange)' : '2px solid transparent', paddingLeft: 10 }}>
                <div className="row-main">
                  <div className="row-title">{name}</div>
                  <div className="row-sub">
                    {STATUS_LABEL[f.status] || f.status}{disc ? ` · fastidio: ${cap(disc)}` : ''}{f.fitness_programs?.program_date ? ` · ${fmtDate(f.fitness_programs.program_date)}` : ''}
                  </div>
                </div>
                {f.feeling && <span style={{ fontSize: 20 }}>{FEELING[f.feeling] || ''}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Passo "Prescrizione" ---------- */

export function PrescriptionModal({ draft, item, isNew, onCancel, onConfirm }: {
  draft: FitnessExercise; item?: FitnessLibraryItem; isNew: boolean; onCancel: () => void; onConfirm: (d: FitnessExercise) => void
}) {
  const [d, setD] = useState<FitnessExercise>(draft)
  const set = <K extends keyof FitnessExercise>(k: K, v: FitnessExercise[K]) => setD(prev => ({ ...prev, [k]: v }))
  const legacySide = d.side && !SIDES.includes(d.side) ? d.side : null
  return (
    <Modal wide title={isNew ? 'Prescrizione' : `Prescrizione · ${d.name || 'esercizio'}`} onClose={onCancel}
      footer={<>
        <button className="btn" onClick={onCancel}>{isNew ? 'Annulla' : 'Chiudi'}</button>
        <button className="btn btn-primary" onClick={() => onConfirm(d)}><Icon name="check" size={14} /> {isNew ? 'Aggiungi alla sessione' : 'Salva prescrizione'}</button>
      </>}>
      <ExlStyle />
      <div className="flex" style={{ gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', flex: '0 0 auto', background: 'var(--bg-2)' }}>
          <ExMedia url={d.image_url} width={200} className="exl-thumb" category={item?.category} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{d.name}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>{[item?.category, d.muscle_group].filter(Boolean).join(' · ')}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>Nessun campo è obbligatorio: compila solo quello che serve.</div>
        </div>
      </div>
      <div style={grid(130)}>
        <Field label="Serie"><Input type="number" inputMode="numeric" min={0} value={d.sets ?? ''} onChange={e => set('sets', e.target.value ? Number(e.target.value) : null)} placeholder="3" /></Field>
        <Field label="Ripetizioni"><Input value={d.reps || ''} onChange={e => set('reps', e.target.value)} placeholder="8-10" /></Field>
        <Field label="Durata"><Input value={d.duration || ''} onChange={e => set('duration', e.target.value)} placeholder="30s · 4 min" /></Field>
        <Field label="Distanza"><Input value={d.distance || ''} onChange={e => set('distance', e.target.value)} placeholder="20 m" /></Field>
        <Field label="Carico"><Input value={d.load || ''} onChange={e => set('load', e.target.value)} placeholder="20" /></Field>
        <Field label="Unità carico">
          <Select value={d.load_unit || ''} onChange={e => set('load_unit', e.target.value)}>
            <option value="">—</option>{LOAD_UNITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="RPE (1-10)">
          <Select value={d.rpe ?? ''} onChange={e => set('rpe', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>{RPE_VALUES.map(v => <option key={v} value={v}>{String(v).replace('.', ',')}</option>)}
          </Select>
        </Field>
        <Field label="RIR (0-5)">
          <Select value={d.rir ?? ''} onChange={e => set('rir', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>{[0, 1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Recupero"><Input value={d.recovery || ''} onChange={e => set('recovery', e.target.value)} placeholder="90s" /></Field>
        <Field label="Tempo"><Input value={d.tempo || ''} onChange={e => set('tempo', e.target.value)} placeholder="3-1-1-0" /></Field>
        <Field label="Lato">
          <Select value={d.side || ''} onChange={e => set('side', e.target.value)}>
            <option value="">—</option>{SIDES.map(v => <option key={v}>{v}</option>)}
            {legacySide && <option>{legacySide}</option>}
          </Select>
        </Field>
      </div>
      <Field label="Note"><Textarea rows={2} value={d.technical_notes || ''} onChange={e => set('technical_notes', e.target.value)} placeholder="Indicazioni per l'atleta" /></Field>
    </Modal>
  )
}

export function SchedaPreview({ form, exercises, athleteName }: { form: Partial<FitnessProgram>; exercises: FitnessExercise[]; athleteName: string }) {
  const list = exercises.filter(e => e.name?.trim())
  return (
    <div className="card" style={{ padding: 18, position: 'sticky', top: 8 }}>
      <ExlStyle />
      <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Anteprima scheda atleta</div>
      <div style={{ fontSize: 12.5, marginTop: 8 }}>{athleteName}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{form.name || 'Nuovo programma'}</div>
      {form.focus && <div style={{ color: ACCENT, fontWeight: 700, fontSize: 13, marginTop: 2 }}>{form.focus}</div>}
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
        {[form.program_date ? fmtDate(form.program_date) : '', form.start_time ? form.start_time.slice(0, 5) : '', form.duration_min ? `${form.duration_min} min` : '', form.intensity].filter(Boolean).join(' · ')}
      </div>
      <div style={{ marginTop: 12 }}>
        {list.map((e, i) => (
          <div key={i} className="flex" style={{ gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            {e.image_url
              ? <span style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flex: '0 0 auto', background: 'var(--bg-2)' }}><ExMedia url={e.image_url} width={120} className="exl-thumb" /></span>
              : <span style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontWeight: 700 }}>{i + 1}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{e.name}</div>
              <div className="faint" style={{ fontSize: 11.5 }}>{prescParts(e).join(' · ')}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>Aggiungi esercizi per vedere l'anteprima.</div>}
      </div>
      {form.note_athlete && <div style={{ marginTop: 12, fontSize: 12.5 }}><b>Nota:</b> {form.note_athlete}</div>}
    </div>
  )
}

/* ========================= PDF (download reale, jsPDF) ========================= */

// Carica un'immagine come dataURL (per inserirla nel PDF). Ritorna null se non riesce.
async function imgToData(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = no; r.readAsDataURL(blob) })
    const dim = await new Promise<{ w: number; h: number }>((ok) => { const im = new Image(); im.onload = () => ok({ w: im.width, h: im.height }); im.onerror = () => ok({ w: 1, h: 1 }); im.src = data })
    return { data, ...dim }
  } catch { return null }
}

export async function downloadPdf(p: Partial<FitnessProgram>, exercises: FitnessExercise[]) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 16
  const maxW = W - M * 2
  let y = M

  const ink = (r: number, g: number, b: number) => doc.setTextColor(r, g, b)
  function ensure(h: number) { if (y + h > 297 - M) { doc.addPage(); y = M } }
  function text(str: string, size: number, style: 'normal' | 'bold' = 'normal', color: [number, number, number] = [17, 17, 17], indent = 0) {
    if (!str) return
    doc.setFont('helvetica', style); doc.setFontSize(size); ink(...color)
    const lines = doc.splitTextToSize(str, maxW - indent)
    for (const ln of lines) { ensure(size * 0.42 + 1.5); doc.text(ln, M + indent, y); y += size * 0.42 + 1.5 }
  }

  // Testata
  text(p.name || 'Programma', 18, 'bold')
  const sub = [p.program_date ? fmtDate(p.program_date) : '', p.start_time ? p.start_time.slice(0, 5) : '', p.duration_min ? p.duration_min + ' min' : '', p.intensity ? 'intensità ' + p.intensity : ''].filter(Boolean).join('  ·  ')
  text(sub, 10, 'normal', [110, 110, 110]); y += 1
  if (p.focus) text(p.focus, 11, 'bold', [70, 70, 70])
  if (p.objective) text(p.objective, 10.5)
  if (p.warmup) { y += 1; text('Riscaldamento', 10, 'bold', [90, 90, 90]); text(p.warmup, 10.5) }
  y += 3

  // Esercizi
  ensure(8); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); ink(17, 17, 17); doc.text('Esercizi', M, y); y += 6

  const images = await Promise.all(exercises.map(async e => {
    if (!e.image_url || e.image_url.includes('raw.githubusercontent.com')) return null
    const small = exThumb(e.image_url, 400)
    return (small && small !== e.image_url ? await imgToData(small) : null) || imgToData(e.image_url)
  }))
  exercises.forEach((e, i) => {
    const img = images[i]
    const blockTop = y
    ensure(22)
    const textX = img ? M + 26 : M
    const tw = maxW - (img ? 26 : 0)
    // titolo
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); ink(17, 17, 17)
    for (const ln of doc.splitTextToSize(`${i + 1}. ${e.name}${e.muscle_group ? '  (' + e.muscle_group + ')' : ''}`, tw)) { ensure(6); doc.text(ln, textX, y); y += 5 }
    // chip riga
    const chips = prescParts(e).join('  ·  ')
    if (chips) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); ink(90, 90, 90); for (const ln of doc.splitTextToSize(chips, tw)) { ensure(5); doc.text(ln, textX, y); y += 4.5 } }
    if (e.technical_notes) { doc.setFontSize(9.5); ink(60, 60, 60); for (const ln of doc.splitTextToSize('Note: ' + e.technical_notes, tw)) { ensure(5); doc.text(ln, textX, y); y += 4.3 } }
    if (e.mistakes) { doc.setFontSize(9.5); ink(150, 60, 60); for (const ln of doc.splitTextToSize('Da evitare: ' + e.mistakes, tw)) { ensure(5); doc.text(ln, textX, y); y += 4.3 } }
    // immagine a sinistra
    if (img) {
      const side = 22, ratio = img.h / (img.w || 1)
      const ih = Math.min(side, side * ratio), iw = ih / ratio
      const fmt = img.data.startsWith('data:image/png') ? 'PNG' : img.data.startsWith('data:image/webp') ? 'WEBP' : 'JPEG'
      try { doc.addImage(img.data, fmt, M, blockTop, iw, ih) } catch { /* skip */ }
    }
    y += 4
  })

  if (p.recovery_between_sets) text('Recupero tra serie: ' + p.recovery_between_sets, 10.5)
  if (p.cooldown) text('Defaticamento: ' + p.cooldown, 10.5)
  if (p.note_athlete) { y += 1; text('Nota preparatore: ' + p.note_athlete, 10.5, 'bold', [80, 80, 80]) }

  const fname = `${(p.name || 'programma').replace(/[^\w\- ]/g, '')} ${p.program_date || ''}`.trim() + '.pdf'
  doc.save(fname)
}
