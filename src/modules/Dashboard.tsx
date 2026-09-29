import { teamLogo, leagueLogo } from '../lib/logos'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { QuickAddModal, useQuickAddPermissions } from '../components/QuickAdd'
import HomeContacts from './home/HomeContacts'
import { fmtDate, fmtMatchTime, daysUntil, isImageFile } from '../lib/format'
import type { Player, EventItem, Contract, Match, StatsMatch, EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'
const CHIP: Record<string, { l: string; c: string }> = {
  da_preparare: { l: 'Da preparare', c: 'ed-chip-gold' },
  copy_pronto: { l: 'Copy pronto', c: 'ed-chip-blue' },
  grafica_caricata: { l: 'Grafica', c: 'ed-chip-gold' },
  pronto: { l: 'Pronto', c: 'ed-chip-green' },
}

// Home = pagina di punta, pensata prima per il telefono (375px).
// Ordine: 1 identità, 2 azioni rapide, 3 da fare ora, 4 prossima partita,
// 5 prossimi giorni, 6 stagione + ultima partita, 7 referenti.
// Desktop (>880px): colonna sinistra 1-4, destra 5-7. Stesso DOM, nessun `order`.
const HOME_CSS = `
.home { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.home-col { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.home-sec { min-width: 0; width: 100%; }
.home-trunc { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-weight: 650; font-size: 13px; color: var(--text-dim); margin: 0 2px 10px; }
.home-h .n { font-weight: 600; font-size: 12px; color: var(--text-faint); }
.home-card { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; text-align: left; }
button.home-card { cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .12s; }
button.home-card:hover { border-color: var(--border-2); box-shadow: var(--shadow-sm); }
button.home-card:active, .home-qa:active, .home-contact:active { transform: scale(.98); }

/* 1 identita */
.home-id { display: flex; align-items: center; gap: 14px; }
.home-id-ph { width: 52px; height: 52px; border-radius: 15px; object-fit: cover; border: 1px solid var(--border-2); flex-shrink: 0; }
.home-id-hi { font-size: 12.5px; color: var(--text-faint); font-weight: 500; }
.home-id-name { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; text-transform: uppercase; font-size: 21px; line-height: 1.05; margin-top: 2px; }
.home-id-role { font-size: 12.5px; color: var(--text-dim); margin-top: 3px; }

/* 2 azioni rapide */
.home-qas { display: grid; gap: 8px; }
.home-qa { display: flex; flex-direction: column; align-items: center; gap: 7px; min-height: 44px; padding: 2px 0; background: none; border: none; cursor: pointer; transition: transform .12s; }
.home-qa-ic { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--border); color: var(--text); transition: border-color .15s, background .15s; }
.home-qa:hover .home-qa-ic { border-color: var(--border-2); }
.home-qa.primary .home-qa-ic { background: var(--yellow); border-color: var(--yellow); color: var(--ink); }
.home-qa-l { font-size: 12px; font-weight: 600; color: var(--text); }
.home-qa-ic { position: relative; }
.home-qa.primary .home-qa-ic { box-shadow: 0 6px 18px -8px rgba(10,10,10,.35); }
.home-qa-badge { position: absolute; top: -4px; right: -8px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--grad); color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; border: 2px solid var(--bg); font-variant-numeric: tabular-nums; }
.home-score-content { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,.1); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); text-align: left; }
.home-score-content img, .home-score-content-ic { width: 38px; height: 38px; border-radius: 10px; object-fit: cover; flex-shrink: 0; display: grid; place-items: center; background: rgba(255,255,255,.12); }
.home-score-content-k { font-size: 10.5px; color: rgba(255,255,255,.7); font-weight: 600; letter-spacing: .3px; }
.home-score-content-st { color: var(--yellow); }

/* 3 da fare ora */
.home-todo { display: flex; flex-direction: column; gap: 10px; }
.home-thumbs { display: flex; gap: 4px; margin-top: 8px; }
.home-thumbs img { width: 28px; height: 28px; border-radius: 7px; object-fit: cover; display: block; opacity: 0; transition: opacity .25s; }
.home-thumbs img.ok { opacity: 1; }
.home-thumbs img:not(.ok) { display: none; } /* niente buchi mentre carica */
.home-calm { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.home-calm-ic { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-2); color: var(--text-dim); display: grid; place-items: center; flex-shrink: 0; }

/* 4 tabellone prossima partita */
.home-score.ed-hero { height: auto; min-height: 0; padding: 0; border: 1px solid var(--border); display: block; cursor: pointer; }
.home-score-body { position: relative; padding: 16px 16px 16px; }
.home-score .ed-livepill { margin-bottom: 14px; }
.home-score-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; }
.home-team { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; text-align: center; }
.home-team-logo { width: 46px; height: 46px; object-fit: contain; }
.home-team-ini { width: 46px; height: 46px; border-radius: 50%; background: rgba(255,255,255,.1); display: grid; place-items: center; font-weight: 700; font-size: 15px; }
.home-team-n { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; text-transform: uppercase; font-size: 12.5px; line-height: 1.15; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.home-kick { text-align: center; padding: 0 4px; }
.home-kick-t { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; font-size: 22px; line-height: 1; font-variant-numeric: tabular-nums; }
.home-kick-d { font-size: 11px; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; color: rgba(255,255,255,.72); margin-top: 6px; }
.home-score-meta { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.14); font-size: 12px; font-weight: 600; color: rgba(255,255,255,.82); min-width: 0; }
.home-score-meta img { width: 18px; height: 18px; object-fit: contain; flex-shrink: 0; }

/* 5 prossimi giorni */
.home-tl-row { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; }
.home-tl-row + .home-tl-row { border-top: 1px solid var(--border); }
.home-tl-day { width: 44px; flex-shrink: 0; text-align: center; border-radius: 10px; background: var(--bg-2); padding: 5px 0 4px; }
.home-tl-day .w { font-size: 9.5px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--text-faint); }
.home-tl-day .d { font-weight: 700; font-size: 16px; line-height: 1.1; color: var(--text); font-variant-numeric: tabular-nums; }
.home-tl-time { width: 42px; flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.home-tl-t { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; color: var(--text); }

/* 6 stagione */
.home-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 16px 6px 14px; }
.home-stat { text-align: center; min-width: 0; }
.home-stat + .home-stat { border-left: 1px solid var(--border); }
.home-stat .v { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; font-size: 24px; line-height: 1; font-variant-numeric: tabular-nums; }
.home-stat .l { font-size: 11.5px; color: var(--text-faint); margin-top: 6px; font-weight: 500; }
.home-last { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--border); font-size: 12.5px; min-width: 0; }
.home-last .k { color: var(--text-faint); font-weight: 600; flex-shrink: 0; }
.home-last .m { flex: 1; min-width: 0; font-weight: 650; color: var(--text); }
.home-last .x { color: var(--text-faint); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.home-note { font-size: 11.5px; color: var(--text-faint); padding: 0 14px 12px; text-align: center; }

/* 7 referenti */
.home-contacts { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -16px; padding: 0 16px 4px; scroll-padding-inline: 16px; scrollbar-width: none; }
.home-contacts::-webkit-scrollbar { display: none; }
.home-contact { scroll-snap-align: start; flex: 0 0 auto; width: 172px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 60px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; text-align: left; cursor: pointer; transition: border-color .15s, transform .12s; }
.home-contact:hover { border-color: var(--border-2); }
.home-contact-av { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.home-contact-ini { display: grid; place-items: center; background: var(--bg-2); color: var(--text); font-weight: 700; font-size: 13px; }
.home-contact-n { font-size: 13px; font-weight: 650; color: var(--text); }
.home-contact-r { font-size: 11.5px; color: var(--text-faint); margin-top: 1px; }

@media (min-width: 881px) {
  .home-contacts { margin: 0; padding: 0; flex-direction: column; overflow: visible; }
  .home-contact { width: 100%; }
}
@media (max-width: 880px) {
  .home { display: flex; flex-direction: column; align-items: stretch; gap: 24px; }
  .home-col { gap: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .home-thumbs img { transition: none; }
  button.home-card:active, .home-qa:active, .home-contact:active { transform: none; }
}
`

// Nome corto per il tabellone: via sigle societarie e anni di fondazione.
function shortTeam(name: string | null | undefined) {
  if (!name) return ''
  const s = name
    .replace(/\b(F\.?C\.?|A\.?F\.?C\.?|S\.?S\.?C\.?|A\.?C\.?|S\.?C\.?|U\.?S\.?|S\.?S\.?|CF|FK|PAE|GFC|Calcio|Football Club)\b/gi, '')
    .replace(/\b(18|19|20)\d{2}\b/g, '')
    .replace(/\s{2,}/g, ' ').trim()
  return s || name
}

function Team({ name, logo }: { name: string | null; logo: string | null }) {
  const [broken, setBroken] = useState(false)
  const short = shortTeam(name)
  return (
    <div className="home-team">
      {logo && !broken
        ? <img className="home-team-logo" src={logo} alt="" onError={() => setBroken(true)} />
        : <span className="home-team-ini">{short.slice(0, 1)}</span>}
      <span className="home-team-n" title={name || ''}>{short}</span>
    </div>
  )
}


export default function Dashboard({ goto }: { goto: (r: string) => void }) {
  const { profile, role, isTeam } = useAuth()
  const { athleteId, athleteTz } = useAthlete()
  const { t, lang } = useLang()
  const { canEvent, canTask } = useQuickAddPermissions()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [lastMatch, setLastMatch] = useState<StatsMatch | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [nextContent, setNextContent] = useState<EditorialEntry | null>(null)
  const [nextContentThumb, setNextContentThumb] = useState<string | null>(null)
  const [toApprove, setToApprove] = useState<MediaItem[]>([])
  const [accessPending, setAccessPending] = useState(0)
  const [adding, setAdding] = useState<'event' | 'task' | null>(null)
  const isPlayer = role === 'player'

  useEffect(() => {
    if (!athleteId) return
    (async () => {
      const todayKey = new Date().toISOString().slice(0, 10)
      const pid = athleteId
      const [p, m, t, ev, ct, ed, ph, rq] = await Promise.all([
        supabase.from('player').select('*').eq('api_player_id', pid).maybeSingle(),
        supabase.from('matches').select('*').eq('player_id', pid).order('match_date', { ascending: true }),
        supabase.from('player_stats_match').select('*').eq('player_id', pid).order('match_date', { ascending: false }).limit(1),
        supabase.from('crm_events').select('*').eq('player_id', pid).gte('start_at', new Date().toISOString()).order('start_at').limit(5),
        supabase.from('crm_contracts').select('*').eq('player_id', pid),
        supabase.from('crm_editorial').select('*').eq('player_id', pid).gte('entry_date', todayKey)
          .neq('status', 'pubblicato').order('entry_date').limit(1).maybeSingle(),
        supabase.from('crm_media').select('*').eq('player_id', pid).eq('status', 'da_approvare').order('created_at', { ascending: false }),
        isPlayer
          ? supabase.from('crm_access_requests').select('id').eq('player_id', pid).eq('status', 'pending')
          : Promise.resolve({ data: [] as any[] }),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      {
        const nowIso = new Date().toISOString()
        const pastPlayed = (((m.data as any[]) || [])
          .filter(x => x.match_date && x.match_date < nowIso && (x.minutes ?? 0) > 0)
          .sort((a, b) => (b.match_date || '').localeCompare(a.match_date || '')))
        const lm = pastPlayed[0]
        if (lm) {
          const isHome = (lm.venue || '').toLowerCase() === 'home'
          const hs = lm.team_score == null ? null : (isHome ? lm.team_score : lm.opponent_score)
          const as = lm.team_score == null ? null : (isHome ? lm.opponent_score : lm.team_score)
          const score = (hs != null && as != null) ? ` ${hs}:${as}` : ''
          setLastMatch({ match_name: `${shortTeam(lm.home_team)} - ${shortTeam(lm.away_team)}${score}`, match_date: lm.match_date, minutes: lm.minutes ?? 0, competition: lm.league } as any)
        } else {
          setLastMatch(((t.data as StatsMatch[]) || [])[0] || null)
        }
      }
      setEvents((ev.data as EventItem[]) || [])
      setContracts((ct.data as Contract[]) || [])
      setAccessPending(((rq.data as any[]) || []).length)
      const content = ed.data as EditorialEntry | null
      setNextContent(content)
      const photos = (ph.data as MediaItem[]) || []
      setToApprove(photos)
      setLoading(false)

      // miniature dopo il primo disegno: la Home non aspetta le immagini
      if (content) {
        const { data: cm } = await supabase.from('crm_media').select('storage_path,file_name')
          .eq('editorial_id', content.id).limit(4)
        const img = (cm || []).find(x => isImageFile((x as any).file_name))
        if (img) {
          const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl((img as any).storage_path, 3600)
          if (s?.signedUrl) setNextContentThumb(s.signedUrl)
        }
      }
    })()
  }, [athleteId, isPlayer])

  if (loading) return <Spinner />

  // ---- dati derivati ----
  const locale = lang === 'en' ? 'en-GB' : 'it-IT'
  const nextMatch = matches.find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  // Stagione corrente = quella della partita piu recente; presenze/rating/gol si riferiscono a essa.
  const curSeason = matches.length
    ? matches.reduce((a, b) => ((a.match_date || '') > (b.match_date || '') ? a : b)).season
    : null
  const inSeason = (m: any) => curSeason == null || m.season === curSeason
  const played = matches.filter(m => inSeason(m) && m.minutes != null && m.minutes > 0)
  const presenze = played.length
  const minutes = played.reduce((s, m) => s + (m.minutes || 0), 0)
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
  const goals = matches.filter(inSeason).reduce((s, m) => s + (m.goals || 0), 0)
  const nextContractExpiry = contracts
    .filter(c => c.end_date).map(c => ({ c, d: daysUntil(c.end_date) }))
    .filter(x => x.d != null && x.d >= 0).sort((a, b) => (a.d! - b.d!))[0]

  const h = new Date().getHours()
  const greeting = t(h < 13 ? 'Buongiorno' : h < 19 ? 'Buon pomeriggio' : 'Buonasera')
  const firstName = (profile?.full_name || '').split(' ')[0]
  const roleLine = player
    ? [player.position, player.team_name, player.shirt_number != null ? `#${player.shirt_number}` : null].filter(Boolean).join(' · ')
    : t('Gestione riservata AUVI')

  // ---- 1 identita ----
  const identity = (
    <header className="home-sec home-id">
      {player?.photo_url
        ? <img className="home-id-ph" src={player.photo_url} alt="" />
        : <div className="avatar" style={{ width: 52, height: 52, fontSize: 19, borderRadius: 15, flexShrink: 0 }}>{(player?.name || firstName || 'A')[0]}</div>}
      <div style={{ minWidth: 0 }}>
        <div className="home-id-hi home-trunc">{greeting}{firstName ? `, ${firstName}` : ''}</div>
        <h1 className="home-id-name home-trunc">{player?.name || t('Atleta')}</h1>
        <div className="home-id-role home-trunc">{roleLine}</div>
      </div>
    </header>
  )

  // ---- 2 azioni rapide (sostituiscono il "+" globale) ----
  type QA = { key: string; label: string; icon: string; run: () => void; badge?: number }
  const qas: QA[] = []
  // Foto per prima: sostituisce la vecchia card "Foto da approvare" (stesso posto, meno spazio)
  qas.push(isTeam
    ? { key: 'media', label: t('Foto'), icon: 'image', run: () => goto('media?tab=cartelle'), badge: toApprove.length }
    : { key: 'media', label: t('Foto'), icon: 'image', run: () => goto('media?tab=cartelle'), badge: toApprove.length })
  if (canEvent) qas.push({ key: 'event', label: t('Impegno'), icon: 'calendar', run: () => setAdding('event') })
  if (canTask) qas.push({ key: 'task', label: t('Task'), icon: 'check-square', run: () => setAdding('task') })
  qas.push({ key: 'chat', label: t('Chat'), icon: 'message', run: () => goto('messages') })
  const quick = (
    <nav className="home-sec home-qas" aria-label={t('Azioni rapide')} style={{ gridTemplateColumns: `repeat(${qas.length}, minmax(0, 1fr))` }}>
      {qas.map(q => (
        <button key={q.key} className={`home-qa${q.badge ? ' primary' : ''}`} onClick={q.run}
          aria-label={q.badge ? `${q.label}: ${q.badge} ${t('da approvare')}` : q.label}>
          <span className="home-qa-ic">
            <Icon name={q.icon} size={21} strokeWidth={1.7} />
            {!!q.badge && <span className="home-qa-badge">{q.badge > 99 ? '99+' : q.badge}</span>}
          </span>
          <span className="home-qa-l">{q.label}</span>
        </button>
      ))}
    </nav>
  )

  // ---- 3 da fare ora: solo ciò che non ha già un posto in Home ----
  // (foto → icona Foto delle azioni rapide; prossimo contenuto → tabellone partita)
  const todo = accessPending > 0 ? (
    <section className="home-sec">
      <div className="home-todo">
        <button className="ed-action prio" onClick={() => goto('access-requests')}>
          <div className="ed-action-num">{accessPending}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ed-action-t">{t('Richieste di accesso')}</div>
            <div className="ed-action-s">{t('Professionisti che chiedono di entrare nella tua area')}</div>
          </div>
          <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        </button>
      </div>
    </section>
  ) : null

  // ---- 4 tabellone prossima partita ----
  let hero: ReactNode
  if (nextMatch?.match_date) {
    const d = new Date(nextMatch.match_date)
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    const when = days <= 0 ? t('Oggi') : days === 1 ? t('Domani') : `${t('Fra')} ${days} ${t('giorni')}`
    const dayLabel = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: athleteTz || undefined }).replace(/\./g, '')
    const home = (nextMatch.venue || '').toLowerCase() === 'home'
    const lg = leagueLogo(nextMatch.league)
    hero = (
      <button className="ed-hero home-score home-sec" onClick={() => goto(nextContent ? `editorial?entry=${nextContent.id}` : 'performance')}
        aria-label={`${t('Prossima partita')}: ${nextMatch.home_team} - ${nextMatch.away_team}${nextContent ? ` · ${t('Prossimo contenuto')}` : ''}`}>
        {player?.stadium_photo_url && <img className="ed-hero-img" src={player.stadium_photo_url} alt="" style={{ opacity: .38 }} />}
        <div className="ed-hero-scrim" style={{ background: 'linear-gradient(180deg, rgba(10,10,10,.55) 0%, rgba(10,10,10,.82) 100%)' }} />
        <div className="home-score-body">
          <div className="ed-livepill"><span className="ed-livedot" /><span>{t('Prossima')} · {when}</span></div>
          <div className="home-score-row">
            <Team name={nextMatch.home_team} logo={teamLogo(nextMatch.home_team, nextMatch.home_logo)} />
            <div className="home-kick">
              <div className="home-kick-t">{fmtMatchTime(nextMatch.match_date, athleteTz)}</div>
              <div className="home-kick-d">{dayLabel}</div>
            </div>
            <Team name={nextMatch.away_team} logo={teamLogo(nextMatch.away_team, nextMatch.away_logo)} />
          </div>
          <div className="home-score-meta">
            {lg && <img src={lg} alt="" />}
            {nextMatch.league && <span className="home-trunc" style={{ minWidth: 0 }}>{nextMatch.league}</span>}
            {nextMatch.league && <span style={{ opacity: .45 }}>|</span>}
            <span style={{ flexShrink: 0 }}>{home ? t('In casa') : t('Trasferta')}</span>
          </div>
          {nextContent && (
            <div className="home-score-content">
              {nextContentThumb
                ? <img src={nextContentThumb} alt="" />
                : <span className="home-score-content-ic"><Icon name="image" size={15} strokeWidth={1.6} /></span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="home-score-content-k home-trunc">{t('Contenuto')} · {fmtDate(nextContent.entry_date)} · <span className="home-score-content-st">{t(CHIP[nextContent.status]?.l || 'In lavorazione')}</span></div>
                <div className="home-trunc" style={{ fontWeight: 650, fontSize: 13 }}>{nextContent.title}</div>
              </div>
              <Icon name="chevron-right" size={16} style={{ opacity: .7, flexShrink: 0 }} />
            </div>
          )}
        </div>
      </button>
    )
  } else {
    hero = (
      <button className="home-card home-sec home-calm" onClick={() => goto('performance')}>
        <span className="home-calm-ic"><Icon name="ball" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 14 }}>{t('Prossima partita')}</div>
          <div className="faint" style={{ fontSize: 12 }}>{t('Nessuna partita in programma al momento.')}</div>
        </div>
        <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
      </button>
    )
  }

  // ---- 5 prossimi giorni ----
  const agenda = (
    <section className="home-sec">
      <div className="home-h">{t('Prossimi giorni')}</div>
      <button className="home-card" onClick={() => goto('agenda')} aria-label={t('Apri agenda')}>
        {events.length === 0 ? (
          <div className="home-tl-row">
            <span className="home-tl-t faint" style={{ fontWeight: 500 }}>{t('Nessun impegno in programma.')}</span>
            <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          </div>
        ) : events.map(e => {
          const d = new Date(e.start_at)
          return (
            <div className="home-tl-row" key={e.id}>
              <div className="home-tl-day">
                <div className="w">{d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '')}</div>
                <div className="d">{d.getDate()}</div>
              </div>
              <span className="home-tl-time">{d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="home-tl-t home-trunc">{e.title}</span>
            </div>
          )
        })}
      </button>
    </section>
  )

  // ---- 6 stagione + ultima partita ----
  const useGoals = goals > 0
  const stats = (
    <section className="home-sec">
      <div className="home-h">{t('In stagione')}</div>
      <button className="home-card" onClick={() => goto('performance')}>
        <div className="home-stats">
          <div className="home-stat"><div className="v">{presenze}</div><div className="l">{t('Presenze')}</div></div>
          <div className="home-stat"><div className="v">{useGoals ? goals : minutes}</div><div className="l">{useGoals ? t('Gol') : t('Minuti')}</div></div>
          <div className="home-stat"><div className="v">{avgRating ? avgRating.toFixed(2) : '-'}</div><div className="l">{t('Rating')}</div></div>
        </div>
        {lastMatch && (
          <div className="home-last">
            <span className="k">{t('Ultima')}</span>
            <span className="m home-trunc">{lastMatch.match_name}</span>
            <span className="x">{lastMatch.minutes}′ · {fmtDate(lastMatch.match_date)}</span>
          </div>
        )}
        {nextContractExpiry && (
          <div className="home-note" style={lastMatch ? { paddingTop: 0 } : undefined}>
            {t('Contratto in scadenza il')} {fmtDate(nextContractExpiry.c.end_date)}
          </div>
        )}
      </button>
    </section>
  )

  return (
    <div className="home">
      <style>{HOME_CSS}</style>
      <div className="home-col">
        {identity}
        {quick}
        {todo}
        {hero}
      </div>
      <div className="home-col">
        {agenda}
        {stats}
        <HomeContacts goto={goto} title={t('I tuoi referenti')} />
      </div>
      {adding && <QuickAddModal initialKind={adding} onClose={() => setAdding(null)} />}
    </div>
  )
}
