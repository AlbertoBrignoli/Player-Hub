import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { insertRow } from '../lib/useData'
import { toast } from '../lib/toast'
import { goto } from '../lib/route'
import { Modal, Field, Input, Select, Tabs } from './ui'
import Icon from './Icon'
import { useLang } from '../lib/i18n'

// "+" sempre a portata di pollice: nuovo impegno o nuova task con solo titolo e data.
// L'impegno può essere un impegno, una call o un allenamento, e si può taggare la persona di
// riferimento del team: le arriva la notifica e (se l'ha chiesto l'atleta) è lei a confermare.
// I dettagli (note, allegati, priorità) si aggiungono dopo, dalla scheda completa.
type EvType = 'personale' | 'call' | 'allenamento'
const EV_TYPES: { k: EvType; l: string; icon: string; ph: string }[] = [
  { k: 'personale', l: 'Impegno', icon: 'calendar', ph: 'Es. Visita medica, shooting, volo' },
  { k: 'call', l: 'Call', icon: 'smartphone', ph: 'Es. Call con il procuratore' },
  { k: 'allenamento', l: 'Allenamento', icon: 'dumbbell', ph: 'Es. Forza gambe, recupero' },
]
type Pro = { pro_id: string; role: string; name: string | null; photo_url: string | null }
const ROLE_L: Record<string, string> = {
  agente: 'Procuratore', preparatore: 'Preparatore', assicuratore: 'Assicuratore', commercialista: 'Commercialista',
  fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager',
}
function defaultStart() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Chi può creare cosa (usato anche dalla Home per decidere quali azioni rapide mostrare)
export function useQuickAddPermissions() {
  const { isAdmin, role } = useAuth()
  return { canEvent: isAdmin || role === 'player', canTask: isAdmin }
}

// Finestra "Aggiungi" aperta da fuori (es. le azioni rapide della Home).
export function QuickAddModal({ initialKind, onClose }: { initialKind: 'event' | 'task'; onClose: () => void }) {
  return <QuickAdd controlled initialKind={initialKind} onClose={onClose} />
}

export default function QuickAdd({ controlled, initialKind, onClose }: {
  controlled?: boolean; initialKind?: 'event' | 'task'; onClose?: () => void
} = {}) {
  const { session } = useAuth()
  const { athleteId } = useAthlete()
  const { t } = useLang()
  const { canEvent, canTask } = useQuickAddPermissions()
  const [openState, setOpenState] = useState(false)
  const open = controlled ? true : openState
  const setOpen = (v: boolean) => { if (controlled) { if (!v) onClose?.() } else setOpenState(v) }
  const [kind, setKind] = useState<'event' | 'task'>(initialKind ?? (canEvent ? 'event' : 'task'))
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [location, setLocation] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState<'auvi' | 'player'>('auvi')
  const [busy, setBusy] = useState(false)
  const [evType, setEvType] = useState<EvType>('personale')
  const [link, setLink] = useState('')
  // persona di riferimento: null = AUVI (come sempre), altrimenti un professionista del team
  const [team, setTeam] = useState<Pro[]>([])
  const [tag, setTag] = useState<string | null>(null)
  useEffect(() => {
    if (!open || !athleteId) return
    supabase.from('crm_athlete_team').select('pro_id, role, name, photo_url').eq('player_id', athleteId)
      .then(({ data }) => setTeam(((data as Pro[]) || []).filter(p => p.pro_id)))
  }, [open, athleteId])
  // allenamento → il preparatore è già selezionato (si può cambiare)
  function pickType(k: EvType) {
    setEvType(k)
    if (k === 'allenamento') { const c = team.find(p => p.role === 'preparatore'); if (c) setTag(c.pro_id) }
  }

  if (!canEvent && !canTask) return null

  function reset() { setTitle(''); setStart(defaultStart()); setLocation(''); setDue(''); setAssignee('auvi'); setEvType('personale'); setLink(''); setTag(null) }

  async function save() {
    if (!title.trim() || !athleteId) return
    setBusy(true)
    const { error } = kind === 'event'
      ? await supabase.rpc('crm_event_create', {
          p_player: athleteId, p_type: evType, p_title: title.trim(), p_start: new Date(start).toISOString(),
          p_location: evType === 'call' ? null : (location.trim() || null),
          p_link: evType === 'call' ? (link.trim() || null) : null, p_tag: tag,
        })
      : await insertRow('crm_tasks', {
          title: title.trim(), status: 'todo', priority: 'medium', assignee, due_date: due || null,
          player_id: athleteId, created_by: session?.user.id, updated_at: new Date().toISOString(),
        })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    const dest = kind === 'event' ? 'agenda' : 'tasks'
    const who = team.find(p => p.pro_id === tag)
    toast(kind === 'event'
      ? (who ? t('Inviato a {name}').replace('{name}', who.name || t(ROLE_L[who.role] || who.role)) : t('Impegno aggiunto'))
      : t('Task aggiunta'), 'ok', { label: t('Apri'), onClick: () => goto(dest) })
    reset(); setOpen(false)
  }

  return (
    <>
      {!controlled && (
        <button className="bell" onClick={() => setOpen(true)} aria-label={t('Aggiungi')} title={t('Aggiungi impegno o task')}>
          <Icon name="plus" size={18} />
        </button>
      )}
      {open && (
        <Modal title={t('Aggiungi')} onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>{t('Annulla')}</button>
            <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={save}>{busy ? t('Salvo…') : t('Aggiungi')}</button></>}>
          {canEvent && canTask && (
            <Tabs tabs={[{ key: 'event', label: t('Impegno') }, { key: 'task', label: t('Task') }]} value={kind} onChange={setKind} style={{ marginBottom: 16 }} />
          )}
          {kind === 'event' && (
            <div className="qa-types" role="radiogroup" aria-label={t('Tipo')}>
              {EV_TYPES.map(x => (
                <button key={x.k} type="button" role="radio" aria-checked={evType === x.k}
                  className={`qa-type ${evType === x.k ? 'on' : ''}`} onClick={() => pickType(x.k)}>
                  <Icon name={x.icon} size={18} /> {t(x.l)}
                </button>
              ))}
            </div>
          )}
          <Field label={kind === 'event' ? t('Cosa') : t('Da fare')}>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder={kind === 'event' ? t(EV_TYPES.find(x => x.k === evType)!.ph) : t('Es. Inviare contratto firmato')}
              onKeyDown={e => { if (e.key === 'Enter') save() }} />
          </Field>
          {kind === 'event' ? (
            <div className="row2">
              <Field label={t('Quando')}><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
              {evType === 'call'
                ? <Field label={t('Link della call (facoltativo)')}><Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://meet…" inputMode="url" /></Field>
                : <Field label={t('Dove (facoltativo)')}><Input value={location} onChange={e => setLocation(e.target.value)} placeholder={t('Indirizzo o luogo')} /></Field>}
            </div>
          ) : (
            <div className="row2">
              <Field label={t('Scadenza (facoltativa)')}><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
              <Field label={t('Chi')}>
                <Select value={assignee} onChange={e => setAssignee(e.target.value as 'auvi' | 'player')}>
                  <option value="auvi">AUVI</option>
                  <option value="player">{t('Atleta')}</option>
                </Select>
              </Field>
            </div>
          )}
          {kind === 'event' && team.length > 0 && (
            <div className="field">
              <label>{t('Persona di riferimento')}</label>
              <div className="qa-people">
                <button type="button" className={`qa-person ${tag === null ? 'on' : ''}`} onClick={() => setTag(null)}>
                  <span className="qa-person-av qa-person-auvi"><img src="/brand/auvi-mark-yellow.svg" alt="" /></span>
                  <span className="qa-person-n">AUVI</span>
                </button>
                {team.map(p => (
                  <button key={p.pro_id} type="button" className={`qa-person ${tag === p.pro_id ? 'on' : ''}`} onClick={() => setTag(p.pro_id)}>
                    {p.photo_url
                      ? <img className="qa-person-av" src={p.photo_url} alt="" />
                      : <span className="qa-person-av">{(p.name || '?').slice(0, 1)}</span>}
                    <span className="qa-person-n">{(p.name || t(ROLE_L[p.role] || p.role)).split(' ')[0]}</span>
                    <span className="qa-person-r">{t(ROLE_L[p.role] || p.role)}</span>
                  </button>
                ))}
              </div>
              <div className="t-meta" style={{ marginTop: 6 }}>
                {tag ? t('Gli arriva la notifica e conferma lui.') : t('La richiesta arriva ad AUVI.')}
              </div>
            </div>
          )}
          <style>{QA_CSS}</style>
        </Modal>
      )}
    </>
  )
}

const QA_CSS = `
.qa-types { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
.qa-type { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; min-height: 64px; border-radius: 14px;
  border: 1.5px solid var(--border); background: var(--surface); color: var(--text-dim); font: inherit; font-weight: 600; font-size: var(--fs-meta); cursor: pointer; }
.qa-type.on { border-color: var(--ink); background: var(--ink); color: var(--yellow); }
.qa-people { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 0 4px; }
.qa-people::-webkit-scrollbar { display: none; }
.qa-person { flex: 0 0 72px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 2px; border: 0; background: none; cursor: pointer; font: inherit; color: var(--text); }
.qa-person-av { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; display: grid; place-items: center; background: var(--bg-2); font-weight: 800; box-shadow: 0 0 0 1px var(--border-2); }
.qa-person-auvi { background: var(--ink); }
.qa-person-auvi img { width: 46%; }
.qa-person.on .qa-person-av { box-shadow: 0 0 0 3px var(--yellow), 0 0 0 4px var(--ink); }
.qa-person-n { font-size: var(--fs-meta); font-weight: 700; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qa-person-r { font-size: 11px; color: var(--text-faint); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`
