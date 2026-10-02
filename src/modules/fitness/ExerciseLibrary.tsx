import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { Modal, Field, Input, Textarea, Select, Tabs, Empty, Spinner, Badge } from '../../components/ui'
import Icon from '../../components/Icon'
import { toast } from '../../lib/toast'
import type { FitnessLibraryItem } from '../../lib/types'

/* =====================================================================
   AUVI Exercise Library
   - mode="browse": pagina della libreria (preparatore / admin / creator)
   - mode="pick":   dentro una Modal, restituisce l'esercizio scelto con onPick
   Tutte le ricerche sono lato server, 24 per pagina ("Carica altri").
   ===================================================================== */

export const EX_CATEGORIES = ['Forza', 'Potenza', 'Pliometria', 'Velocità e agilità', 'Prevenzione', 'Core', 'Parte superiore', 'Mobilità e attivazione', 'Recupero']
export const EX_DIFFICULTIES = ['Principiante', 'Intermedio', 'Avanzato']
export const EX_LATERALITY: [string, string][] = [['bilaterale', 'Bilaterale'], ['unilaterale', 'Unilaterale'], ['alternato', 'Alternato']]
// Valori di riserva per i filtri finché il seed non ha popolato la libreria curata:
// appena ci sono esercizi curati, le opzioni si leggono dai dati veri.
const FALLBACK = {
  muscles: ['Quadricipiti', 'Femorali', 'Glutei', 'Adduttori', 'Polpacci', 'Flessori dell\'anca', 'Addominali', 'Obliqui', 'Lombari', 'Petto', 'Dorsali', 'Spalle', 'Bicipiti', 'Tricipiti', 'Trapezio'],
  equipment: ['Corpo libero', 'Manubri', 'Bilanciere', 'Kettlebell', 'Elastici', 'Cavi', 'Macchina', 'Palla medica', 'Box', 'Ostacoli', 'Coni', 'Scaletta', 'TRX', 'Fitball', 'Slitta'],
  goals: ['Forza', 'Potenza', 'Velocità', 'Accelerazione', 'Cambio di direzione', 'Resistenza', 'Prevenzione infortuni', 'Mobilità', 'Stabilità', 'Recupero'],
  positions: ['Portiere', 'Difensore centrale', 'Terzino', 'Centrocampista', 'Esterno', 'Attaccante'],
}

const PAGE = 24
const LIST_COLS = 'id,slug,name,name_it,category,primary_muscles,equipment_tags,difficulty,image_url,image_3d_url,video_url,gif_url,source,is_custom,laterality,performance_goals,position_relevance'
const MAX_UPLOAD = 80 * 1024 * 1024
const BUCKET = 'exercise-images'

/* ---------- immagini ---------- */

/** URL ridimensionato con la trasformazione immagini di Supabase (le PNG AUVI pesano ~5 MB).
 *  Gli URL esterni restano com'erano; i vecchi raw.githubusercontent non si usano mai. */
export function exThumb(url: string | null | undefined, width = 480): string | null {
  if (!url) return null
  if (url.includes('raw.githubusercontent.com')) return null
  if (url.includes('/storage/v1/object/public/')) {
    const sep = url.includes('?') ? '&' : '?'
    return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + `${sep}width=${width}&quality=70&resize=contain`
  }
  return url
}
const cleanUrl = (url?: string | null) => (url && !url.includes('raw.githubusercontent.com') ? url : null)
/** immagine da mostrare: prima la 3D AUVI, poi la foto, altrimenti niente (segnaposto) */
export const exImage = (x: Pick<FitnessLibraryItem, 'image_3d_url' | 'image_url'>) => cleanUrl(x.image_3d_url) || cleanUrl(x.image_url)
export const exName = (x: Pick<FitnessLibraryItem, 'name' | 'name_it'>) => x.name_it || x.name

/** Immagine con fallback: miniatura trasformata → originale → segnaposto. Mai un'immagine rotta. */
export function ExMedia({ url, width = 480, category, name, className }: { url: string | null | undefined; width?: number; category?: string | null; name?: string; className?: string }) {
  const original = cleanUrl(url)
  const thumb = exThumb(original, width)
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  useEffect(() => { setStage(0) }, [url])
  const src = stage === 0 ? thumb : stage === 1 ? original : null
  if (!src) return (
    <div className={`exl-ph ${className || ''}`}>
      <Icon name="dumbbell" size={26} />
      {category && <span className="exl-ph-cat">{category}</span>}
      {name && <span className="exl-ph-name">{name}</span>}
    </div>
  )
  return <img className={className} src={src} alt={name || ''} loading="lazy" decoding="async"
    onError={() => setStage(s => (s === 0 && original && original !== thumb ? 1 : 2))} />
}

/* ---------- caricamento file con avanzamento ---------- */

async function uploadWithProgress(file: File, uid: string, onProgress: (p: number) => void): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessione scaduta: rientra e riprova.')
  const dot = file.name.lastIndexOf('.')
  const ext = (dot > 0 ? file.name.slice(dot + 1) : (file.type.split('/')[1] || 'bin')).toLowerCase().replace(/[^a-z0-9]/g, '')
  const base = (dot > 0 ? file.name.slice(0, dot) : file.name).normalize('NFD').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'file'
  const path = `custom/${uid}/${Date.now()}-${base}.${ext}`
  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`
  await new Promise<void>((ok, no) => {
    const x = new XMLHttpRequest()
    x.open('POST', url)
    x.setRequestHeader('Authorization', `Bearer ${token}`)
    x.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY as string)
    x.setRequestHeader('x-upsert', 'false')
    x.setRequestHeader('cache-control', 'max-age=3600')
    x.setRequestHeader('content-type', file.type || 'application/octet-stream')
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return ok()
      let msg = `Caricamento non riuscito (${x.status})`
      try { const j = JSON.parse(x.responseText); if (j?.message) msg = j.message } catch { /* testo non JSON */ }
      if (x.status === 413) msg = 'File troppo grande per lo storage.'
      no(new Error(msg))
    }
    x.onerror = () => no(new Error('Connessione assente: riprova.'))
    x.send(file)
  })
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/* ---------- utilità ---------- */

const esc = (q: string) => q.replace(/[%,()*\\:".]/g, ' ').replace(/\s+/g, ' ').trim()
const arr = (v?: string[] | null) => (v || []).filter(Boolean)
const lateralityLabel = (v?: string | null) => EX_LATERALITY.find(([k]) => k === v)?.[1] || v || ''
const isAuvi = (x: Pick<FitnessLibraryItem, 'source' | 'is_custom'>) => x.is_custom || x.source === 'custom' ? 'CUSTOM' : x.source === 'auvi' ? 'AUVI' : null

function Dots({ level }: { level?: string | null }) {
  const n = level ? EX_DIFFICULTIES.indexOf(level) + 1 : 0
  if (!n) return null
  return (
    <span className="exl-dots" title={level || ''} aria-label={`Difficoltà: ${level}`}>
      {[1, 2, 3].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  )
}

type Filters = { category: string; muscle: string; equipment: string; difficulty: string; goal: string; position: string; laterality: string }
const NO_FILTERS: Filters = { category: '', muscle: '', equipment: '', difficulty: '', goal: '', position: '', laterality: '' }
const FILTER_LABEL: Record<keyof Filters, string> = { category: 'Categoria', muscle: 'Muscolo', equipment: 'Attrezzo', difficulty: 'Livello', goal: 'Obiettivo', position: 'Ruolo', laterality: 'Lateralità' }
type Origin = 'all' | 'auvi' | 'open'

/* =====================================================================
   COMPONENTE PRINCIPALE
   ===================================================================== */

export default function ExerciseLibrary({ mode = 'browse', onPick }: { mode?: 'browse' | 'pick'; onPick?: (item: FitnessLibraryItem) => void }) {
  const { session, role } = useAuth()
  const uid = session?.user.id || null
  const isTeam = role === 'admin' || role === 'creator'

  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [origin, setOrigin] = useState<Origin>('all')
  const [full, setFull] = useState(false)
  const [items, setItems] = useState<FitnessLibraryItem[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [fullCount, setFullCount] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [detail, setDetail] = useState<FitnessLibraryItem | null>(null)
  const [editing, setEditing] = useState<FitnessLibraryItem | 'new' | null>(null)
  const [facets, setFacets] = useState(FALLBACK)
  const [reloadKey, setReloadKey] = useState(0)
  const reqId = useRef(0)

  // ricerca con debounce 300 ms
  useEffect(() => { const t = setTimeout(() => setDq(esc(q)), 300); return () => clearTimeout(t) }, [q])

  // conteggio catalogo completo + opzioni dei filtri (solo le colonne array degli esercizi curati)
  useEffect(() => {
    supabase.from('fitness_exercise_library').select('id', { count: 'exact', head: true }).eq('archived', false)
      .then(({ count }) => setFullCount(count ?? null))
    supabase.from('fitness_exercise_library').select('primary_muscles,equipment_tags,performance_goals,position_relevance')
      .eq('archived', false).eq('curated', true).limit(1000)
      .then(({ data }) => {
        const rows = (data as Partial<FitnessLibraryItem>[]) || []
        if (!rows.length) return
        const uniq = (k: keyof FitnessLibraryItem, fb: string[]) => {
          const s = [...new Set(rows.flatMap(r => arr(r[k] as string[] | null)))].sort((a, b) => a.localeCompare(b, 'it'))
          return s.length ? s : fb
        }
        setFacets({
          muscles: uniq('primary_muscles', FALLBACK.muscles), equipment: uniq('equipment_tags', FALLBACK.equipment),
          goals: uniq('performance_goals', FALLBACK.goals), positions: uniq('position_relevance', FALLBACK.positions),
        })
      })
  }, [reloadKey])

  async function fetchPage(p: number) {
    const id = ++reqId.current
    if (p === 0) setLoading(true); else setLoadingMore(true)
    setError('')
    let query = supabase.from('fitness_exercise_library').select(LIST_COLS, { count: 'exact' }).eq('archived', false)
    if (!full) query = query.eq('curated', true)
    if (filters.category) query = query.eq('category', filters.category)
    if (filters.muscle) query = query.contains('primary_muscles', [filters.muscle])
    if (filters.equipment) query = query.contains('equipment_tags', [filters.equipment])
    if (filters.difficulty) query = query.eq('difficulty', filters.difficulty)
    if (filters.goal) query = query.contains('performance_goals', [filters.goal])
    if (filters.position) query = query.contains('position_relevance', [filters.position])
    if (filters.laterality) query = query.eq('laterality', filters.laterality)
    // più gruppi "or" si combinano in un unico albero and(or(..),or(..))
    const ors: string[] = []
    if (dq) ors.push(`name.ilike.%${dq}%,name_it.ilike.%${dq}%`)
    if (origin === 'auvi') ors.push('source.in.(auvi,custom),is_custom.is.true')
    if (origin === 'open') { query = query.eq('is_custom', false); ors.push('source.is.null,source.eq.free-exercise-db') }
    if (ors.length === 1) query = query.or(ors[0])
    else if (ors.length > 1) query = query.or(`and(${ors.map(o => `or(${o})`).join(',')})`)
    const { data, count, error } = await query
      .order('name_it', { ascending: true, nullsFirst: false }).order('name', { ascending: true })
      .range(p * PAGE, p * PAGE + PAGE - 1)
    if (id !== reqId.current) return // risposta vecchia: la ricerca è cambiata nel frattempo
    if (error) setError(error.message)
    else {
      const rows = (data as unknown as FitnessLibraryItem[]) || []
      setItems(prev => (p === 0 ? rows : [...prev, ...rows]))
      setCount(count ?? null)
      setPage(p)
    }
    setLoading(false); setLoadingMore(false)
  }
  useEffect(() => { fetchPage(0) }, [dq, filters, origin, full, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = (Object.keys(filters) as (keyof Filters)[]).filter(k => filters[k])
  const extraFilterCount = activeFilters.filter(k => k !== 'category').length
  const anyActive = activeFilters.length > 0 || !!q || origin !== 'all'
  const resetAll = () => { setFilters(NO_FILTERS); setQ(''); setDq(''); setOrigin('all') }
  const filterValueLabel = (k: keyof Filters, v: string) => (k === 'laterality' ? lateralityLabel(v) : v)

  async function openDetail(x: FitnessLibraryItem) {
    setDetail(x) // mostra subito i dati della card, poi completa con la scheda intera
    const { data } = await supabase.from('fitness_exercise_library').select('*').eq('id', x.id).maybeSingle()
    if (data) setDetail(cur => (cur && cur.id === x.id ? (data as FitnessLibraryItem) : cur))
  }

  const canEdit = (x: FitnessLibraryItem) => isTeam || (!!x.is_custom && !!uid && x.created_by === uid)

  async function remove(x: FitnessLibraryItem) {
    if (!confirm(`Eliminare "${exName(x)}" dalla libreria? Le schede già create restano invariate.`)) return
    const { error } = await supabase.from('fitness_exercise_library').delete().eq('id', x.id)
    if (error) { toast(error.message, 'err'); return }
    toast('Esercizio eliminato')
    setDetail(null); setReloadKey(k => k + 1)
  }

  const loaded = items.length
  const hasMore = count != null && loaded < count

  return (
    <div className={`exl ${mode === 'pick' ? 'exl-pickwrap' : ''}`}>
      <style>{EXL_CSS}</style>

      {/* Testata */}
      <div className="exl-head">
        {mode === 'browse' ? (
          <div>
            <h1 className="exl-title">Libreria esercizi</h1>
            <div className="faint exl-sub">
              {count != null ? `${count} ${count === 1 ? 'esercizio' : 'esercizi'}` : '—'}{!full ? ' · selezione AUVI per il calcio' : ' · catalogo completo'}
            </div>
          </div>
        ) : (
          <div className="faint exl-sub">
            {count != null ? `${count} ${count === 1 ? 'esercizio' : 'esercizi'}` : ''}{!full ? ' · selezione AUVI' : ' · catalogo completo'} · tocca un esercizio per vederlo e aggiungerlo
          </div>
        )}
        <button className={mode === 'browse' ? 'btn btn-primary' : 'btn btn-sm'} onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> Crea esercizio personalizzato
        </button>
      </div>

      {/* Ricerca + barra filtri */}
      <div className="exl-bar">
        <div className="exl-search">
          <Input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca esercizio (italiano o inglese)…" aria-label="Cerca esercizio" />
          {q && <button className="exl-search-x" onClick={() => setQ('')} aria-label="Svuota ricerca"><Icon name="x" size={14} /></button>}
        </div>
        <button className={`btn ${extraFilterCount ? 'exl-btn-on' : ''}`} onClick={() => setShowFilters(true)}>
          <Icon name="sliders" size={14} /> Filtri{extraFilterCount ? ` · ${extraFilterCount}` : ''}
        </button>
      </div>

      <div className="exl-bar2">
        <Tabs<Origin> value={origin} onChange={setOrigin} tabs={[
          { key: 'all', label: 'Tutti' }, { key: 'auvi', label: 'AUVI / Custom' }, { key: 'open', label: 'Open source' },
        ]} />
        <label className={`exl-toggle ${full ? 'on' : ''}`}>
          <input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} />
          <span className="exl-switch" aria-hidden />
          Catalogo completo{fullCount != null ? ` (${fullCount})` : ''}
        </label>
      </div>

      <div className="exl-cats" role="group" aria-label="Categoria">
        <button className={`exl-chip ${!filters.category ? 'active' : ''}`} onClick={() => setFilters({ ...filters, category: '' })}>Tutte</button>
        {EX_CATEGORIES.map(c => (
          <button key={c} className={`exl-chip ${filters.category === c ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, category: filters.category === c ? '' : c })}>{c}</button>
        ))}
      </div>

      {(activeFilters.some(k => k !== 'category') || anyActive) && (
        <div className="exl-active">
          {activeFilters.filter(k => k !== 'category').map(k => (
            <button key={k} className="exl-chip exl-chip-rm" onClick={() => setFilters({ ...filters, [k]: '' })}>
              <span className="faint">{FILTER_LABEL[k]}:</span> {filterValueLabel(k, filters[k])} <Icon name="x" size={12} />
            </button>
          ))}
          {anyActive && <button className="btn btn-ghost btn-sm" onClick={resetAll}>Azzera</button>}
        </div>
      )}

      {/* Griglia */}
      {loading ? <Spinner /> : error ? (
        <Empty icon={<Icon name="dumbbell" size={22} />} title="Non riesco a caricare la libreria" hint={error} action={{ label: 'Riprova', onClick: () => fetchPage(0) }} />
      ) : items.length === 0 ? (
        !full && !anyActive
          ? <Empty icon={<Icon name="dumbbell" size={22} />} title="La selezione AUVI è in preparazione"
              hint="Nel frattempo puoi cercare nel catalogo completo o creare un esercizio personalizzato."
              action={{ label: `Mostra catalogo completo${fullCount != null ? ` (${fullCount})` : ''}`, onClick: () => setFull(true) }} />
          : <Empty icon={<Icon name="dumbbell" size={22} />} title="Nessun esercizio con questi filtri"
              hint={!full ? 'Prova ad allargare la ricerca al catalogo completo.' : 'Prova a togliere qualche filtro.'}
              action={!full ? { label: 'Cerca nel catalogo completo', onClick: () => setFull(true) } : { label: 'Azzera filtri', onClick: resetAll }} />
      ) : (
        <>
          <div className="exl-grid">
            {items.map(x => {
              const tag = isAuvi(x)
              const muscles = arr(x.primary_muscles)
              const eq = arr(x.equipment_tags)
              return (
                <button key={x.id} className="exl-card" onClick={() => openDetail(x)}>
                  <div className="exl-card-media">
                    <ExMedia url={exImage(x)} category={x.category} />
                    {tag && <span className={`exl-tag ${tag === 'AUVI' ? 'auvi' : ''}`}>{tag}</span>}
                    {x.video_url && <span className="exl-vid" title="Video disponibile">VIDEO</span>}
                  </div>
                  <div className="exl-card-body">
                    <div className="exl-card-name">{exName(x)}</div>
                    {x.name_it && x.name_it !== x.name && <div className="exl-card-en">{x.name}</div>}
                    <div className="exl-card-meta">
                      {x.category && <span className="exl-cat">{x.category}</span>}
                      <Dots level={x.difficulty} />
                    </div>
                    {(muscles.length > 0 || eq.length > 0) && (
                      <div className="exl-card-line">
                        {muscles[0] && <span>{muscles[0]}</span>}
                        {muscles[0] && eq[0] && <span className="exl-sep">·</span>}
                        {eq[0] && <span>{eq[0]}</span>}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="exl-more">
            <span className="faint">{loaded} di {count ?? loaded}</span>
            {hasMore && <button className="btn" onClick={() => fetchPage(page + 1)} disabled={loadingMore}>{loadingMore ? 'Carico…' : 'Carica altri'}</button>}
          </div>
        </>
      )}

      {showFilters && (
        <FiltersSheet value={filters} facets={facets} onClose={() => setShowFilters(false)}
          onApply={f => { setFilters(f); setShowFilters(false) }} />
      )}

      {detail && (
        <ExerciseDetail item={detail} onClose={() => setDetail(null)}
          onPick={mode === 'pick' && onPick ? () => { const d = detail; setDetail(null); onPick(d) } : undefined}
          onEdit={canEdit(detail) && 'updated_at' in detail ? () => setEditing(detail) : undefined}
          onDelete={canEdit(detail) ? () => remove(detail) : undefined}
          ownerIsMe={!!uid && detail.created_by === uid} />
      )}

      {editing && (
        <ExerciseForm initial={editing === 'new' ? null : editing} facets={facets} uid={uid}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            setEditing(null); setReloadKey(k => k + 1)
            if (detail && detail.id === saved.id) setDetail(saved)
            // un esercizio appena creato è subito utilizzabile nella sessione
            if (editing === 'new' && mode === 'pick' && onPick) onPick(saved)
            else if (editing === 'new') setDetail(saved)
          }} />
      )}
    </div>
  )
}

/* ---------- Filtri (foglio) ---------- */

function FiltersSheet({ value, facets, onClose, onApply }: { value: Filters; facets: typeof FALLBACK; onClose: () => void; onApply: (f: Filters) => void }) {
  const [f, setF] = useState<Filters>(value)
  const sel = (k: keyof Filters, label: string, options: (string | [string, string])[]) => (
    <Field label={label}>
      <Select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}>
        <option value="">Tutti</option>
        {options.map(o => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
        {f[k] && !options.some(o => (Array.isArray(o) ? o[0] : o) === f[k]) && <option value={f[k]}>{f[k]}</option>}
      </Select>
    </Field>
  )
  return (
    <Modal title="Filtri" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={() => setF({ ...NO_FILTERS, category: f.category })}>Azzera</button>
        <button className="btn btn-primary" onClick={() => onApply(f)}>Mostra risultati</button>
      </>}>
      <div className="exl-fgrid">
        {sel('category', 'Categoria', EX_CATEGORIES)}
        {sel('muscle', 'Muscolo principale', facets.muscles)}
        {sel('equipment', 'Attrezzo', facets.equipment)}
        {sel('difficulty', 'Livello', EX_DIFFICULTIES)}
        {sel('goal', 'Obiettivo di performance', facets.goals)}
        {sel('position', 'Ruolo', facets.positions)}
        {sel('laterality', 'Lateralità', EX_LATERALITY)}
      </div>
    </Modal>
  )
}

/* ---------- Scheda esercizio ---------- */

export function ExerciseDetail({ item: x, onClose, onPick, onEdit, onDelete, ownerIsMe, pickLabel = 'Aggiungi alla sessione' }: {
  item: FitnessLibraryItem; onClose: () => void
  onPick?: () => void; onEdit?: () => void; onDelete?: () => void; ownerIsMe?: boolean; pickLabel?: string
}) {
  const img = exImage(x)
  const tag = isAuvi(x)
  const primary = arr(x.primary_muscles), secondary = arr(x.secondary_muscles), eq = arr(x.equipment_tags)
  const steps = arr(x.instructions), cues = arr(x.coaching_cues), mistakes = arr(x.common_mistakes)
  const goals = arr(x.performance_goals), positions = arr(x.position_relevance)
  const sourceLine = x.is_custom || x.source === 'custom'
    ? (ownerIsMe ? 'Custom · creato da te' : 'Custom')
    : x.source === 'auvi' ? 'AUVI'
    : x.source === 'free-exercise-db' || !x.source ? `Free Exercise DB · ${x.source_license || 'Unlicense'}`
    : [x.source, x.source_license].filter(Boolean).join(' · ')
  const hasFooter = !!(onPick || onEdit || onDelete)
  return (
    <Modal wide title={exName(x)} onClose={onClose}
      footer={hasFooter ? <>
        {onDelete && <button className="btn btn-danger" onClick={onDelete}><Icon name="trash" size={14} /> Elimina</button>}
        {onEdit && <button className="btn" onClick={onEdit}><Icon name="edit" size={14} /> Modifica</button>}
        {onPick && <button className="btn btn-primary" onClick={onPick}><Icon name="plus" size={14} /> {pickLabel}</button>}
      </> : undefined}>
      <style>{EXL_CSS}</style>
      <div className="exl-detail">
        <div className="exl-d-media">
          {x.video_url
            ? <video src={x.video_url} controls playsInline preload="metadata" poster={exThumb(img, 1000) || undefined} />
            : cleanUrl(x.gif_url)
              ? <img src={cleanUrl(x.gif_url)!} alt={exName(x)} loading="lazy" decoding="async" />
              : <ExMedia url={img} width={1000} category={x.category} name={exName(x)} />}
        </div>

        <div className="exl-d-head">
          <div>
            <div className="exl-d-name">{exName(x)}</div>
            {x.name_it && x.name_it !== x.name && <div className="faint exl-d-en">{x.name}</div>}
          </div>
          {tag && <span className={`exl-tag static ${tag === 'AUVI' ? 'auvi' : ''}`}>{tag}</span>}
        </div>

        <div className="exl-d-chips">
          {x.category && <Badge tone="accent">{x.category}</Badge>}
          {x.subcategory && <Badge>{x.subcategory}</Badge>}
          {x.difficulty && <span className="exl-d-diff"><Dots level={x.difficulty} /> {x.difficulty}</span>}
          {x.laterality && <Badge>{lateralityLabel(x.laterality)}</Badge>}
        </div>

        <div className="exl-d-facts">
          {primary.length > 0 && <Fact k="Muscoli principali" v={primary.join(', ')} />}
          {secondary.length > 0 && <Fact k="Muscoli secondari" v={secondary.join(', ')} />}
          {eq.length > 0 && <Fact k="Attrezzatura" v={eq.join(', ')} />}
          {!primary.length && x.muscle_group && <Fact k="Gruppo muscolare" v={x.muscle_group} />}
          {!eq.length && x.equipment && <Fact k="Attrezzatura" v={x.equipment} />}
          {x.football_relevance != null && x.football_relevance > 0 && (
            <div>
              <div className="exl-k">Rilevanza per il calcio</div>
              <div className="exl-bars" aria-label={`Rilevanza ${x.football_relevance} su 3`}>
                {[1, 2, 3].map(i => <i key={i} className={i <= (x.football_relevance || 0) ? 'on' : ''} />)}
                <span className="faint">{['', 'Bassa', 'Media', 'Alta'][x.football_relevance] || ''}</span>
              </div>
            </div>
          )}
        </div>

        {x.description && <p className="exl-d-desc">{x.description}</p>}

        {steps.length > 0 && <Section title="Come si esegue"><ol className="exl-ol">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol></Section>}
        {cues.length > 0 && <Section title="Indicazioni tecniche"><ul className="exl-ul">{cues.map((s, i) => <li key={i}>{s}</li>)}</ul></Section>}
        {mistakes.length > 0 && <Section title="Errori comuni"><ul className="exl-ul exl-ul-warn">{mistakes.map((s, i) => <li key={i}>{s}</li>)}</ul></Section>}
        {goals.length > 0 && <Section title="Obiettivi di performance"><div className="exl-d-chips">{goals.map(g => <span key={g} className="exl-chip static">{g}</span>)}</div></Section>}
        {positions.length > 0 && <Section title="Ruoli"><div className="exl-d-chips">{positions.map(g => <span key={g} className="exl-chip static">{g}</span>)}</div></Section>}

        <div className="exl-d-source faint">Fonte: {sourceLine}</div>
      </div>
    </Modal>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div><div className="exl-k">{k}</div><div className="exl-v">{v}</div></div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="exl-sec"><div className="exl-sec-t">{title}</div>{children}</div>
}

/* ---------- Crea / modifica esercizio personalizzato ---------- */

function MultiChips({ value, onChange, options, placeholder }: { value: string[]; onChange: (v: string[]) => void; options: string[]; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
    if (!parts.length) return
    onChange([...new Set([...value, ...parts])]); setDraft('')
  }
  const suggestions = options.filter(o => !value.includes(o))
  return (
    <div>
      {value.length > 0 && (
        <div className="exl-d-chips" style={{ marginBottom: 8 }}>
          {value.map(v => (
            <button type="button" key={v} className="exl-chip exl-chip-rm active" onClick={() => onChange(value.filter(x => x !== v))}>
              {v} <Icon name="x" size={12} />
            </button>
          ))}
        </div>
      )}
      <Input value={draft} placeholder={placeholder}
        onChange={e => { const v = e.target.value; if (v.includes(',')) add(v); else setDraft(v) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }}
        onBlur={() => add(draft)} />
      {suggestions.length > 0 && (
        <div className="exl-sugg">
          {suggestions.slice(0, 16).map(o => <button type="button" key={o} className="exl-chip" onClick={() => onChange([...value, o])}>{o}</button>)}
        </div>
      )}
    </div>
  )
}

function UploadField({ label, accept, kind, url, onUrl, uid }: { label: string; accept: string; kind: 'image' | 'video'; url: string; onUrl: (u: string) => void; uid: string | null }) {
  const [progress, setProgress] = useState<number | null>(null)
  async function onFile(file: File) {
    if (!uid) { toast('Sessione non valida: rientra e riprova.', 'err'); return }
    if (file.size > MAX_UPLOAD) { toast(`File troppo grande (${Math.round(file.size / 1048576)} MB): massimo 80 MB.`, 'err'); return }
    const okType = kind === 'image' ? file.type.startsWith('image/') : ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)
    if (!okType) { toast(kind === 'image' ? 'Serve un\'immagine.' : 'Formati video accettati: MP4, WebM, MOV.', 'err'); return }
    setProgress(0)
    try { onUrl(await uploadWithProgress(file, uid, setProgress)); toast(kind === 'image' ? 'Immagine caricata' : 'Video caricato') }
    catch (e) { toast((e as Error).message, 'err') }
    finally { setProgress(null) }
  }
  const busy = progress !== null
  return (
    <Field label={label}>
      <div className="exl-up">
        <div className="exl-up-prev">
          {url
            ? kind === 'image' ? <ExMedia url={url} width={240} /> : <video src={url} preload="metadata" muted playsInline />
            : <Icon name={kind === 'image' ? 'image' : 'file'} size={20} />}
        </div>
        <div className="exl-up-main">
          <label className={`btn btn-sm ${busy ? 'exl-disabled' : ''}`} aria-disabled={busy}>
            <Icon name="upload" size={12} /> {busy ? `Carico… ${Math.round((progress || 0) * 100)}%` : url ? 'Sostituisci' : 'Carica'}
            <input type="file" accept={accept} hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
          </label>
          {url && !busy && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUrl('')}>Rimuovi</button>}
          {busy && <div className="exl-prog"><i style={{ width: `${Math.round((progress || 0) * 100)}%` }} /></div>}
          {!busy && <div className="faint exl-up-hint">{kind === 'image' ? 'JPG, PNG o WebP' : 'MP4, WebM o MOV · max 80 MB'}</div>}
        </div>
      </div>
    </Field>
  )
}

function ExerciseForm({ initial, facets, uid, onClose, onSaved }: {
  initial: FitnessLibraryItem | null; facets: typeof FALLBACK; uid: string | null; onClose: () => void; onSaved: (x: FitnessLibraryItem) => void
}) {
  const [f, setF] = useState({
    name: initial?.name || '', name_it: initial?.name_it || '', category: initial?.category || '',
    description: initial?.description || '', instructions: arr(initial?.instructions).join('\n'),
    equipment_tags: arr(initial?.equipment_tags), primary_muscles: arr(initial?.primary_muscles),
    performance_goals: arr(initial?.performance_goals),
    image_url: initial?.image_url || '', video_url: initial?.video_url || '',
    difficulty: initial?.difficulty || '', laterality: initial?.laterality || '',
  })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }))
  const goalOptions = useMemo(() => facets.goals, [facets])

  async function save() {
    const nameIt = f.name_it.trim(), name = f.name.trim() || nameIt
    if (!name) { toast('Dai un nome all\'esercizio.', 'err'); return }
    if (!uid) { toast('Sessione non valida: rientra e riprova.', 'err'); return }
    setBusy(true)
    const payload = {
      name, name_it: nameIt || null, category: f.category || null, description: f.description.trim() || null,
      instructions: f.instructions.split('\n').map(s => s.trim()).filter(Boolean),
      equipment_tags: f.equipment_tags, primary_muscles: f.primary_muscles, performance_goals: f.performance_goals,
      muscle_group: f.primary_muscles.join(', ') || null, equipment: f.equipment_tags.join(', ') || null,
      image_url: f.image_url || null, video_url: f.video_url || null,
      difficulty: f.difficulty || null, laterality: f.laterality || null,
    }
    const res = initial
      ? await supabase.from('fitness_exercise_library').update(payload).eq('id', initial.id).select('*').single()
      : await supabase.from('fitness_exercise_library').insert({
          ...payload, is_custom: true, source: 'custom', source_license: 'AUVI', curated: true, archived: false,
          created_by: uid, slug: `custom:${crypto.randomUUID()}`,
        }).select('*').single()
    setBusy(false)
    if (res.error) { toast(res.error.message, 'err'); return }
    toast(initial ? 'Esercizio aggiornato' : 'Esercizio creato')
    onSaved(res.data as FitnessLibraryItem)
  }

  return (
    <Modal wide title={initial ? 'Modifica esercizio' : 'Nuovo esercizio personalizzato'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Salvo…' : initial ? 'Salva modifiche' : 'Crea esercizio'}</button>
      </>}>
      <style>{EXL_CSS}</style>
      <div className="exl-fgrid">
        <Field label="Nome (italiano)"><Input value={f.name_it} onChange={e => set('name_it', e.target.value)} placeholder="Es. Affondo bulgaro" /></Field>
        <Field label="Nome originale / inglese (facoltativo)"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Es. Bulgarian split squat" /></Field>
        <Field label="Categoria">
          <Select value={f.category} onChange={e => set('category', e.target.value)}>
            <option value="">Scegli…</option>{EX_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Livello">
          <Select value={f.difficulty} onChange={e => set('difficulty', e.target.value)}>
            <option value="">—</option>{EX_DIFFICULTIES.map(c => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Lateralità">
          <Select value={f.laterality} onChange={e => set('laterality', e.target.value)}>
            <option value="">—</option>{EX_LATERALITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Descrizione"><Textarea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <Field label="Esecuzione (un passaggio per riga)">
        <Textarea rows={4} value={f.instructions} onChange={e => set('instructions', e.target.value)} placeholder={'Piede posteriore su panca\nScendi controllando il ginocchio\nSpingi col tallone anteriore'} />
      </Field>
      <Field label="Muscoli principali"><MultiChips value={f.primary_muscles} onChange={v => set('primary_muscles', v)} options={facets.muscles} placeholder="Scrivi e premi Invio, o separa con la virgola" /></Field>
      <Field label="Attrezzatura"><MultiChips value={f.equipment_tags} onChange={v => set('equipment_tags', v)} options={facets.equipment} placeholder="Es. Manubri, Panca" /></Field>
      <Field label="Obiettivi di performance">
        <div className="exl-d-chips">
          {[...new Set([...goalOptions, ...f.performance_goals])].map(g => {
            const on = f.performance_goals.includes(g)
            return <button type="button" key={g} className={`exl-chip ${on ? 'active' : ''}`}
              onClick={() => set('performance_goals', on ? f.performance_goals.filter(x => x !== g) : [...f.performance_goals, g])}>
              {on && <Icon name="check" size={12} />} {g}
            </button>
          })}
        </div>
      </Field>
      <div className="exl-fgrid">
        <UploadField label="Immagine" kind="image" accept="image/*" url={f.image_url} onUrl={u => set('image_url', u)} uid={uid} />
        <UploadField label="Video" kind="video" accept="video/mp4,video/webm,video/quicktime" url={f.video_url} onUrl={u => set('video_url', u)} uid={uid} />
      </div>
    </Modal>
  )
}

/* ---------- stile (prefisso exl-) ---------- */

const EXL_CSS = `
.exl { max-width: 1180px; }
.exl-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.exl-title { font-family: var(--font-display); font-stretch: 125%; text-transform: uppercase; font-size: 22px; font-weight: 800; letter-spacing: -.2px; line-height: 1.1; }
.exl-sub { font-size: 12.5px; margin-top: 4px; }
.exl-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.exl-search { position: relative; flex: 1; min-width: 0; }
.exl-search .input { width: 100%; padding-right: 38px; }
.exl-search-x { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: var(--text-faint); }
.exl-search-x:hover { background: var(--surface-2); color: var(--text); }
.exl-btn-on { border-color: var(--ink); font-weight: 700; }
.exl-bar2 { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
.exl-toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--text-dim); cursor: pointer; user-select: none; min-height: 36px; }
.exl-toggle input { position: absolute; opacity: 0; pointer-events: none; }
.exl-switch { width: 34px; height: 20px; border-radius: 999px; background: var(--border-2); position: relative; transition: background .15s; flex: 0 0 auto; }
.exl-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--surface); box-shadow: var(--shadow-sm); transition: transform .15s; }
.exl-toggle.on { color: var(--text); }
.exl-toggle.on .exl-switch { background: var(--yellow); box-shadow: inset 0 0 0 1px var(--ink); }
.exl-toggle.on .exl-switch::after { transform: translateX(14px); }
.exl-toggle input:focus-visible + .exl-switch { outline: 2px solid var(--ink); outline-offset: 2px; }
.exl-cats { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; margin-bottom: 10px; }
.exl-cats::-webkit-scrollbar { display: none; }
.exl-chip { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 12.5px; font-weight: 600; border-radius: 999px; padding: 6px 12px; min-height: 34px; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); transition: background .15s, color .15s, border-color .15s; }
.exl-chip:hover { color: var(--text); border-color: var(--border-2); }
.exl-chip.active { background: var(--yellow); border-color: var(--yellow); color: var(--ink); }
.exl-chip.static { cursor: default; min-height: 28px; padding: 4px 10px; background: var(--surface-2); }
.exl-chip-rm { background: var(--surface-2); color: var(--text); }
.exl-active { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.exl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 640px) { .exl-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } }
@media (min-width: 1100px) { .exl:not(.exl-pickwrap) .exl-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.exl-card { display: flex; flex-direction: column; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; transition: border-color .15s, box-shadow .15s, transform .15s; min-width: 0; }
.exl-card:hover { border-color: var(--border-2); box-shadow: var(--shadow); }
.exl-card:active { transform: scale(.99); }
.exl-card:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.exl-card-media { position: relative; aspect-ratio: 4 / 3; background: var(--bg-2); overflow: hidden; }
.exl-card-media img { width: 100%; height: 100%; object-fit: contain; display: block; background: var(--surface); }
.exl-ph { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; background: var(--bg-2); color: var(--text-faint); padding: 10px; text-align: center; }
.exl-ph-cat { font-family: var(--font-display); font-stretch: 125%; text-transform: uppercase; font-size: 9.5px; font-weight: 700; letter-spacing: .6px; color: var(--text-dim); }
.exl-ph-name { font-size: 13px; font-weight: 700; color: var(--text); max-width: 90%; }
.exl-tag { position: absolute; top: 8px; left: 8px; font-family: var(--font-display); font-stretch: 125%; font-size: 9px; font-weight: 800; letter-spacing: .6px; padding: 3px 7px; border-radius: 6px; background: var(--surface); color: var(--ink); border: 1px solid var(--ink); }
.exl-tag.auvi { background: var(--yellow); border-color: var(--yellow); }
.exl-tag.static { position: static; flex: 0 0 auto; }
.exl-vid { position: absolute; top: 8px; right: 8px; font-size: 9px; font-weight: 800; letter-spacing: .6px; padding: 3px 7px; border-radius: 6px; background: var(--surface); color: var(--text-dim); border: 1px solid var(--border); }
.exl-card-body { padding: 10px 11px 12px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.exl-card-name { font-size: 13.5px; font-weight: 700; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.exl-card-en { font-size: 11px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.exl-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 4px; }
.exl-cat { font-size: 10.5px; font-weight: 700; color: var(--ink); background: var(--yellow-soft); border-radius: 6px; padding: 2px 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.exl-card-line { font-size: 11.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.exl-sep { margin: 0 5px; color: var(--text-faint); }
.exl-dots { display: inline-flex; gap: 3px; flex: 0 0 auto; }
.exl-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--border-2); }
.exl-dots i.on { background: var(--ink); }
.exl-more { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 18px 0 8px; font-size: 12.5px; }
.exl-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.exl-ph.exl-thumb svg { width: 20px; height: 20px; }
.exl-fgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 0 12px; }
@media (min-width: 881px) { .modal:has(.exl-pickwrap) { max-width: 1040px !important; } }

.exl-detail { display: flex; flex-direction: column; gap: 14px; }
.exl-d-media { border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-2); aspect-ratio: 16 / 10; }
.exl-d-media img, .exl-d-media video { width: 100%; height: 100%; object-fit: contain; display: block; background: var(--surface); }
.exl-d-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.exl-d-name { font-family: var(--font-display); font-stretch: 125%; text-transform: uppercase; font-size: 19px; font-weight: 800; line-height: 1.15; }
.exl-d-en { font-size: 12.5px; margin-top: 3px; }
.exl-d-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.exl-d-diff { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-dim); }
.exl-d-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 12px; padding: 14px; background: var(--surface-2); border-radius: var(--radius-sm); }
.exl-k { font-size: 10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text-faint); }
.exl-v { font-size: 13px; margin-top: 2px; }
.exl-bars { display: flex; align-items: flex-end; gap: 3px; margin-top: 5px; font-size: 12px; }
.exl-bars i { width: 7px; border-radius: 2px; background: var(--border-2); }
.exl-bars i:nth-child(1) { height: 8px; } .exl-bars i:nth-child(2) { height: 12px; } .exl-bars i:nth-child(3) { height: 16px; }
.exl-bars i.on { background: var(--ink); }
.exl-bars span { margin-left: 6px; }
.exl-d-desc { font-size: 13.5px; color: var(--text-dim); }
.exl-sec-t { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 700; color: var(--text-dim); margin-bottom: 8px; }
.exl-ol, .exl-ul { padding-left: 20px; display: flex; flex-direction: column; gap: 5px; font-size: 13.5px; }
.exl-ol li::marker { font-weight: 700; }
.exl-ul-warn li::marker { color: var(--red); }
.exl-d-source { font-size: 11.5px; border-top: 1px solid var(--border); padding-top: 10px; }

.exl-sugg { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.exl-sugg .exl-chip { min-height: 28px; padding: 3px 10px; font-size: 11.5px; }
.exl-up { display: flex; gap: 10px; align-items: center; }
.exl-up-prev { width: 64px; height: 64px; border-radius: 10px; overflow: hidden; background: var(--bg-2); display: grid; place-items: center; color: var(--text-faint); flex: 0 0 auto; }
.exl-up-prev img, .exl-up-prev video, .exl-up-prev .exl-ph { width: 100%; height: 100%; object-fit: cover; }
.exl-up-main { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; flex: 1; }
.exl-up-main label.btn { cursor: pointer; }
.exl-disabled { opacity: .55; pointer-events: none; }
.exl-up-hint { font-size: 11.5px; width: 100%; }
.exl-prog { width: 100%; height: 6px; border-radius: 999px; background: var(--bg-2); overflow: hidden; }
.exl-prog i { display: block; height: 100%; background: var(--yellow); box-shadow: inset 0 0 0 1px var(--ink); transition: width .2s; }
`

/** stile della libreria, per chi usa ExMedia fuori dal componente principale */
export function ExlStyle() { return <style>{EXL_CSS}</style> }
