import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Modal, Field, Input, Textarea, Select, Spinner, Empty, Badge } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'
import type { FitnessProgram, FitnessExercise, FitnessFeedback, FitnessLibraryItem } from '../lib/types'

const ACCENT = '#8b93a1' // neutro (indipendente dai colori squadra)
const label: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, margin: '18px 0 10px' }
const grid = (min = 150): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 })
const todayKey = () => new Date().toISOString().slice(0, 10)

export default function Fitness() {
  const { role } = useAuth()
  const isTrainer = role === 'admin' || role === 'creator' || role === 'preparatore'
  return isTrainer ? <TrainerFitness /> : <AthleteFitness />
}

/* ========================= VISTA PREPARATORE ========================= */

function TrainerFitness() {
  const { athleteId, athletes } = useAthlete()
  const { session } = useAuth()
  const [programs, setPrograms] = useState<FitnessProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FitnessProgram | 'new' | null>(null)

  async function load() {
    if (!athleteId) { setPrograms([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('fitness_programs').select('*')
      .eq('player_id', athleteId).order('program_date', { ascending: false, nullsFirst: false })
    setPrograms((data as FitnessProgram[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

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

      <TrainerSummary athletes={athletes} />

      <ProgramList title="Schede pubblicate" tone="published" items={pubblicate} onOpen={setEditing} />
      <ProgramList title="Schede in bozza" tone="draft" items={bozze} onOpen={setEditing} />

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

const emptyExercise = (): FitnessExercise => ({
  name: '', muscle_group: '', sets: null, reps: '', load: '', isometry_time: '',
  recovery: '', side: '', priority: 'Media', alternative: '', technical_notes: '', mistakes: '',
  image_url: '', video_url: '',
})

function ProgramEditor({ program, athleteId, athleteName, trainerId, onClose, onSaved }: {
  program: FitnessProgram | 'new'; athleteId: number; athleteName: string; trainerId: string | null; onClose: () => void; onSaved: () => void
}) {
  const isNew = program === 'new'
  const [form, setForm] = useState<Partial<FitnessProgram>>(
    isNew ? { name: '', intensity: 'Media', program_date: todayKey(), recurring: false } : (program as FitnessProgram)
  )
  const [exercises, setExercises] = useState<FitnessExercise[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [busy, setBusy] = useState<'' | 'draft' | 'published'>('')
  const [uploading, setUploading] = useState(false)
  const [showLib, setShowLib] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  useEffect(() => {
    if (isNew) return
    supabase.from('fitness_exercises').select('*').eq('program_id', (program as FitnessProgram).id)
      .order('order_index').then(({ data }) => { setExercises((data as FitnessExercise[]) || []); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof FitnessProgram, v: any) => setForm({ ...form, [k]: v })
  const setEx = (i: number, k: keyof FitnessExercise, v: any) => setExercises(exercises.map((e, idx) => idx === i ? { ...e, [k]: v } : e))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= exercises.length) return
    const copy = [...exercises];[copy[i], copy[j]] = [copy[j], copy[i]]; setExercises(copy)
  }
  const addFromLibrary = (item: FitnessLibraryItem) =>
    setExercises(prev => [...prev, { ...emptyExercise(), name: item.name, muscle_group: item.muscle_group || '', image_url: item.image_url || '' }])
  const onDrop = (target: number) => {
    if (dragIdx === null || dragIdx === target) return
    const copy = [...exercises]; const [m] = copy.splice(dragIdx, 1); copy.splice(target, 0, m)
    setExercises(copy); setDragIdx(null)
  }

  async function save(status: 'draft' | 'published') {
    if (!form.name?.trim()) { alert('Inserisci il nome del programma'); return }
    setBusy(status)
    const payload: any = {
      player_id: athleteId, trainer_id: trainerId, status,
      name: form.name, program_date: form.program_date || null, start_time: form.start_time || null,
      duration_min: form.duration_min || null, focus: form.focus || null, objective: form.objective || null,
      intensity: form.intensity || null, warmup: form.warmup || null,
      recovery_between_sets: form.recovery_between_sets || null, recovery_between_exercises: form.recovery_between_exercises || null,
      cooldown: form.cooldown || null, general_notes: form.general_notes || null,
      note_staff: form.note_staff || null, note_athlete: form.note_athlete || null,
      pdf_path: form.pdf_path || null,
      recurring: !!form.recurring, recurrence: form.recurring ? 'weekly' : null,
    }
    let pid = isNew ? undefined : (program as FitnessProgram).id
    if (pid) await supabase.from('fitness_programs').update(payload).eq('id', pid)
    else { const { data } = await supabase.from('fitness_programs').insert(payload).select('id').single(); pid = (data as any)?.id }

    if (pid) {
      await supabase.from('fitness_exercises').delete().eq('program_id', pid)
      const rows = exercises.filter(e => e.name?.trim()).map((e, i) => ({
        program_id: pid, name: e.name, muscle_group: e.muscle_group || null, sets: e.sets || null,
        reps: e.reps || null, load: e.load || null, isometry_time: e.isometry_time || null, recovery: e.recovery || null,
        side: e.side || null, alternative: e.alternative || null, technical_notes: e.technical_notes || null,
        mistakes: e.mistakes || null, priority: e.priority || null, image_url: e.image_url || null,
        video_url: e.video_url || null, order_index: i,
      }))
      if (rows.length) await supabase.from('fitness_exercises').insert(rows)
    }
    setBusy(''); onSaved()
  }

  return (
    <Modal
      wide
      title={isNew ? 'Nuovo programma' : 'Modifica programma'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => save('draft')} disabled={!!busy}>{busy === 'draft' ? 'Salvo…' : 'Salva bozza'}</button>
          <button className="btn btn-primary" onClick={() => save('published')} disabled={!!busy}>
            {busy === 'published' ? 'Pubblico…' : 'Pubblica in agenda'}
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
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', ...label }}>
            <span>Esercizi ({exercises.length})</span>
            <button className="btn btn-sm" onClick={() => setShowLib(true)}><Icon name="plus" size={12} /> Da libreria</button>
          </div>
          {exercises.map((ex, i) => (
            <div key={i} className="card"
              draggable onDragStart={() => setDragIdx(i)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(i)}
              style={{ padding: 14, marginBottom: 12, borderLeft: `3px solid ${ACCENT}`, opacity: dragIdx === i ? 0.4 : 1 }}>
              {ex.image_url && <img src={ex.image_url} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', background: '#fff', marginBottom: 10 }} />}
              <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: ACCENT, cursor: 'grab' }}>⠿ #{i + 1}</span>
                <div className="flex gap">
                  <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === exercises.length - 1}>↓</button>
                  <button className="btn btn-sm" onClick={() => setExercises(exercises.filter((_, idx) => idx !== i))}>Rimuovi</button>
                </div>
              </div>
              <Field label="Nome esercizio"><Input value={ex.name} onChange={e => setEx(i, 'name', e.target.value)} /></Field>
              <div style={grid(120)}>
                <Field label="Gruppo muscolare"><Input value={ex.muscle_group || ''} onChange={e => setEx(i, 'muscle_group', e.target.value)} /></Field>
                <Field label="Serie"><Input type="number" value={ex.sets ?? ''} onChange={e => setEx(i, 'sets', e.target.value ? Number(e.target.value) : null)} /></Field>
                <Field label="Ripetizioni"><Input value={ex.reps || ''} onChange={e => setEx(i, 'reps', e.target.value)} placeholder="8-12" /></Field>
                <Field label="Carico"><Input value={ex.load || ''} onChange={e => setEx(i, 'load', e.target.value)} placeholder="20kg" /></Field>
                <Field label="Isometria"><Input value={ex.isometry_time || ''} onChange={e => setEx(i, 'isometry_time', e.target.value)} placeholder="30s" /></Field>
                <Field label="Recupero"><Input value={ex.recovery || ''} onChange={e => setEx(i, 'recovery', e.target.value)} placeholder="60s" /></Field>
                <Field label="Lato / gamba">
                  <Select value={ex.side || ''} onChange={e => setEx(i, 'side', e.target.value)}>
                    <option value="">—</option><option>Sinistra</option><option>Destra</option><option>Entrambe</option>
                  </Select>
                </Field>
                <Field label="Priorità">
                  <Select value={ex.priority || 'Media'} onChange={e => setEx(i, 'priority', e.target.value)}>
                    <option>Alta</option><option>Media</option><option>Bassa</option>
                  </Select>
                </Field>
              </div>
              <div style={grid(200)}>
                <Field label="Immagine (URL)"><Input value={ex.image_url || ''} onChange={e => setEx(i, 'image_url', e.target.value)} placeholder="https://…" /></Field>
                <Field label="Video (URL)"><Input value={ex.video_url || ''} onChange={e => setEx(i, 'video_url', e.target.value)} placeholder="https://…" /></Field>
                <Field label="Variante alternativa"><Input value={ex.alternative || ''} onChange={e => setEx(i, 'alternative', e.target.value)} /></Field>
              </div>
              <Field label="Note tecniche"><Textarea rows={2} value={ex.technical_notes || ''} onChange={e => setEx(i, 'technical_notes', e.target.value)} /></Field>
              <Field label="Errori da evitare"><Textarea rows={2} value={ex.mistakes || ''} onChange={e => setEx(i, 'mistakes', e.target.value)} /></Field>
            </div>
          ))}
          <button className="btn" onClick={() => setExercises([...exercises, emptyExercise()])}><Icon name="plus" size={14} /> Aggiungi esercizio</button>
          {showLib && <LibraryPicker onClose={() => setShowLib(false)} onPick={addFromLibrary} />}

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

function AthleteFitness() {
  const { athleteId } = useAthlete()
  const [programs, setPrograms] = useState<ProgramFull[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<ProgramFull | null>(null)

  async function load() {
    if (!athleteId) { setPrograms([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('fitness_programs')
      .select('*, fitness_exercises(*), fitness_feedback(*)')
      .eq('player_id', athleteId).eq('status', 'published').order('program_date', { ascending: true })
    setPrograms((data as ProgramFull[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />
  if (programs.length === 0) return <Empty icon={<Icon name="dumbbell" size={22} />} title="Nessun programma ancora" hint="Quando il preparatore pubblica una scheda, la trovi qui." />

  const today = todayKey()
  const oggi = programs.filter(p => p.program_date === today)
  const prossimi = programs.filter(p => p.program_date && p.program_date > today)
  const storico = programs.filter(p => !p.program_date || p.program_date < today)

  return (
    <div style={{ maxWidth: 900 }}>
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
          : <button className="btn" onClick={() => downloadPdf(program, exercises)}><Icon name="download" size={14} /> Scarica PDF</button>}
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
            {ex.sets != null && <Chip>{ex.sets} serie</Chip>}
            {ex.reps && <Chip>{ex.reps} rip</Chip>}
            {ex.load && <Chip>carico {ex.load}</Chip>}
            {ex.isometry_time && <Chip>iso {ex.isometry_time}</Chip>}
            {ex.recovery && <Chip>rec {ex.recovery}</Chip>}
            {ex.side && <Chip>{ex.side}</Chip>}
          </div>
          {(ex.image_url || ex.video_url) && (
            <div className="flex gap" style={{ marginTop: 8 }}>
              {ex.image_url && <a className="btn btn-sm" href={ex.image_url} target="_blank" rel="noreferrer">Immagine</a>}
              {ex.video_url && <a className="btn btn-sm" href={ex.video_url} target="_blank" rel="noreferrer">Video</a>}
            </div>
          )}
          {ex.technical_notes && <div style={{ fontSize: 13, marginTop: 8 }}><b>Note:</b> {ex.technical_notes}</div>}
          {ex.mistakes && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text-dim)' }}><b>Da evitare:</b> {ex.mistakes}</div>}
          {ex.alternative && <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--text-dim)' }}>Alternativa: {ex.alternative}</div>}
        </div>
      ))}

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
          {saved && <span style={{ color: '#35c26b', fontSize: 13 }}>Inviato ✓</span>}
        </div>
      </div>
    </Modal>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return <div><div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{k}</div><div style={{ fontSize: 13, marginTop: 2 }}>{v}</div></div>
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ background: 'var(--card, #1a1a1e)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 9px', fontSize: 12.5 }}>{children}</span>
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

function TrainerSummary({ athletes }: { athletes: { api_player_id: number; name: string | null }[] }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('fitness_feedback').select('*, fitness_programs(name, program_date, player_id)').then(({ data }) => {
      const byPlayer: Record<number, any> = {}
      ;(data as any[] || []).forEach(f => {
        const pid = f.fitness_programs?.player_id
        if (!pid) return
        const d = f.fitness_programs?.program_date || ''
        if (!byPlayer[pid] || (byPlayer[pid].fitness_programs?.program_date || '') < d) byPlayer[pid] = f
      })
      setRows(Object.values(byPlayer))
      setLoading(false)
    })
  }, [])
  if (loading || rows.length === 0) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={label}>Riepilogo atleti</div>
      <div className="card" style={{ padding: 6 }}>
        <div className="list">
          {rows.map(f => {
            const name = athletes.find(a => a.api_player_id === f.fitness_programs?.player_id)?.name || '—'
            const disc = f.discomfort && f.discomfort !== 'nessuno' ? f.discomfort : ''
            const issue = f.status !== 'completato' || !!disc
            return (
              <div key={f.id} className="row" style={{ alignItems: 'center', borderLeft: issue ? '2px solid #d98236' : '2px solid transparent', paddingLeft: 10 }}>
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

function LibraryPicker({ onClose, onPick }: { onClose: () => void; onPick: (i: FitnessLibraryItem) => void }) {
  const [items, setItems] = useState<FitnessLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [eq, setEq] = useState(''); const [diff, setDiff] = useState('')
  const [cats, setCats] = useState<string[]>([]); const [eqs, setEqs] = useState<string[]>([])
  useEffect(() => {
    supabase.from('fitness_exercise_library').select('*').order('name').then(({ data }) => {
      const d = (data as FitnessLibraryItem[]) || []
      setItems(d)
      setCats([...new Set(d.map(x => x.category).filter(Boolean) as string[])].sort())
      setEqs([...new Set(d.map(x => x.equipment).filter(Boolean) as string[])].sort())
      setLoading(false)
    })
  }, [])
  const filtered = items.filter(x =>
    (!q || x.name.toLowerCase().includes(q.toLowerCase()) || (x.muscle_group || '').toLowerCase().includes(q.toLowerCase())) &&
    (!cat || x.category === cat) && (!eq || x.equipment === eq) && (!diff || x.difficulty === diff)
  ).slice(0, 60)
  return (
    <Modal wide title="Libreria esercizi" onClose={onClose} footer={<button className="btn" onClick={onClose}>Chiudi</button>}>
      <div style={grid(150)}>
        <Input placeholder="Cerca esercizio o muscolo…" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={cat} onChange={e => setCat(e.target.value)}><option value="">Tutte le categorie</option>{cats.map(c => <option key={c}>{c}</option>)}</Select>
        <Select value={eq} onChange={e => setEq(e.target.value)}><option value="">Tutti gli attrezzi</option>{eqs.map(c => <option key={c}>{c}</option>)}</Select>
        <Select value={diff} onChange={e => setDiff(e.target.value)}><option value="">Ogni livello</option><option>Principiante</option><option>Intermedio</option><option>Avanzato</option></Select>
      </div>
      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10, marginTop: 14 }}>
          {filtered.map(x => (
            <button key={x.id} className="card" style={{ padding: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => onPick(x)}>
              {x.image_url && <img src={x.image_url} alt="" loading="lazy" style={{ width: '100%', height: 92, objectFit: 'cover', borderRadius: 8, background: '#fff' }} />}
              <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>{x.name}</div>
              <div className="faint" style={{ fontSize: 11 }}>{x.muscle_group || ''}</div>
            </button>
          ))}
          {filtered.length === 0 && <div className="faint">Nessun esercizio trovato.</div>}
        </div>
      )}
    </Modal>
  )
}

function SchedaPreview({ form, exercises, athleteName }: { form: Partial<FitnessProgram>; exercises: FitnessExercise[]; athleteName: string }) {
  const list = exercises.filter(e => e.name?.trim())
  return (
    <div className="card" style={{ padding: 18, position: 'sticky', top: 8 }}>
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
              ? <img src={e.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', background: '#fff', flex: '0 0 auto' }} />
              : <span style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontWeight: 700 }}>{i + 1}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{e.name}</div>
              <div className="faint" style={{ fontSize: 11.5 }}>{[e.sets != null ? `${e.sets}×${e.reps || ''}` : (e.reps || ''), e.load, e.recovery ? `rec ${e.recovery}` : ''].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>Aggiungi esercizi per vedere l'anteprima.</div>}
      </div>
      {form.note_athlete && <div style={{ marginTop: 12, fontSize: 12.5 }}><b>Nota:</b> {form.note_athlete}</div>}
    </div>
  )
}

/* ========================= PDF (stampa) ========================= */

function downloadPdf(p: ProgramFull, exercises: FitnessExercise[]) {
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c])
  const rows = exercises.map((e, i) => `
    <div class="ex">
      <div class="exh">${i + 1}. ${esc(e.name)} ${e.muscle_group ? `<span class="mg">${esc(e.muscle_group)}</span>` : ''}</div>
      <div class="chips">
        ${e.sets != null ? `<span>${e.sets} serie</span>` : ''}${e.reps ? `<span>${esc(e.reps)} rip</span>` : ''}
        ${e.load ? `<span>carico ${esc(e.load)}</span>` : ''}${e.isometry_time ? `<span>iso ${esc(e.isometry_time)}</span>` : ''}
        ${e.recovery ? `<span>rec ${esc(e.recovery)}</span>` : ''}${e.side ? `<span>${esc(e.side)}</span>` : ''}
      </div>
      ${e.technical_notes ? `<div class="note"><b>Note:</b> ${esc(e.technical_notes)}</div>` : ''}
      ${e.mistakes ? `<div class="note"><b>Da evitare:</b> ${esc(e.mistakes)}</div>` : ''}
    </div>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)}</title>
    <style>
      body{font-family:-apple-system,Arial,sans-serif;color:#111;max-width:720px;margin:24px auto;padding:0 20px}
      h1{font-size:22px;margin:0 0 4px} .sub{color:#666;font-size:13px;margin-bottom:16px}
      .focus{color:#a07c00;font-weight:700;margin:8px 0}
      .ex{border-left:3px solid #F4C430;padding:8px 12px;margin:10px 0;background:#faf8f2;border-radius:6px}
      .exh{font-weight:700} .mg{background:#eee;border-radius:6px;padding:1px 7px;font-size:11px;margin-left:6px}
      .chips span{display:inline-block;background:#fff;border:1px solid #ddd;border-radius:6px;padding:2px 8px;font-size:12px;margin:4px 4px 0 0}
      .note{font-size:12.5px;margin-top:5px} .block{margin:6px 0;font-size:13px}
    </style></head><body>
    <h1>${esc(p.name)}</h1>
    <div class="sub">${p.program_date ? esc(fmtDate(p.program_date)) : ''}${p.start_time ? ' · ' + esc(p.start_time.slice(0, 5)) : ''}${p.duration_min ? ' · ' + p.duration_min + ' min' : ''}${p.intensity ? ' · intensità ' + esc(p.intensity) : ''}</div>
    ${p.focus ? `<div class="focus">${esc(p.focus)}</div>` : ''}${p.objective ? `<div class="block">${esc(p.objective)}</div>` : ''}
    ${p.warmup ? `<div class="block"><b>Riscaldamento:</b> ${esc(p.warmup)}</div>` : ''}
    <h3>Esercizi</h3>${rows}
    ${p.recovery_between_sets ? `<div class="block"><b>Recupero tra serie:</b> ${esc(p.recovery_between_sets)}</div>` : ''}
    ${p.cooldown ? `<div class="block"><b>Defaticamento:</b> ${esc(p.cooldown)}</div>` : ''}
    ${p.note_athlete ? `<div class="block"><b>Nota preparatore:</b> ${esc(p.note_athlete)}</div>` : ''}
    </body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => w.print(), 400)
}
