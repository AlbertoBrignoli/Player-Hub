import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useRouteParam } from '../lib/route'
import { toast } from '../lib/toast'
import { Modal, Field, Input, Textarea, Spinner } from './ui'
import Icon from './Icon'

/* Sessioni di allenamento col preparatore, in tre passi:
   1. il preparatore tocca un giorno del calendario e propone la sessione (online o in presenza);
   2. l'atleta riceve la notifica, la apre e conferma oppure propone un altro orario;
   3. il preparatore riceve la notifica, si apre la stessa sessione e conferma.
   Stati, permessi e notifiche stanno sul server (crm_training_propose / crm_training_respond):
   qui solo interfaccia. Gli orari si mostrano nell'ora del telefono di chi guarda. */

const ACCENT = '#3F7F00'
export type Training = {
  id: string; player_id: number; start_at: string; end_at: string | null
  session_mode: 'online' | 'presenza'; location: string | null; link_url: string | null; notes: string | null
  request_status: 'da_confermare' | 'modifica_richiesta' | 'confermata' | 'rifiutata' | null
  counter_start_at: string | null; change_note: string | null; created_by: string | null
}
const COLS = 'id, player_id, start_at, end_at, session_mode, location, link_url, notes, request_status, counter_start_at, change_note, created_by'
const DURATIONS = [45, 60, 75, 90]
const WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeOf = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const minutesOf = (s: Training) => s.end_at ? Math.round((+new Date(s.end_at) - +new Date(s.start_at)) / 60000) : 60
/** "2026-11-12" + "18:30" → Date locale */
const atLocal = (day: string, time: string) => new Date(`${day}T${time || '00:00'}:00`)

function useFmt() {
  const { t, lang } = useLang()
  const locale = lang === 'en' ? 'en-GB' : 'it-IT'
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const when = (iso: string) => `${day(iso)} · ${timeOf(iso)}`
  return { t, locale, day, when }
}

const STATUS: Record<string, { l: string; c: string; bg: string }> = {
  da_confermare: { l: 'In attesa di conferma', c: '#8A6D00', bg: 'rgba(154,134,0,.12)' },
  modifica_richiesta: { l: 'Nuovo orario proposto', c: 'var(--gold)', bg: 'var(--yellow-soft)' },
  confermata: { l: 'Confermato', c: ACCENT, bg: 'rgba(63,127,0,.12)' },
  rifiutata: { l: 'Non può', c: '#C23A00', bg: 'rgba(229,63,0,.10)' },
}
const dotColor = (s: Training) => STATUS[s.request_status || '']?.c || 'var(--text-faint)'

function StatusPill({ s }: { s: Training }) {
  const { t } = useLang()
  const st = STATUS[s.request_status || '']
  if (!st) return null
  return <span className="tr-pill" style={{ color: st.c, background: st.bg }}>{t(st.l)}</span>
}

function ModeTag({ s }: { s: Training }) {
  const { t } = useLang()
  return (
    <span className="tr-mode">
      <Icon name={s.session_mode === 'online' ? 'video' : 'pin'} size={12} />
      {s.session_mode === 'online' ? t('Online') : t('In presenza')}
    </span>
  )
}

async function respond(id: string, action: string, start?: Date | null, note?: string) {
  const { data, error } = await supabase.rpc('crm_training_respond', {
    p_event: id, p_action: action, p_start: start ? start.toISOString() : null, p_note: note || null,
  })
  if (error) { toast(error.message, 'err'); return null }
  return data as string
}

/* ============================ PREPARATORE ============================ */

/** Calendario degli allenamenti di tutti gli atleti del preparatore: tocca un giorno → proponi. */
export function CoachTrainingCalendar({ compact }: { compact?: boolean }) {
  const { athletes, athleteId } = useAthlete()
  const { t, locale, day } = useFmt()
  const ids = athletes.map(a => a.api_player_id)
  const idsKey = ids.join(',')
  const today = dayKey(new Date())
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(today)
  const [rows, setRows] = useState<Training[]>([])
  const [matches, setMatches] = useState<{ player_id: number; match_date: string; opponent: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [proposing, setProposing] = useState(false)
  const [open, setOpen] = useState<Training | null>(null)
  const focus = useRouteParam('training')

  const load = useCallback(async () => {
    if (!idsKey) { setRows([]); setLoading(false); return }
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 20).toISOString()
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 12).toISOString()
    const list = idsKey.split(',').map(Number)
    const [ev, m] = await Promise.all([
      supabase.from('crm_events').select(COLS).in('player_id', list).not('session_mode', 'is', null)
        .gte('start_at', from).lt('start_at', to).order('start_at'),
      supabase.from('matches').select('player_id, match_date, opponent').in('player_id', list)
        .gte('match_date', from).lt('match_date', to),
    ])
    setRows((ev.data as Training[]) || [])
    setMatches((m.data as any[]) || [])
    setLoading(false)
  }, [idsKey, month])
  useEffect(() => { load() }, [load])

  // aperto da una notifica: porta al mese/giorno della sessione e la apre
  useEffect(() => {
    if (!focus) return
    supabase.from('crm_events').select(COLS).eq('id', focus).maybeSingle().then(({ data }) => {
      const s = data as Training | null
      if (!s) { toast(t('Questo allenamento non esiste più'), 'err'); return }
      const d = new Date(s.start_at)
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(dayKey(d)); setOpen(s)
    })
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (pid: number) => athletes.find(a => a.api_player_id === pid)?.name || t('Atleta')
  const byDay = useMemo(() => {
    const m: Record<string, Training[]> = {}
    rows.forEach(r => { (m[dayKey(new Date(r.start_at))] ||= []).push(r) })
    return m
  }, [rows])
  const matchDays = useMemo(() => new Set(matches.map(x => dayKey(new Date(x.match_date)))), [matches])
  const waiting = rows.filter(r => r.request_status === 'modifica_richiesta' && r.counter_start_at)

  // griglia del mese, settimana da lunedì
  const cells: (Date | null)[] = []
  const lead = (month.getDay() + 6) % 7
  for (let i = 0; i < lead; i++) cells.push(null)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  for (let d = 1; d <= last; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  while (cells.length % 7) cells.push(null)

  const selItems = byDay[sel] || []
  const selMatches = matches.filter(x => dayKey(new Date(x.match_date)) === sel)
  const past = sel < today
  const monthLabel = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))

  if (!athletes.length) return null
  return (
    <section className="tr-cal">
      <style>{TR_CSS}</style>
      <div className="tr-head">
        <div>
          <div className="tr-kick">{t('Calendario allenamenti')}</div>
          {!compact && <div className="tr-sub">{t('Tocca un giorno per proporre una sessione')}</div>}
        </div>
        <div className="tr-nav">
          <button onClick={() => shift(-1)} aria-label={t('Mese precedente')}><Icon name="chevron-left" size={16} /></button>
          <span>{monthLabel}</span>
          <button onClick={() => shift(1)} aria-label={t('Mese successivo')}><Icon name="chevron-right" size={16} /></button>
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="tr-alert">
          {waiting.map(s => (
            <button key={s.id} onClick={() => setOpen(s)}>
              <Icon name="bell" size={14} />
              <span><b>{nameOf(s.player_id)}</b> {t('propone')} {day(s.counter_start_at!)} · {timeOf(s.counter_start_at!)}</span>
              <span className="tr-alert-go">{t('Rispondi')}</span>
            </button>
          ))}
        </div>
      )}

      <div className="tr-grid">
        {WD.map(w => <div key={w} className="tr-wd">{t(w)}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const k = dayKey(d)
          const items = byDay[k] || []
          return (
            <button key={i} className={'tr-day' + (k === sel ? ' sel' : '') + (k === today ? ' today' : '') + (k < today ? ' past' : '')}
              onClick={() => setSel(k)}>
              <span className="tr-n">{d.getDate()}</span>
              <span className="tr-dots">
                {items.slice(0, 3).map(s => <i key={s.id} style={{ background: dotColor(s) }} />)}
                {matchDays.has(k) && <Icon name="ball" size={9} />}
              </span>
            </button>
          )
        })}
      </div>
      {loading && <Spinner />}

      <div className="tr-dayp">
        <div className="tr-dayh">{day(sel + 'T12:00:00')}</div>
        {selMatches.map((m, i) => (
          <div key={i} className="tr-match"><Icon name="ball" size={12} /> {timeOf(m.match_date)} · {nameOf(m.player_id)}{m.opponent ? ` vs ${m.opponent}` : ''}</div>
        ))}
        {selItems.map(s => (
          <button key={s.id} className="tr-item" onClick={() => setOpen(s)}>
            <span className="tr-time">{timeOf(s.start_at)}</span>
            <span className="tr-bar" style={{ background: dotColor(s) }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="tr-item-t">{nameOf(s.player_id)}</span>
              <span className="tr-item-s"><ModeTag s={s} /> · {minutesOf(s)} min</span>
            </span>
            <StatusPill s={s} />
          </button>
        ))}
        {!past ? (
          <button className="btn btn-primary tr-cta" onClick={() => setProposing(true)}>
            <Icon name="plus" size={15} /> {t('Proponi allenamento')}
          </button>
        ) : selItems.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>{t('Nessun allenamento in questo giorno')}</div>}
      </div>

      {proposing && (
        <ProposeModal day={sel} defaultPlayer={athleteId && ids.includes(athleteId) ? athleteId : ids.length === 1 ? ids[0] : null}
          onClose={() => setProposing(false)} onSent={() => { setProposing(false); load() }} />
      )}
      {open && <SessionSheet s={open} who={nameOf(open.player_id)} side="coach"
        onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load() }} />}
    </section>
  )
}

export function ProposeModal({ day: initialDay, defaultPlayer, editableDay, onClose, onSent }: {
  day: string; defaultPlayer: number | null; onClose: () => void; onSent: () => void
  /** aperta fuori dal calendario (es. da una richiesta in "Da fare"): il giorno si sceglie qui */
  editableDay?: boolean
}) {
  const { athletes } = useAthlete()
  const { t, day } = useFmt()
  const [d, setD] = useState(initialDay)
  const [player, setPlayer] = useState<number | null>(defaultPlayer)
  const [time, setTime] = useState('10:00')
  const [mins, setMins] = useState(60)
  const [mode, setMode] = useState<'presenza' | 'online' | null>(null)
  const [place, setPlace] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const start = atLocal(d, time)
  const missing = [!player && t('atleta'), !d && t('il giorno'), !mode && t('online o in presenza'), start < new Date() && t('un orario futuro')].filter(Boolean)
  const name = athletes.find(a => a.api_player_id === player)?.name || t('Atleta')

  async function send() {
    if (missing.length) return
    setBusy(true)
    const { error } = await supabase.rpc('crm_training_propose', {
      p_player: player, p_start: start.toISOString(), p_minutes: mins, p_mode: mode, p_place: place || null, p_note: note || null,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(t('Proposta inviata a {name}').replace('{name}', name))
    onSent()
  }

  return (
    <Modal title={t('Proponi allenamento')} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || missing.length > 0} onClick={send}>
          <Icon name="send" size={14} /> {busy ? t('Invio…') : t('Invia proposta')}
        </button>
      </>}>
      <style>{TR_CSS}</style>
      {editableDay
        ? <Field label={t('Giorno')}><Input type="date" value={d} min={dayKey(new Date())} onChange={e => setD(e.target.value)} /></Field>
        : <div className="tr-when">{day(d + 'T12:00:00')}</div>}

      {athletes.length > 1 && (
        <Field label={t('Atleta')}>
          <div className="tr-chips">
            {athletes.map(a => (
              <button key={a.api_player_id} className={'tr-chip' + (player === a.api_player_id ? ' on' : '')} onClick={() => setPlayer(a.api_player_id)}>
                {a.photo_url ? <img src={a.photo_url} alt="" /> : <span className="tr-ini">{(a.name || '?').slice(0, 1)}</span>}
                {a.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      <div className="tr-row2">
        <Field label={t('Orario')}><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
        <Field label={t('Durata')}>
          <div className="tr-chips">
            {DURATIONS.map(m => <button key={m} className={'tr-chip sm' + (mins === m ? ' on' : '')} onClick={() => setMins(m)}>{m}′</button>)}
          </div>
        </Field>
      </div>

      <Field label={t('Come')}>
        <div className="tr-modes">
          {(['presenza', 'online'] as const).map(m => (
            <button key={m} className={'tr-modeb' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>
              <Icon name={m === 'online' ? 'video' : 'pin'} size={20} />
              <b>{m === 'online' ? t('Online') : t('In presenza')}</b>
              <span>{m === 'online' ? t('Videochiamata') : t('Palestra, campo, studio')}</span>
            </button>
          ))}
        </div>
      </Field>

      {mode && (
        <Field label={mode === 'online' ? t('Link videochiamata (facoltativo)') : t('Dove (facoltativo)')}>
          <Input value={place} onChange={e => setPlace(e.target.value)}
            placeholder={mode === 'online' ? 'https://meet.google.com/…' : t('Es. Palestra, campo d\'allenamento…')} />
        </Field>
      )}
      <Field label={t('Nota per l\'atleta (facoltativa)')}>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={t('Es. Forza arti inferiori, porta le scarpe da corsa')} />
      </Field>
      {missing.length > 0 && <div className="tr-miss">{t('Manca')}: {missing.join(', ')}</div>}
    </Modal>
  )
}

/* ============================ SCHEDA SESSIONE ============================ */

/** Dettaglio di una sessione con le azioni giuste per chi la guarda (atleta o preparatore). */
export function SessionSheet({ s, who, side, onClose, onChanged }: {
  s: Training; who: string; side: 'coach' | 'athlete'; onClose: () => void; onChanged: () => void
}) {
  const { t, when } = useFmt()
  const [pick, setPick] = useState(false)
  const [d, setD] = useState(() => dayKey(new Date(s.counter_start_at || s.start_at)))
  const [time, setTime] = useState(() => timeOf(s.counter_start_at || s.start_at))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const st = s.request_status
  const counter = st === 'modifica_richiesta' && s.counter_start_at

  async function act(action: string, start?: Date | null, n?: string) {
    setBusy(true)
    const r = await respond(s.id, action, start, n)
    setBusy(false)
    if (!r) return
    const msg: Record<string, string> = {
      confirm: 'Allenamento confermato', counter: 'Nuovo orario inviato', decline: 'Risposta inviata',
      accept: 'Nuovo orario confermato', repropose: 'Nuovo orario inviato', cancel: 'Allenamento annullato',
    }
    toast(t(msg[action]))
    onChanged()
  }
  const sendTime = () => {
    const at = atLocal(d, time)
    if (at < new Date()) { toast(t('Scegli un orario futuro'), 'err'); return }
    act(side === 'athlete' ? 'counter' : 'repropose', at, note)
  }

  return (
    <Modal title={t('Allenamento')} onClose={onClose}>
      <style>{TR_CSS}</style>
      <div className="tr-sheet">
        <div className="tr-sh-top">
          <ModeTag s={s} />
          <StatusPill s={s} />
        </div>
        <div className="tr-sh-when">{when(s.start_at)}</div>
        <div className="tr-sh-who">{side === 'coach' ? who : `${t('con')} ${who}`} · {minutesOf(s)} min</div>
        {s.location && <div className="tr-sh-line"><Icon name="pin" size={13} /> {s.location}</div>}
        {s.link_url && (
          <a className="tr-sh-line tr-link" href={s.link_url} target="_blank" rel="noreferrer">
            <Icon name="video" size={13} /> {st === 'confermata' ? t('Entra nella videochiamata') : s.link_url}
          </a>
        )}
        {s.notes && <div className="tr-sh-note">{s.notes}</div>}

        {counter && (
          <div className="tr-counter">
            <div className="tr-counter-k">{side === 'coach' ? `${who} ${t('propone')}` : t('Hai proposto')}</div>
            <div className="tr-counter-v">{when(s.counter_start_at!)}</div>
            {s.change_note && <div className="tr-counter-n">«{s.change_note}»</div>}
          </div>
        )}
        {st === 'rifiutata' && s.change_note && <div className="tr-sh-note">«{s.change_note}»</div>}

        {/* ---------- azioni ---------- */}
        {!pick && (
          <div className="tr-acts">
            {side === 'athlete' && st === 'da_confermare' && <>
              <button className="btn btn-primary tr-big" disabled={busy} onClick={() => act('confirm')}>
                <Icon name="check" size={16} /> {t('Confermo')}
              </button>
              <button className="btn tr-big" disabled={busy} onClick={() => setPick(true)}>
                <Icon name="clock" size={15} /> {t('Proponi un altro orario')}
              </button>
              <button className="tr-quiet" disabled={busy} onClick={() => { const n = prompt(t('Vuoi aggiungere un motivo? (facoltativo)')) ?? null; if (n !== null) act('decline', null, n) }}>
                {t('Non posso partecipare')}
              </button>
            </>}
            {side === 'athlete' && st === 'modifica_richiesta' && (
              <div className="tr-wait">{t('In attesa che il preparatore confermi il nuovo orario.')}</div>
            )}
            {side === 'athlete' && st === 'confermata' && (
              <div className="tr-wait ok"><Icon name="check" size={14} /> {t('Ci vediamo lì. Lo trovi anche in Agenda.')}</div>
            )}

            {side === 'coach' && counter && <>
              <button className="btn btn-primary tr-big" disabled={busy} onClick={() => act('accept')}>
                <Icon name="check" size={16} /> {t('Conferma nuovo orario')}
              </button>
              <button className="btn tr-big" disabled={busy} onClick={() => setPick(true)}>
                <Icon name="clock" size={15} /> {t('Proponi un altro orario')}
              </button>
            </>}
            {side === 'coach' && st === 'da_confermare' && (
              <div className="tr-wait">{t('In attesa della risposta di {name}.').replace('{name}', who)}</div>
            )}
            {side === 'coach' && !counter && st !== 'confermata' && (
              <button className="btn tr-big" disabled={busy} onClick={() => setPick(true)}>
                <Icon name="clock" size={15} /> {st === 'rifiutata' ? t('Proponi un altro orario') : t('Cambia orario')}
              </button>
            )}
            {side === 'coach' && st === 'confermata' && (
              <button className="btn tr-big" disabled={busy} onClick={() => setPick(true)}>
                <Icon name="clock" size={15} /> {t('Sposta')}
              </button>
            )}
            {side === 'coach' && (
              <button className="tr-quiet danger" disabled={busy} onClick={() => { if (confirm(t('Annullare questo allenamento? L\'atleta riceve una notifica.'))) act('cancel') }}>
                {t('Annulla allenamento')}
              </button>
            )}
          </div>
        )}

        {pick && (
          <div className="tr-pick">
            <div className="tr-row2">
              <Field label={t('Giorno')}><Input type="date" value={d} min={dayKey(new Date())} onChange={e => setD(e.target.value)} /></Field>
              <Field label={t('Orario')}><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
            </div>
            {side === 'athlete' && (
              <Field label={t('Messaggio (facoltativo)')}>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder={t('Es. la mattina ho la squadra')} />
              </Field>
            )}
            <div className="tr-acts">
              <button className="btn btn-primary tr-big" disabled={busy} onClick={sendTime}>
                <Icon name="send" size={15} /> {side === 'athlete' ? t('Invia al preparatore') : t('Invia all\'atleta')}
              </button>
              <button className="tr-quiet" onClick={() => setPick(false)}>{t('Indietro')}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ============================ ATLETA ============================ */

/** In Area Fitness: le sessioni proposte dal preparatore, in alto. Si apre anche da notifica (?training=<id>). */
export function AthleteTrainings() {
  const { athleteId } = useAthlete()
  const { t, day } = useFmt()
  const [rows, setRows] = useState<Training[]>([])
  const [coachName, setCoachName] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Training | null>(null)
  const focus = useRouteParam('training')

  const load = useCallback(async () => {
    if (!athleteId) return
    const { data } = await supabase.from('crm_events').select(COLS).eq('player_id', athleteId)
      .not('session_mode', 'is', null).gte('start_at', new Date(Date.now() - 3 * 3600000).toISOString()).order('start_at')
    const list = (data as Training[]) || []
    setRows(list)
    const tids = [...new Set(list.map(r => r.created_by).filter(Boolean))] as string[]
    if (tids.length) {
      const { data: c } = await supabase.from('fitness_coach_profile').select('trainer_id, name').in('trainer_id', tids)
      const m: Record<string, string> = {}
      ;((c as any[]) || []).forEach(x => { if (x.name) m[x.trainer_id] = x.name })
      setCoachName(m)
    }
  }, [athleteId])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!focus) return
    supabase.from('crm_events').select(COLS).eq('id', focus).maybeSingle().then(({ data }) => {
      if (data) setOpen(data as Training)
      else toast(t('Questo allenamento è stato annullato'), 'err')
    })
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  const who = (s: Training) => (s.created_by && coachName[s.created_by]) || t('il preparatore')
  const visible = rows.filter(r => r.request_status !== 'rifiutata')
  if (!visible.length && !open) return null
  return (
    <section className="tr-ath">
      <style>{TR_CSS}</style>
      {visible.length > 0 && <div className="tr-kick" style={{ marginBottom: 8 }}>{t('Allenamenti con il preparatore')}</div>}
      {visible.map(s => (
        <button key={s.id} className={'tr-item card' + (s.request_status === 'da_confermare' ? ' tr-hot' : '')} onClick={() => setOpen(s)}>
          <span className="tr-date">
            <b>{new Date(s.start_at).getDate()}</b>
            <span>{day(s.start_at).split(' ')[0].slice(0, 3)}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="tr-item-t">{timeOf(s.start_at)} · {minutesOf(s)} min</span>
            <span className="tr-item-s"><ModeTag s={s} />{s.location ? ` · ${s.location}` : ''}</span>
          </span>
          {s.request_status === 'da_confermare'
            ? <span className="tr-pill" style={{ color: '#fff', background: ACCENT }}>{t('Rispondi')}</span>
            : <StatusPill s={s} />}
        </button>
      ))}
      {open && <SessionSheet s={open} who={who(open)} side="athlete"
        onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load() }} />}
    </section>
  )
}

const TR_CSS = `
.tr-cal { background: var(--card, var(--bg-2)); border: 1px solid var(--border); border-radius: 20px; padding: 16px; }
.tr-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.tr-kick { font-size: 12.5px; font-weight: 800; color: ${ACCENT}; }
.tr-sub { font-size: 12.5px; color: var(--text-dim); margin-top: 2px; }
.tr-nav { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 14px; text-transform: capitalize; }
.tr-nav button { width: 32px; height: 32px; border-radius: 12px; border: 1px solid var(--border); background: transparent; display: grid; place-items: center; cursor: pointer; color: var(--text); }
.tr-alert { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.tr-alert button { display: flex; align-items: center; gap: 8px; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--yellow-soft); background: var(--yellow-soft); color: var(--text); font-size: 12.5px; cursor: pointer; }
.tr-alert button > span:nth-child(2) { flex: 1; min-width: 0; }
.tr-alert-go { font-weight: 800; color: var(--ink); font-size: 12.5px; }
.tr-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.tr-wd { font-size: 11px; font-weight: 700; color: var(--text-faint); text-align: center; padding-bottom: 2px; text-transform: uppercase; }
.tr-day { aspect-ratio: 1 / 1; min-height: 40px; border-radius: 12px; border: 1px solid transparent; background: var(--surface-2, rgba(0,0,0,.03)); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; color: var(--text); padding: 0; }
.tr-day.past { opacity: .45; }
.tr-day.today .tr-n { color: ${ACCENT}; font-weight: 800; }
.tr-day.sel { border-color: ${ACCENT}; background: rgba(63,127,0,.10); }
.tr-n { font-size: 14px; font-weight: 600; }
.tr-dots { display: flex; gap: 2px; align-items: center; height: 9px; color: var(--text-faint); }
.tr-dots i { width: 6px; height: 6px; border-radius: 50%; display: block; }
.tr-dayp { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.tr-dayh { font-weight: 800; font-size: 14px; text-transform: capitalize; }
.tr-match { font-size: 12.5px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; }
.tr-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: transparent; cursor: pointer; color: var(--text); }
.tr-item.card { margin-bottom: 8px; }
.tr-hot { border-color: ${ACCENT}; box-shadow: 0 0 0 1px ${ACCENT} inset; }
.tr-time { font-weight: 800; font-size: 14px; width: 44px; flex-shrink: 0; }
.tr-bar { width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }
.tr-item-t { display: block; font-weight: 800; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-item-s { display: block; font-size: 12.5px; color: var(--text-dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-mode { display: inline-flex; align-items: center; gap: 4px; }
.tr-pill { font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 999px; white-space: nowrap; flex-shrink: 0; }
.tr-cta { justify-content: center; width: 100%; min-height: 46px; font-size: 15px; }
.tr-when { font-size: 18px; font-weight: 850; text-transform: capitalize; margin-bottom: 12px; }
.tr-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tr-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px 6px 6px; border-radius: 999px; border: 1px solid var(--border); background: transparent; font-weight: 600; font-size: 12.5px; cursor: pointer; color: var(--text); }
.tr-chip.sm { padding: 8px 12px; }
.tr-chip img, .tr-ini { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: inline-grid; place-items: center; background: var(--border); font-size: 12.5px; font-weight: 800; }
.tr-chip.on { border-color: ${ACCENT}; background: rgba(63,127,0,.12); color: ${ACCENT}; }
.tr-row2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 10px; }
@media (max-width: 480px) { .tr-row2 { grid-template-columns: 1fr; gap: 0; } }
.tr-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tr-modeb { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 12px; border-radius: 20px; border: 1.5px solid var(--border); background: transparent; cursor: pointer; text-align: left; color: var(--text); }
.tr-modeb b { font-size: 14px; }
.tr-modeb span { font-size: 12.5px; color: var(--text-dim); }
.tr-modeb.on { border-color: ${ACCENT}; background: rgba(63,127,0,.10); }
.tr-modeb.on svg, .tr-modeb.on b { color: ${ACCENT}; }
.tr-miss { font-size: 12.5px; color: var(--text-dim); margin-top: 4px; }
.tr-sheet { display: flex; flex-direction: column; gap: 6px; }
.tr-sh-top { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; font-weight: 700; color: var(--text-dim); }
.tr-sh-when { font-size: 22px; font-weight: 800; text-transform: capitalize; letter-spacing: -.2px; margin-top: 4px; }
.tr-sh-who { font-size: 14px; color: var(--text-dim); }
.tr-sh-line { display: flex; align-items: center; gap: 6px; font-size: 14px; overflow-wrap: anywhere; }
.tr-link { color: ${ACCENT}; font-weight: 700; }
.tr-sh-note { font-size: 12.5px; padding: 8px 11px; background: var(--surface-2, rgba(0,0,0,.04)); border-radius: 12px; overflow-wrap: anywhere; }
.tr-counter { margin-top: 6px; padding: 12px 14px; border-radius: 20px; border: 1px solid var(--yellow-soft); background: var(--yellow-soft); }
.tr-counter-k { font-size: 12.5px; font-weight: 800; color: var(--ink); }
.tr-counter-v { font-size: 18px; font-weight: 800; text-transform: capitalize; margin-top: 2px; }
.tr-counter-n { font-size: 12.5px; margin-top: 4px; overflow-wrap: anywhere; }
.tr-acts { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.tr-big { justify-content: center; min-height: 48px; font-size: 15px; width: 100%; }
.tr-quiet { background: none; border: none; color: var(--text-dim); font-size: 12.5px; padding: 8px; cursor: pointer; text-decoration: underline; }
.tr-quiet.danger { color: var(--red); }
.tr-wait { font-size: 12.5px; color: var(--text-dim); padding: 10px 12px; border-radius: 12px; background: var(--surface-2, rgba(0,0,0,.04)); display: flex; align-items: center; gap: 6px; }
.tr-wait.ok { color: ${ACCENT}; background: rgba(63,127,0,.08); font-weight: 600; }
.tr-pick { margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.tr-ath { margin-bottom: 18px; }
.tr-date { width: 46px; height: 46px; border-radius: 12px; background: rgba(63,127,0,.1); color: ${ACCENT}; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; line-height: 1.05; }
.tr-date b { font-size: 18px; }
.tr-date span { font-size: 11px; font-weight: 700; text-transform: uppercase; }
`
