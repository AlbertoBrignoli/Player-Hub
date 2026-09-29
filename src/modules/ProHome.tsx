import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import Icon from '../components/Icon'
import { fmtMatchTime } from '../lib/format'

/* Ufficio del professionista: UNA Home per agente, assicuratore, commercialista,
   preparatore e fisioterapista. Tutti gli atleti insieme (non uno alla volta):
   chi seguo, cosa scade, cosa succede questa settimana.
   RLS: ogni tabella è già ristretta agli atleti del professionista, quindi le
   query trasversali sono semplici .in('player_id', ids), tutte in parallelo. */

type ProRole = 'agente' | 'assicuratore' | 'commercialista' | 'preparatore' | 'fisioterapista'

type RoleCfg = {
  label: string
  table: string
  idCol: string
  profileRoute: string
  mainRoute: string
  action: { label: string; icon: string; route: string }
  fields: string[]          // campi che contano per "profilo completo"
  nameField: string
}

const ROLES: Record<ProRole, RoleCfg> = {
  agente: {
    label: 'Agente sportivo', table: 'crm_agent_profile', idCol: 'agent_id',
    profileRoute: 'agent-profile', mainRoute: 'dashboard',
    action: { label: 'Contratti', icon: 'file', route: 'contracts' },
    fields: ['name', 'photo_url', 'title', 'phone', 'email', 'licence', 'agency_name', 'agency_logo_url'],
    nameField: 'name',
  },
  assicuratore: {
    label: 'Assicuratore', table: 'crm_insurer_profile', idCol: 'insurer_id',
    profileRoute: 'insurer-profile', mainRoute: 'insurance',
    action: { label: 'Polizze', icon: 'layers', route: 'insurance' },
    fields: ['name', 'photo_url', 'title', 'phone', 'email', 'licence', 'agency_name', 'agency_logo_url'],
    nameField: 'name',
  },
  commercialista: {
    label: 'Commercialista', table: 'crm_tax_profile', idCol: 'advisor_id',
    profileRoute: 'tax-profile', mainRoute: 'legaltax',
    action: { label: 'Fisco', icon: 'briefcase', route: 'legaltax' },
    fields: ['name', 'photo_url', 'title', 'phone', 'email', 'licence', 'agency_name', 'agency_logo_url'],
    nameField: 'name',
  },
  preparatore: {
    label: 'Preparatore atletico', table: 'fitness_coach_profile', idCol: 'trainer_id',
    profileRoute: 'coach-profile', mainRoute: 'fitness',
    action: { label: 'Fitness', icon: 'dumbbell', route: 'fitness' },
    fields: ['name', 'photo_url', 'headline', 'experience', 'bio_method', 'education', 'certifications', 'availability'],
    nameField: 'name',
  },
  fisioterapista: {
    label: 'Fisioterapista', table: 'crm_physio_profile', idCol: 'physio_id',
    profileRoute: 'physio-profile', mainRoute: 'physio-office',
    action: { label: 'Studio', icon: 'activity', route: 'physio-office' },
    fields: ['name', 'photo_url', 'title', 'phone', 'email', 'clinic_name', 'city', 'bio'],
    nameField: 'name',
  },
}

// Un colore per atleta: serve solo a riconoscerlo a colpo d'occhio nella settimana.
const ATH_COLORS = ['#0A0A0A', '#DD0088', '#FF6700', '#1F6FEB', '#12A150', '#9A8600', '#2C7A8A', '#E53F00']

type Ath = {
  api_player_id: number
  name: string | null
  photo_url: string | null
  team_name: string | null
  contract_expiry: string | null
  timezone: string | null
}
type Todo = {
  key: string
  pid: number | null
  icon: string
  title: string
  sub: string
  days: number | null       // giorni alla scadenza (negativo = scaduta, null = senza data)
  route: string
}
type TL = {
  key: string
  at: Date
  pid: number
  kind: 'match' | 'event'
  title: string
  sub: string
  allDay?: boolean
}

const DAY = 86400000
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const isoDay = (d: Date) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return x.toISOString().slice(0, 10)
}
// differenza in giorni di calendario (oggi = 0), anche per colonne date "YYYY-MM-DD"
function dayDiff(d: string | Date) {
  const dt = typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d)
  return Math.round((startOfDay(dt).getTime() - startOfDay(new Date()).getTime()) / DAY)
}

export default function ProHome({ goto }: { goto: (r: string) => void }) {
  const { role, session, profile } = useAuth()
  const { athletes, loading: athLoading, setAthleteId } = useAthlete()
  const { t, lang } = useLang()
  const uid = session?.user.id
  const pro = (role && role in ROLES ? role : 'agente') as ProRole
  const cfg = ROLES[pro]
  const locale = lang === 'en' ? 'en-GB' : 'it-IT'

  const ids = useMemo(() => athletes.map(a => a.api_player_id), [athletes])
  const idsKey = ids.join(',')

  const [me, setMe] = useState<Record<string, any>>({})
  const [players, setPlayers] = useState<Ath[]>([])
  const [matches, setMatches] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid || athLoading) return
    let ok = true
    ;(async () => {
      setLoading(true)
      const now = new Date()
      const today = startOfDay(now)
      const weekEnd = new Date(today.getTime() + 8 * DAY)
      const has = ids.length > 0
      const none = Promise.resolve({ data: [] as any[] })
      const plus = (n: number) => isoDay(new Date(today.getTime() + n * DAY))

      // eventi: agente/preparatore vedono tutto dei loro atleti,
      // assicuratore/commercialista solo i propri, fisioterapista niente.
      let evQ: PromiseLike<{ data: any[] | null }> = none
      if (has && pro !== 'fisioterapista') {
        let q = supabase.from('crm_events')
          .select('id, title, type, start_at, end_at, player_id, request_status')
          .in('player_id', ids)
          .gte('start_at', today.toISOString()).lt('start_at', weekEnd.toISOString())
          .order('start_at').limit(200)
        if (pro === 'assicuratore' || pro === 'commercialista') q = q.eq('created_by', uid)
        evQ = q
      }

      // "Da fare" per ruolo
      let roleQ: PromiseLike<{ data: any[] | null }> = none
      let roleQ2: PromiseLike<{ data: any[] | null }> = none
      if (has) {
        if (pro === 'assicuratore') {
          roleQ = supabase.from('crm_insurance_policies')
            .select('id, player_id, title, company, expiry_date, status')
            .in('player_id', ids).neq('status', 'disdetta')
            .not('expiry_date', 'is', null).gte('expiry_date', plus(-30)).lte('expiry_date', plus(60))
            .order('expiry_date')
        } else if (pro === 'commercialista') {
          roleQ = supabase.from('crm_tax_items')
            .select('id, player_id, title, kind, due_date, amount, status')
            .in('player_id', ids).eq('status', 'aperto')
            .not('due_date', 'is', null).lte('due_date', plus(30))
            .order('due_date')
        } else if (pro === 'agente') {
          roleQ = supabase.from('crm_contracts')
            .select('id, player_id, title, counterpart, end_date, status')
            .in('player_id', ids).neq('status', 'expired')
            .not('end_date', 'is', null).gte('end_date', plus(0)).lte('end_date', plus(180))
            .order('end_date')
        } else if (pro === 'preparatore') {
          roleQ = supabase.from('fitness_requests')
            .select('id, player_id, type, created_at')
            .in('player_id', ids).eq('status', 'aperta')
            .order('created_at', { ascending: false })
          roleQ2 = supabase.from('fitness_programs')
            .select('id, player_id, name, start_time, program_date')
            .in('player_id', ids).eq('status', 'published').is('deleted_at', null)
            .eq('program_date', plus(0))
        } else if (pro === 'fisioterapista') {
          roleQ = supabase.from('physio_assessments').select('player_id').in('player_id', ids)
        }
      }

      const [prof, pl, ms, ev, r1, r2, acc] = await Promise.all([
        supabase.from(cfg.table).select('*').eq(cfg.idCol, uid).maybeSingle(),
        has
          ? supabase.from('player').select('api_player_id, name, photo_url, team_name, contract_expiry, timezone').in('api_player_id', ids)
          : none,
        has
          ? supabase.from('matches')
              .select('id, player_id, match_date, opponent, venue, league')
              .in('player_id', ids).gte('match_date', new Date(now.getTime() - 2 * 3600000).toISOString())
              .order('match_date').limit(300)
          : none,
        evQ,
        roleQ,
        roleQ2,
        supabase.from('crm_access_requests').select('id, player_id')
          .eq('requester_id', uid).eq('status', 'pending'),
      ])
      if (!ok) return

      const plist = ((pl.data as Ath[]) || [])
      const pname = (id: number | null) =>
        plist.find(p => p.api_player_id === id)?.name
        || athletes.find(a => a.api_player_id === id)?.name || t('Atleta')

      const list: Todo[] = []
      const rows = (r1.data as any[]) || []
      if (pro === 'assicuratore') {
        rows.forEach(p => list.push({
          key: 'pol' + p.id, pid: p.player_id, icon: 'layers',
          title: p.title || t('Polizza'),
          sub: [pname(p.player_id), p.company].filter(Boolean).join(' · '),
          days: dayDiff(p.expiry_date), route: 'insurance',
        }))
      } else if (pro === 'commercialista') {
        rows.forEach(i => list.push({
          key: 'tax' + i.id, pid: i.player_id, icon: 'briefcase',
          title: i.title || (i.kind === 'pagamento' ? t('Pagamento') : t('Richiesta')),
          sub: pname(i.player_id),
          days: dayDiff(i.due_date), route: 'legaltax',
        }))
      } else if (pro === 'agente') {
        const withContract = new Set<number>()
        rows.forEach(c => {
          withContract.add(c.player_id)
          list.push({
            key: 'ctr' + c.id, pid: c.player_id, icon: 'file',
            title: c.title || t('Contratto in scadenza'),
            sub: [pname(c.player_id), c.counterpart].filter(Boolean).join(' · '),
            days: dayDiff(c.end_date), route: 'contracts',
          })
        })
        // scadenza del contratto col club salvata sulla scheda atleta
        plist.forEach(p => {
          if (!p.contract_expiry || withContract.has(p.api_player_id)) return
          const d = dayDiff(p.contract_expiry)
          if (d >= 0 && d <= 180) list.push({
            key: 'pce' + p.api_player_id, pid: p.api_player_id, icon: 'file',
            title: t('Contratto col club in scadenza'),
            sub: [p.name, p.team_name].filter(Boolean).join(' · '),
            days: d, route: 'contracts',
          })
        })
      } else if (pro === 'preparatore') {
        rows.forEach(r => list.push({
          key: 'req' + r.id, pid: r.player_id, icon: 'inbox',
          title: r.type === 'programma' ? t('Richiede un programma') : t('Vuole prenotare un allenamento'),
          sub: pname(r.player_id),
          days: null, route: 'fitness',
        }))
        ;((r2.data as any[]) || []).forEach(s => list.push({
          key: 'ses' + s.id, pid: s.player_id, icon: 'dumbbell',
          title: s.name || t('Seduta'),
          sub: [pname(s.player_id), s.start_time ? String(s.start_time).slice(0, 5) : null].filter(Boolean).join(' · '),
          days: 0, route: 'fitness',
        }))
      } else if (pro === 'fisioterapista') {
        const assessed = new Set(rows.map(a => a.player_id))
        ids.filter(id => !assessed.has(id)).forEach(id => list.push({
          key: 'ass' + id, pid: id, icon: 'activity',
          title: t('Prima valutazione da registrare'),
          sub: pname(id),
          days: null, route: 'physio-office',
        }))
      }
      const pending = ((acc.data as any[]) || []).length
      if (pending > 0) list.push({
        key: 'acc', pid: null, icon: 'send',
        title: pending === 1 ? t('1 richiesta di collegamento in attesa') : t('{n} richieste di collegamento in attesa').replace('{n}', String(pending)),
        sub: t("L'atleta deve accettare dalla sua area"),
        days: null, route: 'my-athletes',
      })
      // più urgente prima: senza data (richieste) in cima, poi per scadenza
      const rank = (x: Todo) => x.key === 'acc' ? 1e6 : x.days == null ? -1e6 : x.days
      list.sort((a, b) => rank(a) - rank(b))

      setMe((prof.data as any) || {})
      setPlayers(plist)
      setMatches((ms.data as any[]) || [])
      setEvents((ev.data as any[]) || [])
      setTodos(list)
      setLoading(false)
    })()
    return () => { ok = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, pro, idsKey, athLoading])

  // ---------- dati derivati ----------
  const athList: Ath[] = useMemo(() => athletes.map(a => {
    const p = players.find(x => x.api_player_id === a.api_player_id)
    return {
      api_player_id: a.api_player_id,
      name: p?.name ?? a.name, photo_url: p?.photo_url ?? a.photo_url ?? null,
      team_name: p?.team_name ?? null, contract_expiry: p?.contract_expiry ?? null,
      timezone: p?.timezone ?? a.timezone ?? null,
    }
  }), [athletes, players])

  const colorOf = (pid: number) => {
    const i = ids.indexOf(pid)
    return ATH_COLORS[(i < 0 ? 0 : i) % ATH_COLORS.length]
  }
  const nameOf = (pid: number) => athList.find(a => a.api_player_id === pid)?.name || t('Atleta')
  const tzOf = (pid: number) => athList.find(a => a.api_player_id === pid)?.timezone || 'Europe/Rome'

  const nextMatch = useMemo(() => {
    const m: Record<number, any> = {}
    matches.forEach(x => { if (x.player_id && !m[x.player_id]) m[x.player_id] = x })
    return m
  }, [matches])

  const attention = useMemo(() => {
    const s = new Set<number>()
    todos.forEach(x => { if (x.pid != null && (x.days == null || x.days <= 14)) s.add(x.pid) })
    return s
  }, [todos])

  const week: TL[] = useMemo(() => {
    const end = startOfDay(new Date()).getTime() + 7 * DAY
    const out: TL[] = []
    matches.forEach(m => {
      const at = new Date(m.match_date)
      if (at.getTime() >= end) return
      const vs = m.venue === 'away' ? '@' : 'vs'
      out.push({
        key: 'm' + m.id, at, pid: m.player_id, kind: 'match',
        title: `${vs} ${m.opponent || t('Partita')}`,
        sub: [nameOf(m.player_id), m.league].filter(Boolean).join(' · '),
      })
    })
    events.forEach(e => {
      if (!e.player_id) return
      const at = new Date(e.start_at)
      out.push({
        key: 'e' + e.id, at, pid: e.player_id, kind: 'event',
        title: e.title || t('Impegno'),
        sub: nameOf(e.player_id) + (e.request_status === 'da_confermare' ? ` · ${t('da confermare')}` : ''),
      })
    })
    return out.sort((a, b) => a.at.getTime() - b.at.getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, events, athList])

  const completion = useMemo(() => {
    const filled = cfg.fields.filter(f => {
      const v = me?.[f]
      return v != null && String(v).trim() !== ''
    }).length
    return Math.round((filled / cfg.fields.length) * 100)
  }, [me, cfg])

  // ---------- azioni ----------
  const open = (pid: number | null, route: string) => {
    if (pid != null) setAthleteId(pid)
    goto(route)
  }

  const h = new Date().getHours()
  const greeting = t(h < 13 ? 'Buongiorno' : h < 19 ? 'Buon pomeriggio' : 'Buonasera')
  const fullName = (me?.[cfg.nameField] as string) || profile?.full_name || ''
  const firstName = fullName.split(' ')[0]

  const dueLabel = (d: number | null) => {
    if (d == null) return t('Da gestire')
    if (d < 0) return t('Scaduta')
    if (d === 0) return t('Oggi')
    if (d === 1) return t('Domani')
    return t('fra {n} giorni').replace('{n}', String(d))
  }
  const dueTone = (d: number | null) =>
    d == null || d <= 7 ? 'hot' : d <= 30 ? 'warm' : ''

  const matchWhen = (iso: string) => {
    const d = dayDiff(iso)
    if (d <= 0) return t('Oggi')
    if (d === 1) return t('Domani')
    return t('fra {n} giorni').replace('{n}', String(d))
  }

  // ---------- render ----------
  if (loading || athLoading) return <Skeleton />

  const header = (
    <header className="pro-id">
      {me?.photo_url
        ? <img className="pro-id-ph" src={me.photo_url} alt="" />
        : <div className="pro-id-ph pro-id-ini" aria-hidden="true">{(firstName || cfg.label).slice(0, 1)}</div>}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="pro-id-hi pro-trunc">{greeting}{firstName ? `, ${firstName}` : ''}</div>
        <h1 className="pro-id-name pro-trunc">{t('Il tuo ufficio')}</h1>
        <div className="pro-id-role pro-trunc">{t(cfg.label)}</div>
      </div>
      <button className="pro-ring" onClick={() => goto(cfg.profileRoute)}
        aria-label={t('Profilo completo al {n}%').replace('{n}', String(completion))}>
        <Ring pct={completion} />
        <span className="pro-ring-l">{t('Profilo')}</span>
      </button>
    </header>
  )

  const board = (
    <section className="pro-board" aria-label={t('Riepilogo')}>
      <div><span className="v">{athList.length}</span><span className="l">{athList.length === 1 ? t('Atleta') : t('Atleti')}</span></div>
      <div><span className="v">{todos.length}</span><span className="l">{t('Da fare')}</span></div>
      <div><span className="v">{week.length}</span><span className="l">{t('In settimana')}</span></div>
    </section>
  )

  const completeCard = completion < 100 ? (
    <section className="pro-complete">
      <div className="pro-complete-ic"><Icon name="user" size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pro-complete-t">{t('Completa il profilo')}</div>
        <div className="pro-complete-s">{t('Gli atleti ti vedono nella loro Home tra i referenti')}</div>
      </div>
      <button className="pro-btn" onClick={() => goto(cfg.profileRoute)}>{t('Completa')}</button>
    </section>
  ) : null

  const qas = [
    { key: 'ath', label: t('Atleti'), icon: 'users', route: 'my-athletes' },
    { key: 'inv', label: t('Invita'), icon: 'plus', route: 'my-athletes', primary: true },
    { key: 'ag', label: t('Agenda'), icon: 'calendar', route: 'agenda' },
    { key: 'chat', label: t('Chat'), icon: 'message', route: 'messages' },
    { key: 'role', label: t(cfg.action.label), icon: cfg.action.icon, route: cfg.action.route },
  ]
  const quick = (
    <nav className="pro-qas" aria-label={t('Azioni rapide')}>
      {qas.map(q => (
        <button key={q.key} className={`pro-qa${q.primary ? ' primary' : ''}`} onClick={() => goto(q.route)}>
          <span className="pro-qa-ic"><Icon name={q.icon} size={21} strokeWidth={1.7} /></span>
          <span className="pro-qa-l">{q.label}</span>
        </button>
      ))}
    </nav>
  )

  const athSection = (
    <section className="pro-sec">
      <div className="pro-h"><span>{t('I miei atleti')}</span><span className="n">{athList.length}</span></div>
      {athList.length === 0 ? (
        <div className="pro-empty">
          <div className="pro-empty-ic"><Icon name="users" size={24} strokeWidth={1.6} /></div>
          <div className="pro-empty-t">{t('Il tuo ufficio è pronto')}</div>
          <div className="pro-empty-s">{t("Invita i tuoi atleti: con il loro sì vedi partite, scadenze e documenti di tutti in un'unica Home.")}</div>
          <button className="pro-btn" onClick={() => goto('my-athletes')}>
            <Icon name="plus" size={16} /> {t('Invita il tuo primo atleta')}
          </button>
        </div>
      ) : (
        <div className="pro-aths">
          {athList.map(a => {
            const nm = nextMatch[a.api_player_id]
            const warn = attention.has(a.api_player_id)
            return (
              <button key={a.api_player_id} className="pro-ath" onClick={() => open(a.api_player_id, cfg.mainRoute)}
                aria-label={`${a.name || t('Atleta')}${warn ? ` · ${t('richiede attenzione')}` : ''}`}>
                <span className="pro-ath-top">
                  {a.photo_url
                    ? <img className="pro-ath-ph" src={a.photo_url} alt="" />
                    : <span className="pro-ath-ph pro-id-ini">{(a.name || '?').slice(0, 1)}</span>}
                  <span className="pro-ath-sw" style={{ background: colorOf(a.api_player_id) }} aria-hidden="true" />
                  {warn && <span className="pro-ath-warn" title={t('Richiede attenzione')} />}
                </span>
                <span className="pro-ath-n pro-trunc">{a.name || t('Atleta')}</span>
                <span className="pro-ath-c pro-trunc">{a.team_name || ' '}</span>
                <span className={`pro-ath-m${nm ? '' : ' none'}`}>
                  <Icon name="ball" size={12} />
                  <span className="pro-trunc">{nm ? matchWhen(nm.match_date) : t('Nessuna partita')}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )

  const shownTodos = todos.slice(0, 6)
  const todoSection = athList.length > 0 || todos.length > 0 ? (
    <section className="pro-sec">
      <div className="pro-h"><span>{t('Da fare')}</span>{todos.length > 0 && <span className="n">{todos.length}</span>}</div>
      {todos.length === 0 ? (
        <div className="pro-card pro-calm">
          <span className="pro-calm-ic"><Icon name="check" size={16} /></span>
          <div>
            <div style={{ fontWeight: 650, fontSize: 13.5 }}>{t('Tutto in ordine')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('Nessuna scadenza vicina per i tuoi atleti')}</div>
          </div>
        </div>
      ) : (
        <div className="pro-card">
          {shownTodos.map(x => (
            <button key={x.key} className="pro-todo" onClick={() => open(x.pid, x.route)}>
              <span className={`pro-todo-ic ${dueTone(x.days)}`}><Icon name={x.icon} size={16} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="pro-todo-t pro-trunc">{x.title}</span>
                <span className="pro-todo-s pro-trunc">
                  {x.pid != null && <span className="pro-dot" style={{ background: colorOf(x.pid) }} aria-hidden="true" />}
                  {x.sub}
                </span>
              </span>
              <span className={`pro-due ${dueTone(x.days)}`}>{dueLabel(x.days)}</span>
            </button>
          ))}
          {todos.length > shownTodos.length && (
            <div className="pro-more">{t('+ altri {n}').replace('{n}', String(todos.length - shownTodos.length))}</div>
          )}
        </div>
      )}
    </section>
  ) : null

  // settimana raggruppata per giorno
  const days: { key: string; date: Date; items: TL[] }[] = []
  week.forEach(it => {
    const k = isoDay(it.at)
    let g = days.find(d => d.key === k)
    if (!g) { g = { key: k, date: startOfDay(it.at), items: [] }; days.push(g) }
    g.items.push(it)
  })

  const weekSection = (
    <section className="pro-sec">
      <div className="pro-h"><span>{t('Questa settimana')}</span>{week.length > 0 && <span className="n">{week.length}</span>}</div>
      {week.length === 0 ? (
        <div className="pro-card pro-calm">
          <span className="pro-calm-ic"><Icon name="calendar" size={16} /></span>
          <div>
            <div style={{ fontWeight: 650, fontSize: 13.5 }}>{t('Settimana libera')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
              {athList.length ? t('Nessuna partita o impegno nei prossimi 7 giorni') : t('Qui vedrai partite e impegni di tutti i tuoi atleti')}
            </div>
          </div>
        </div>
      ) : (
        <div className="pro-card">
          {days.map(d => {
            const dd = dayDiff(d.date)
            const head = dd === 0 ? t('Oggi') : dd === 1 ? t('Domani')
              : d.date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
            return (
              <div key={d.key} className="pro-tl-day">
                <div className="pro-tl-dh">{head}</div>
                {d.items.map(it => (
                  <button key={it.key} className="pro-tl-row" onClick={() => open(it.pid, it.kind === 'match' ? cfg.mainRoute : 'agenda')}>
                    <span className="pro-tl-time">
                      {it.kind === 'match'
                        ? fmtMatchTime(it.at.toISOString(), tzOf(it.pid))
                        : it.at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="pro-tl-bar" style={{ background: colorOf(it.pid) }} aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="pro-tl-t pro-trunc">
                        {it.kind === 'match' && <Icon name="ball" size={13} style={{ marginRight: 5, verticalAlign: -2 }} />}
                        {it.title}
                      </span>
                      <span className="pro-tl-s pro-trunc">{it.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
          <button className="pro-link" onClick={() => goto('agenda')}>
            {t('Apri agenda')} <Icon name="chevron-right" size={14} />
          </button>
        </div>
      )}
    </section>
  )

  return (
    <div className="pro">
      <style>{PRO_CSS}</style>
      <div className="pro-col">
        {header}
        {board}
        {completeCard}
        {quick}
        {athSection}
        {todoSection}
      </div>
      <div className="pro-col">
        {weekSection}
      </div>
    </div>
  )
}

function Ring({ pct }: { pct: number }) {
  const r = 19, c = 2 * Math.PI * r
  return (
    <span className="pro-ring-g">
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle cx="23" cy="23" r={r} fill="none" stroke={pct >= 100 ? 'var(--green)' : 'var(--ink)'} strokeWidth="4"
          strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 23 23)" />
      </svg>
      <span className="pro-ring-v">{pct}%</span>
    </span>
  )
}

function Skeleton() {
  return (
    <div className="pro" aria-busy="true">
      <style>{PRO_CSS}</style>
      <div className="pro-col">
        <div className="pro-id">
          <div className="pro-sk" style={{ width: 52, height: 52, borderRadius: 15 }} />
          <div style={{ flex: 1 }}>
            <div className="pro-sk" style={{ width: '40%', height: 12 }} />
            <div className="pro-sk" style={{ width: '70%', height: 20, marginTop: 8 }} />
          </div>
        </div>
        <div className="pro-sk" style={{ height: 86, borderRadius: 18 }} />
        <div className="pro-sk" style={{ height: 70, borderRadius: 16 }} />
        <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
          {[0, 1, 2].map(i => <div key={i} className="pro-sk" style={{ flex: '0 0 150px', height: 150, borderRadius: 16 }} />)}
        </div>
      </div>
      <div className="pro-col">
        <div className="pro-sk" style={{ height: 260, borderRadius: 16 }} />
      </div>
    </div>
  )
}

const PRO_CSS = `
.pro { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.pro-col { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.pro-sec { min-width: 0; width: 100%; }
.pro-trunc { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pro-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-weight: 650; font-size: 13px; color: var(--text-dim); margin: 0 2px 10px; }
.pro-h .n { font-weight: 600; font-size: 12px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.pro-card { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }

/* identità + anello profilo */
.pro-id { display: flex; align-items: center; gap: 14px; }
.pro-id-ph { width: 52px; height: 52px; border-radius: 15px; object-fit: cover; border: 1px solid var(--border-2); flex-shrink: 0; }
.pro-id-ini { display: grid; place-items: center; background: var(--ink); color: var(--yellow); font-weight: 700; font-size: 19px; border: 0; }
.pro-id-hi { font-size: 12.5px; color: var(--text-faint); font-weight: 500; }
.pro-id-name { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; text-transform: uppercase; font-size: 21px; line-height: 1.05; margin: 2px 0 0; }
.pro-id-role { font-size: 12.5px; color: var(--text-dim); margin-top: 3px; }
.pro-ring { display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: 0; padding: 0; cursor: pointer; min-width: 52px; min-height: 44px; flex-shrink: 0; transition: transform .12s; }
.pro-ring-g { position: relative; width: 46px; height: 46px; display: block; }
.pro-ring-g svg { display: block; }
.pro-ring-g circle + circle { transition: stroke-dasharray .6s cubic-bezier(.16,1,.3,1); }
.pro-ring-v { position: absolute; inset: 0; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.pro-ring-l { font-size: 10.5px; font-weight: 600; color: var(--text-faint); }

/* riepilogo: tabellone scuro come la partita dell'atleta */
.pro-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); background: var(--card-dark); color: #fff; border-radius: 18px; padding: 18px 6px; box-shadow: 0 10px 28px -16px rgba(10,10,10,.5); }
.pro-board > div { display: flex; flex-direction: column; align-items: center; min-width: 0; }
.pro-board > div + div { border-left: 1px solid rgba(255,255,255,.14); }
.pro-board .v { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; font-size: 28px; line-height: 1; font-variant-numeric: tabular-nums; }
.pro-board > div:nth-child(2) .v { color: var(--yellow); }
.pro-board .l { font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,.72); margin-top: 7px; }

/* completa il profilo */
.pro-complete { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 16px; background: var(--yellow-soft); border: 1px solid rgba(154,134,0,.22); }
.pro-complete-ic { width: 38px; height: 38px; border-radius: 12px; background: var(--ink); color: var(--yellow); display: grid; place-items: center; flex-shrink: 0; }
.pro-complete-t { font-weight: 700; font-size: 13.5px; color: var(--ink); }
.pro-complete-s { font-size: 12px; color: var(--text-dim); margin-top: 2px; line-height: 1.35; }
.pro-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: 12px; border: 0; background: var(--yellow); color: var(--ink); font-weight: 700; font-size: 13.5px; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: transform .12s, background .15s; }
.pro-btn:hover { background: var(--yellow-2); }
.pro-complete .pro-btn { background: var(--ink); color: var(--yellow); }

/* azioni rapide */
.pro-qas { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.pro-qa { display: flex; flex-direction: column; align-items: center; gap: 7px; min-height: 44px; padding: 2px 0; background: none; border: none; cursor: pointer; min-width: 0; transition: transform .12s; }
.pro-qa-ic { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--border); color: var(--text); transition: border-color .15s; }
.pro-qa:hover .pro-qa-ic { border-color: var(--border-2); }
.pro-qa.primary .pro-qa-ic { background: var(--yellow); border-color: var(--yellow); color: var(--ink); box-shadow: 0 6px 18px -8px rgba(10,10,10,.35); }
.pro-qa-l { font-size: 12px; font-weight: 600; color: var(--text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* atleti: carosello su mobile, griglia su desktop */
.pro-aths { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -16px; padding: 0 16px 4px; scroll-padding-inline: 16px; scrollbar-width: none; }
.pro-aths::-webkit-scrollbar { display: none; }
.pro-ath { scroll-snap-align: start; flex: 0 0 150px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; text-align: left; cursor: pointer; min-width: 0; transition: border-color .15s, box-shadow .15s, transform .12s; }
.pro-ath:hover { border-color: var(--border-2); box-shadow: var(--shadow-sm); }
.pro-ath-top { position: relative; margin-bottom: 8px; }
.pro-ath-ph { width: 56px; height: 56px; border-radius: 15px; object-fit: cover; display: grid; }
.pro-ath-sw { position: absolute; left: -2px; bottom: -2px; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--surface); }
.pro-ath-warn { position: absolute; right: -4px; top: -4px; width: 14px; height: 14px; border-radius: 50%; background: var(--club); border: 2px solid var(--surface); }
.pro-ath-n { font-size: 14px; font-weight: 700; color: var(--text); width: 100%; }
.pro-ath-c { font-size: 11.5px; color: var(--text-faint); width: 100%; }
.pro-ath-m { display: flex; align-items: center; gap: 5px; margin-top: 8px; padding: 5px 8px; border-radius: 8px; background: var(--bg-2); font-size: 11.5px; font-weight: 600; color: var(--text); max-width: 100%; min-width: 0; }
.pro-ath-m.none { color: var(--text-faint); font-weight: 500; }

/* vuoto */
.pro-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px 18px; border-radius: 18px; background: var(--surface); border: 1px dashed var(--border-2); }
.pro-empty-ic { width: 44px; height: 44px; border-radius: 14px; background: var(--yellow); color: var(--ink); display: grid; place-items: center; margin-bottom: 6px; }
.pro-empty-t { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; text-transform: uppercase; font-size: 16px; line-height: 1.15; }
.pro-empty-s { font-size: 13px; color: var(--text-dim); line-height: 1.45; max-width: 46ch; margin-bottom: 8px; }

/* da fare */
.pro-todo { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 9px 14px; background: none; border: 0; text-align: left; cursor: pointer; transition: background .15s; }
.pro-todo + .pro-todo { border-top: 1px solid var(--border); }
.pro-todo:hover { background: var(--surface-2); }
.pro-todo-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; background: var(--bg-2); color: var(--text-dim); }
.pro-todo-ic.hot { background: var(--ink); color: var(--yellow); }
.pro-todo-ic.warm { background: var(--yellow-soft); color: var(--ink); }
.pro-todo-t { font-size: 13.5px; font-weight: 650; color: var(--text); }
.pro-todo-s { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
.pro-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 0; }
.pro-due { flex-shrink: 0; font-size: 11.5px; font-weight: 700; padding: 4px 8px; border-radius: 8px; background: var(--bg-2); color: var(--text-dim); white-space: nowrap; font-variant-numeric: tabular-nums; }
.pro-due.hot { background: var(--yellow); color: var(--ink); }
.pro-due.warm { background: var(--yellow-soft); color: var(--ink); }
.pro-more { padding: 10px 14px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-faint); text-align: center; }
.pro-calm { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.pro-calm-ic { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-2); color: var(--text-dim); display: grid; place-items: center; flex-shrink: 0; }

/* settimana */
.pro-tl-day + .pro-tl-day { border-top: 1px solid var(--border); }
.pro-tl-dh { padding: 10px 14px 2px; font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--text-faint); }
.pro-tl-row { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 14px; background: none; border: 0; text-align: left; cursor: pointer; transition: background .15s; }
.pro-tl-row:hover { background: var(--surface-2); }
.pro-tl-time { width: 42px; flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.pro-tl-bar { width: 3px; align-self: stretch; margin: 4px 0; border-radius: 2px; flex-shrink: 0; }
.pro-tl-t { font-size: 13.5px; font-weight: 650; color: var(--text); }
.pro-tl-s { font-size: 12px; color: var(--text-faint); margin-top: 1px; }
.pro-link { width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 44px; border: 0; border-top: 1px solid var(--border); background: none; font-size: 12.5px; font-weight: 650; color: var(--text); cursor: pointer; }
.pro-link:hover { background: var(--surface-2); }

/* skeleton */
.pro-sk { background: var(--bg-2); border-radius: 8px; }
@media (prefers-reduced-motion: no-preference) {
  .pro-sk { animation: pro-pulse 1.4s ease-in-out infinite; }
  .pro-btn:active, .pro-qa:active, .pro-ath:active, .pro-ring:active, .pro-todo:active, .pro-tl-row:active { transform: scale(.98); }
}
@keyframes pro-pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) { .pro-ring-g circle + circle { transition: none; } }

@media (min-width: 881px) {
  .pro-aths { margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); overflow: visible; }
  .pro-ath { flex: none; width: 100%; }
}
@media (max-width: 880px) {
  .pro { display: flex; flex-direction: column; align-items: stretch; gap: 22px; }
}
@media (max-width: 380px) {
  .pro-complete { flex-wrap: wrap; }
  .pro-complete .pro-btn { width: 100%; }
  .pro-board .v { font-size: 24px; }
  .pro-qa-ic { width: 44px; height: 44px; }
}
`
