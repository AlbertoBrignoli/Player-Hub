import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { insertRow } from '../lib/useData'
import { toast } from '../lib/toast'
import { goto } from '../lib/route'
import { Modal, Field, Input, Select, Tabs, Textarea } from './ui'
import Icon from './Icon'
import { useLang } from '../lib/i18n'

// "+" sempre a portata di pollice: nuovo impegno o nuova task.
// Impegno, in quest'ordine: 1) CON CHI (AUVI o una persona del team), 2) le opzioni di QUELLA
// persona (preparatore: allenamento in presenza / online / programma online; gli altri: call o
// incontro; AUVI: impegno o call), 3) le parti comuni: titolo (già proposto), data e ora, luogo o link.
// Alla persona scelta arriva la notifica e, se l'ha chiesto l'atleta, è lei a confermare.
type EvType = 'personale' | 'call' | 'allenamento'
type Mode = 'presenza' | 'online' | 'programma'
// ask = non è un impegno ma una richiesta che parte in chat con quella persona (es. piano alimentare)
type Opt = { k: string; l: string; icon: string; type: EvType; mode?: Mode; link?: boolean; title: string; ask?: string }
type Pro = { pro_id: string; role: string; name: string | null; photo_url: string | null }
const ROLE_L: Record<string, string> = {
  agente: 'Procuratore', preparatore: 'Preparatore', assicuratore: 'Assicuratore', commercialista: 'Commercialista',
  fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager',
}
// cosa si può fare con ciascuno: il titolo è una proposta ({name} = nome della persona)
const OPTS_AUVI: Opt[] = [
  { k: 'impegno', l: 'Impegno', icon: 'calendar', type: 'personale', title: '' },
  { k: 'call', l: 'Call', icon: 'smartphone', type: 'call', link: true, title: 'Call con AUVI' },
]
const OPTS_COACH: Opt[] = [
  { k: 'presenza', l: 'In presenza', icon: 'dumbbell', type: 'allenamento', mode: 'presenza', title: 'Allenamento' },
  { k: 'online', l: 'Online', icon: 'video', type: 'allenamento', mode: 'online', link: true, title: 'Allenamento online' },
  { k: 'programma', l: 'Programma online', icon: 'file', type: 'allenamento', mode: 'programma', title: 'Programma online' },
]
const OPTS_NUTRI: Opt[] = [
  { k: 'call', l: 'Call', icon: 'smartphone', type: 'call', link: true, title: 'Call con {name}' },
  { k: 'incontro', l: 'Incontro', icon: 'users', type: 'personale', title: 'Incontro con {name}' },
  { k: 'piano', l: 'Piano alimentare', icon: 'layers', type: 'personale', title: 'Piano alimentare', ask: 'Richiesta piano alimentare' },
]
const optsFor = (p: Pro | null): Opt[] => !p ? OPTS_AUVI : p.role === 'preparatore' ? OPTS_COACH : p.role === 'nutrizionista' ? OPTS_NUTRI : OPTS_PRO
const OPTS_PRO: Opt[] = [
  { k: 'call', l: 'Call', icon: 'smartphone', type: 'call', link: true, title: 'Call con {name}' },
  { k: 'incontro', l: 'Incontro', icon: 'users', type: 'personale', title: 'Incontro con {name}' },
]
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
  const { session, profile } = useAuth()
  const { athleteId } = useAthlete()
  const { t } = useLang()
  const { canEvent, canTask } = useQuickAddPermissions()
  const [openState, setOpenState] = useState(false)
  const open = controlled ? true : openState
  const setOpen = (v: boolean) => { if (controlled) { if (!v) onClose?.() } else setOpenState(v) }
  const [kind, setKind] = useState<'event' | 'task'>(initialKind ?? (canEvent ? 'event' : 'task'))
  const [title, setTitle] = useState('')
  // finché l'atleta non lo modifica, il titolo segue la scelta (es. "Call con Andrea")
  const [titleTouched, setTitleTouched] = useState(false)
  const [start, setStart] = useState(defaultStart)
  const [location, setLocation] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState<'auvi' | 'player'>('auvi')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  // con chi: null = AUVI, altrimenti un professionista del team
  const [team, setTeam] = useState<Pro[]>([])
  const [tag, setTag] = useState<string | null>(null)
  const [optKey, setOptKey] = useState('impegno')
  const [askNote, setAskNote] = useState('')
  useEffect(() => {
    if (!open || !athleteId) return
    supabase.from('crm_athlete_team').select('pro_id, role, name, photo_url').eq('player_id', athleteId)
      .then(({ data }) => setTeam(((data as Pro[]) || []).filter(p => p.pro_id)))
  }, [open, athleteId])

  if (!canEvent && !canTask) return null

  const who = team.find(p => p.pro_id === tag) || null
  const whoName = who ? (who.name || t(ROLE_L[who.role] || who.role)).split(' ')[0] : 'AUVI'
  const opts = optsFor(who)
  const opt = opts.find(o => o.k === optKey) || opts[0]
  const isProgram = !!who && opt.mode === 'programma'
  const isAsk = !!who && !!opt.ask
  // programma online e richieste in chat: niente data e ora, solo "entro quando" e cosa serve
  const noDate = isProgram || isAsk
  const suggest = (o: Opt, name: string) => t(o.title).replace('{name}', name)

  // scelta la persona, si aprono le sue opzioni (la prima già selezionata) e il titolo si propone da solo
  function pickPerson(id: string | null) {
    setTag(id)
    const p = team.find(x => x.pro_id === id) || null
    const list = optsFor(p)
    setOptKey(list[0].k)
    if (!titleTouched) setTitle(suggest(list[0], p ? (p.name || t(ROLE_L[p.role] || p.role)).split(' ')[0] : 'AUVI'))
  }
  function pickOpt(o: Opt) {
    setOptKey(o.k)
    if (!titleTouched) setTitle(suggest(o, whoName))
  }

  function reset() {
    setTitle(''); setTitleTouched(false); setStart(defaultStart()); setLocation(''); setDue(''); setAssignee('auvi')
    setLink(''); setTag(null); setOptKey('impegno'); setAskNote('')
  }

  async function save() {
    if ((!title.trim() && !isAsk) || !athleteId) return
    setBusy(true)
    // programma online: è una richiesta al preparatore (gli arriva la notifica), non un impegno in agenda
    if (kind === 'event' && isProgram && who) {
      const by = due ? ` · ${t('entro il {d}').replace('{d}', new Date(due).toLocaleDateString('it-IT'))}` : ''
      const { error } = await supabase.from('fitness_requests').insert({
        player_id: athleteId, trainer_id: who.pro_id, type: 'programma', note: `${title.trim()}${by}`,
      })
      setBusy(false)
      if (error) { toast(error.message, 'err'); return }
      toast(t('Richiesta di programma inviata a {name}').replace('{name}', whoName))
      reset(); setOpen(false)
      return
    }
    // richiesta in chat (es. piano alimentare): parte un messaggio sul canale di quella persona,
    // che riceve la notifica e risponde lì
    if (kind === 'event' && isAsk && who && opt.ask) {
      const by = due ? ` · ${t('entro il {d}').replace('{d}', new Date(due).toLocaleDateString('it-IT'))}` : ''
      const body = `${t(opt.ask)}${by}${askNote.trim() ? `\n${askNote.trim()}` : ''}`
      const { error } = await supabase.from('crm_messages').insert({
        sender_id: session?.user.id, sender_name: profile?.full_name || profile?.email, sender_role: profile?.role,
        body, player_id: athleteId, channel: who.role,
      })
      setBusy(false)
      if (error) { toast(error.message, 'err'); return }
      toast(t('Richiesta inviata a {name}').replace('{name}', whoName), 'ok', { label: t('Apri la chat'), onClick: () => {
        try { sessionStorage.setItem('chat_channel', who.role) } catch { /* modalità privata */ }
        goto('messages')
      } })
      reset(); setOpen(false)
      return
    }
    const { error } = kind === 'event'
      ? await supabase.rpc('crm_event_create', {
          p_player: athleteId, p_type: opt.type, p_title: title.trim(), p_start: new Date(start).toISOString(),
          p_location: opt.link ? null : (location.trim() || null),
          p_link: opt.link ? (link.trim() || null) : null, p_tag: tag,
          p_mode: opt.mode && opt.mode !== 'programma' ? opt.mode : null,
        })
      : await insertRow('crm_tasks', {
          title: title.trim(), status: 'todo', priority: 'medium', assignee, due_date: due || null,
          player_id: athleteId, created_by: session?.user.id, updated_at: new Date().toISOString(),
        })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    const dest = kind === 'event' ? 'agenda' : 'tasks'
    toast(kind === 'event'
      ? (who ? t('Inviato a {name}').replace('{name}', whoName) : t('Impegno aggiunto'))
      : t('Task aggiunta'), 'ok', { label: t('Apri'), onClick: () => goto(dest) })
    reset(); setOpen(false)
  }

  const send = kind === 'task' ? t('Aggiungi') : isProgram ? t('Chiedi il programma') : isAsk ? t('Invia la richiesta') : who ? t('Invia a {name}').replace('{name}', whoName) : t('Aggiungi')

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
            <button className="btn btn-primary" disabled={busy || (!title.trim() && !isAsk)} onClick={save}>{busy ? t('Salvo…') : send}</button></>}>
          {canEvent && canTask && (
            <Tabs tabs={[{ key: 'event', label: t('Impegno') }, { key: 'task', label: t('Task') }]} value={kind} onChange={setKind} style={{ marginBottom: 16 }} />
          )}

          {kind === 'event' ? (<>
            {/* 1. con chi */}
            <div className="field">
              <label>{t('Con chi')}</label>
              <div className="qa-people">
                <button type="button" className={`qa-person ${tag === null ? 'on' : ''}`} onClick={() => pickPerson(null)}>
                  <span className="qa-person-av qa-person-auvi"><img src="/brand/auvi-mark-yellow.svg" alt="" /></span>
                  <span className="qa-person-n">AUVI</span>
                  <span className="qa-person-r">{t('Consulente')}</span>
                </button>
                {team.map(p => (
                  <button key={p.pro_id} type="button" className={`qa-person ${tag === p.pro_id ? 'on' : ''}`} onClick={() => pickPerson(p.pro_id)}>
                    {p.photo_url
                      ? <img className="qa-person-av" src={p.photo_url} alt="" />
                      : <span className="qa-person-av">{(p.name || '?').slice(0, 1)}</span>}
                    <span className="qa-person-n">{(p.name || t(ROLE_L[p.role] || p.role)).split(' ')[0]}</span>
                    <span className="qa-person-r">{t(ROLE_L[p.role] || p.role)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. le opzioni di quella persona */}
            <div className="qa-types" role="radiogroup" aria-label={t('Cosa')} style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
              {opts.map(o => (
                <button key={o.k} type="button" role="radio" aria-checked={opt.k === o.k}
                  className={`qa-type ${opt.k === o.k ? 'on' : ''}`} onClick={() => pickOpt(o)}>
                  <Icon name={o.icon} size={18} /> {t(o.l)}
                </button>
              ))}
            </div>
            {isProgram && <div className="t-meta" style={{ margin: '-8px 0 14px' }}>{t('Il preparatore ti prepara una scheda da fare in autonomia.')}</div>}

            {/* 3. parti comuni */}
            {!isAsk && <Field label={t('Titolo')}>
              <Input value={title} onChange={e => { setTitle(e.target.value); setTitleTouched(true) }}
                placeholder={t('Es. Visita medica, shooting, volo')}
                onKeyDown={e => { if (e.key === 'Enter') save() }} />
            </Field>}
            {isAsk && (
              <Field label={t('Cosa ti serve (facoltativo)')}>
                <Textarea rows={3} value={askNote} onChange={e => setAskNote(e.target.value)}
                  placeholder={t('Es. obiettivi, intolleranze, orari degli allenamenti…')} />
              </Field>
            )}
            {noDate ? (
              <Field label={t('Entro quando (facoltativo)')}><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
            ) : (
              <div className="row2">
                <Field label={t('Data e ora')}><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
                {opt.link
                  ? <Field label={opt.type === 'call' ? t('Link della call (facoltativo)') : t('Link della sessione (facoltativo)')}><Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://meet…" inputMode="url" /></Field>
                  : <Field label={t('Dove (facoltativo)')}><Input value={location} onChange={e => setLocation(e.target.value)} placeholder={t('Indirizzo o luogo')} /></Field>}
              </div>
            )}
            <div className="t-meta">
              {isProgram ? t('Gli arriva la richiesta di programma.') : isAsk ? t('Gli arriva in chat: rispondete lì.') : who ? t('Gli arriva la notifica e conferma lui.') : t('La richiesta arriva ad AUVI.')}
            </div>
          </>) : (<>
            <Field label={t('Da fare')}>
              <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Es. Inviare contratto firmato')}
                onKeyDown={e => { if (e.key === 'Enter') save() }} />
            </Field>
            <div className="row2">
              <Field label={t('Scadenza (facoltativa)')}><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
              <Field label={t('Chi')}>
                <Select value={assignee} onChange={e => setAssignee(e.target.value as 'auvi' | 'player')}>
                  <option value="auvi">AUVI</option>
                  <option value="player">{t('Atleta')}</option>
                </Select>
              </Field>
            </div>
          </>)}
          <style>{QA_CSS}</style>
        </Modal>
      )}
    </>
  )
}

const QA_CSS = `
.qa-types { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 2px 0 16px; }
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
