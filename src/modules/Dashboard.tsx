import { teamLogo, leagueLogo } from '../lib/logos'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { Spinner } from '../components/ui'
import Icon from '../components/Icon'
import ReferentiCard from '../components/ReferentiCard'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtDate, fmtMatchTime, daysUntil, isImageFile } from '../lib/format'
import type { Player, EventItem, Contract, Match, StatsMatch, EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'
const CHIP: Record<string, { l: string; c: string }> = {
  da_preparare: { l: 'Da preparare', c: 'ed-chip-gold' },
  copy_pronto: { l: 'Copy pronto', c: 'ed-chip-blue' },
  grafica_caricata: { l: 'Grafica', c: 'ed-chip-gold' },
  pronto: { l: 'Pronto', c: 'ed-chip-green' },
}
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

// Layout Home: una sola struttura.
// Desktop (>880px): 2 colonne, principale (identità, prossima partita, da fare) + laterale (impegni, stagione, ultima partita).
// Telefono: colonna unica; le due colonne diventano "display: contents" e l'ordine lo decide `order`.
const HOME_CSS = `
.home { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 22px; align-items: start; }
.home-col { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.home-sec { min-width: 0; }
.home-agenda-row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: none; border: none; text-align: left; cursor: pointer; }
.home-agenda-row + .home-agenda-row { border-top: 1px solid var(--border); }
.home-agenda-row:hover { background: var(--bg-2); }
.home-agenda-date { width: 42px; flex-shrink: 0; text-align: center; border-radius: 10px; background: var(--bg-2); padding: 5px 0; }
.home-agenda-date .d { font-weight: 700; font-size: 16px; line-height: 1; color: var(--text); }
.home-agenda-date .m { font-weight: 600; font-size: 9.5px; letter-spacing: .8px; text-transform: uppercase; color: var(--text-faint); margin-top: 2px; }
.home-list { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
.home-trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-thumbs { display: flex; gap: 4px; margin-top: 7px; }
.home-thumbs img, .home-thumbs span { width: 26px; height: 26px; border-radius: 7px; object-fit: cover; background: var(--bg-2); display: block; }
.home-calm { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px 16px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.home-calm-ic { width: 46px; height: 46px; border-radius: 13px; background: var(--bg-2); color: var(--text-dim); display: grid; place-items: center; flex-shrink: 0; }
.home-stats { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 4px 8px 14px; }
@media (max-width: 880px) {
  .home { display: flex; flex-direction: column; gap: 20px; }
  .home-col { display: contents; }
  .home-o1 { order: 1; } .home-o2 { order: 2; } .home-o3 { order: 3; } .home-o4 { order: 4; }
  .home-o5 { order: 5; } .home-o6 { order: 6; } .home-o7 { order: 7; }
  .home .ed-hero-title { font-size: 21px; }
}
`

// Due squadre con logo (da API-Football) affiancate: [logo] Casa — [logo] Trasferta
function TeamVs({ m, size = 24 }: { m: Match; size?: number }) {
  const Logo = ({ src }: { src: string | null }) =>
    src ? <img src={src} alt="" style={{ height: size, width: size, objectFit: 'contain', flexShrink: 0 }} /> : null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Logo src={teamLogo(m.home_team, m.home_logo)} /><span>{m.home_team}</span>
      <span style={{ opacity: .45 }}>—</span>
      <Logo src={teamLogo(m.away_team, m.away_logo)} /><span>{m.away_team}</span>
    </span>
  )
}

function Masthead({ title, quiet, more, onMore }: { title: string; quiet?: boolean; more?: string; onMore?: () => void }) {
  return (
    <div className="ed-masthead">
      <div className={`ed-masthead-t${quiet ? ' quiet' : ''}`}>{title}</div>
      <div className="ed-rule" />
      {more && onMore && <button className="ed-more" onClick={onMore}>{more}</button>}
    </div>
  )
}

export default function Dashboard({ goto }: { goto: (r: string) => void }) {
  const { profile } = useAuth()
  const { athleteId, athleteTz } = useAthlete()
  const { t } = useLang()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [lastMatch, setLastMatch] = useState<StatsMatch | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [nextContent, setNextContent] = useState<EditorialEntry | null>(null)
  const [nextContentThumb, setNextContentThumb] = useState<string | null>(null)
  const [toApprove, setToApprove] = useState<MediaItem[]>([])
  const [approveUrls, setApproveUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!athleteId) return
    (async () => {
      const todayKey = new Date().toISOString().slice(0, 10)
      const pid = athleteId
      const [p, m, t, ev, ct, ed, ph] = await Promise.all([
        supabase.from('player').select('*').eq('api_player_id', pid).maybeSingle(),
        supabase.from('matches').select('*').eq('player_id', pid).order('match_date', { ascending: true }),
        supabase.from('player_stats_match').select('*').eq('player_id', pid).order('match_date', { ascending: false }).limit(1),
        supabase.from('crm_events').select('*').eq('player_id', pid).gte('start_at', new Date().toISOString()).order('start_at').limit(5),
        supabase.from('crm_contracts').select('*').eq('player_id', pid),
        supabase.from('crm_editorial').select('*').eq('player_id', pid).gte('entry_date', todayKey)
          .neq('status', 'pubblicato').order('entry_date').limit(1).maybeSingle(),
        supabase.from('crm_media').select('*').eq('player_id', pid).eq('status', 'da_approvare').order('created_at', { ascending: false }),
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
          setLastMatch({ match_name: `${lm.home_team} - ${lm.away_team}${score}`, match_date: lm.match_date, minutes: lm.minutes ?? 0, competition: lm.league } as any)
        } else {
          setLastMatch(((t.data as StatsMatch[]) || [])[0] || null)
        }
      }
      setEvents((ev.data as EventItem[]) || [])
      setContracts((ct.data as Contract[]) || [])
      const content = ed.data as EditorialEntry | null
      setNextContent(content)
      const photos = (ph.data as MediaItem[]) || []
      setToApprove(photos)

      if (content) {
        const { data: cm } = await supabase.from('crm_media').select('storage_path,file_name')
          .eq('editorial_id', content.id).limit(4)
        const img = (cm || []).find(x => isImageFile((x as any).file_name))
        if (img) {
          const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl((img as any).storage_path, 3600)
          if (s?.signedUrl) setNextContentThumb(s.signedUrl)
        }
      }
      const paths = photos.slice(0, 8).map(x => x.storage_path)
      if (paths.length) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
        if (signed) {
          const next: Record<string, string> = {}
          signed.forEach(d => { if (d.signedUrl && d.path) next[d.path] = d.signedUrl })
          setApproveUrls(next)
        }
      }
      setLoading(false)
    })()
  }, [athleteId])

  if (loading) return <Spinner />

  // ---- dati derivati ----
  const nextMatch = matches.find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  // Stagione corrente = quella della partita piu recente; presenze/rating/gol si riferiscono a essa.
  const curSeason = matches.length
    ? matches.reduce((a, b) => ((a.match_date || '') > (b.match_date || '') ? a : b)).season
    : null
  const inSeason = (m: any) => curSeason == null || m.season === curSeason
  const played = matches.filter(m => inSeason(m) && m.minutes != null && m.minutes > 0)
  const presenze = played.length
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
  const goals = matches.filter(inSeason).reduce((s, m) => s + (m.goals || 0), 0)
  const nextContractExpiry = contracts
    .filter(c => c.end_date).map(c => ({ c, d: daysUntil(c.end_date) }))
    .filter(x => x.d != null && x.d >= 0).sort((a, b) => (a.d! - b.d!))[0]

  const greeting = new Date().getHours() < 13 ? 'Buongiorno' : new Date().getHours() < 19 ? 'Buon pomeriggio' : 'Buonasera'
  const firstName = (profile?.full_name || '').split(' ')[0]
  const igHandle = player?.instagram_url?.replace(/\/$/, '').split('/').pop()
  const bd = player?.birth_date ? new Date(player.birth_date + 'T12:00') : null
  const birthLabel = bd ? `${bd.getDate()} ${MESI[bd.getMonth()]} ${bd.getFullYear()}` : null
  const roleLine = player ? `${player.position} · ${player.team_name} · #${player.shirt_number ?? '—'}` : 'Gestione riservata AUVI'

  let matchWhen = ''
  let matchMeta: string[] = []
  if (nextMatch?.match_date) {
    const days = Math.ceil((new Date(nextMatch.match_date).getTime() - Date.now()) / 86400000)
    matchWhen = days <= 0 ? 'Oggi' : days === 1 ? 'Domani' : `Fra ${days} giorni`
    const d = new Date(nextMatch.match_date)
    matchMeta = [
      `${d.getDate().toString().padStart(2, '0')} ${MESI[d.getMonth()].slice(0, 3).toUpperCase()}`,
      fmtMatchTime(nextMatch.match_date, athleteTz),
      (nextMatch.venue || '').toLowerCase() === 'home' ? 'IN CASA' : 'TRASFERTA',
    ]
  }
  const hasActions = toApprove.length > 0 || !!nextContent

  // ---- blocchi ----
  const photo = (px: number, radius: number) => player?.photo_url
    ? <img src={player.photo_url} alt="" style={{ width: px, height: px, borderRadius: radius, objectFit: 'cover', border: '1px solid var(--border-2)', flexShrink: 0 }} />
    : <div className="avatar" style={{ width: px, height: px, fontSize: Math.round(px / 2.8), borderRadius: radius, flexShrink: 0 }}>{firstName[0]}</div>

  const identity = isMobile ? (
    <div className="home-sec home-o1 flex gap" style={{ gap: 12, alignItems: 'center' }}>
      {photo(48, 14)}
      <div style={{ minWidth: 0 }}>
        <div className="ed-kicker">{greeting}{firstName ? `, ${firstName}` : ''}</div>
        <div className="ed-id-name home-trunc" style={{ fontSize: 20, marginTop: 3 }}>{player?.name || 'Atleta'}</div>
        <div className="muted home-trunc" style={{ marginTop: 3, fontSize: 12 }}>{roleLine}</div>
      </div>
    </div>
  ) : (
    <div className="ed-id-card home-sec">
      <div className="flex gap" style={{ gap: 16, alignItems: 'center' }}>
        {photo(64, 18)}
        <div style={{ minWidth: 0 }}>
          <div className="ed-kicker">{greeting}{firstName ? `, ${firstName}` : ''}</div>
          <div className="ed-id-name">{player?.name || 'Atleta'}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>{roleLine}</div>
        </div>
      </div>
      {(birthLabel || player?.contact_email || player?.instagram_url) && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 13 }}>
            {birthLabel && <Anag icon="cake" label="Nato il" value={birthLabel} />}
            {player?.contact_email && <Anag icon="mail" label="Email" value={player.contact_email} href={`mailto:${player.contact_email}`} />}
            {player?.instagram_url && <Anag icon="instagram" label="Instagram" value={igHandle ? `@${igHandle}` : 'Profilo'} href={player.instagram_url} external />}
          </div>
        </>
      )}
    </div>
  )

  const todo = (
    <div className="home-sec home-o2">
      <Masthead title={t('Da fare ora')} />
      {hasActions ? (
        <div className="grid" style={{ gap: 10 }}>
          {toApprove.length > 0 && (
            <button className="ed-action prio" onClick={() => goto('media?tab=approvare')}>
              <div className="ed-action-num">{toApprove.length}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ed-action-t">{t('Foto da approvare')}</div>
                <div className="ed-action-s">{t('Selezioni in attesa del tuo ok')}</div>
                {Object.keys(approveUrls).length > 0 && (
                  <div className="home-thumbs">
                    {toApprove.slice(0, isMobile ? 5 : 8).map(m => (isImageFile(m.file_name) && approveUrls[m.storage_path]
                      ? <img key={m.id} src={approveUrls[m.storage_path]} alt="" loading="lazy" />
                      : <span key={m.id} />))}
                  </div>
                )}
              </div>
              <span className="ed-chev">›</span>
            </button>
          )}
          {nextContent && (
            <button className="ed-action" onClick={() => goto(`editorial?entry=${nextContent.id}`)}>
              {nextContentThumb
                ? <img className="ed-action-thumb" src={nextContentThumb} alt="" />
                : <div className="ed-action-thumb" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-faint)' }}><Icon name="image" size={18} strokeWidth={1.5} /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="faint" style={{ fontSize: 11 }}>{t('Prossimo contenuto')} · {fmtDate(nextContent.entry_date)}</div>
                <div className="ed-action-t home-trunc" style={{ marginTop: 2 }}>{nextContent.title}</div>
                <div className="flex gap wrap" style={{ gap: 6, marginTop: 6 }}>
                  <span className={`ed-chip ${CHIP[nextContent.status]?.c || 'ed-chip-gold'}`}>{CHIP[nextContent.status]?.l || 'In lavorazione'}</span>
                  {nextContent.copy_text && nextContent.status !== 'copy_pronto' && <span className="ed-chip ed-chip-blue">Copy pronto</span>}
                </div>
              </div>
              <span className="ed-chev">›</span>
            </button>
          )}
        </div>
      ) : (
        <div className="home-calm">
          <div className="home-calm-ic"><Icon name="check" size={20} /></div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="ed-action-t">{t('Tutto in ordine')}</div>
            <div className="ed-action-s">{t('Nessuna foto da approvare e nessun contenuto in coda.')}</div>
          </div>
          <button className="btn btn-sm" onClick={() => goto('tasks')}>{t('Vedi i task')}</button>
        </div>
      )}
    </div>
  )

  const hero = nextMatch ? (
    <button className="ed-hero home-sec home-o3" onClick={() => goto('performance')} style={{ padding: 0, border: '1px solid var(--border)' }}>
      {player?.stadium_photo_url && <img className="ed-hero-img" src={player.stadium_photo_url} alt="" style={{ opacity: .5 }} />}
      <div className="ed-hero-scrim" />
      <div className="ed-hero-body" style={{ textAlign: 'left' }}>
        <div className="ed-livepill"><span className="ed-livedot" /><span>Prossima · {matchWhen}</span></div>
        <div className="ed-hero-title"><TeamVs m={nextMatch} size={isMobile ? 22 : 26} /></div>
        {leagueLogo(nextMatch.league) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, minWidth: 0 }}>
            <img src={leagueLogo(nextMatch.league)!} alt="" style={{ height: 22, width: 22, objectFit: 'contain', flexShrink: 0 }} />
            <span className="home-trunc" style={{ fontSize: 12.5, opacity: .85, fontWeight: 600 }}>{nextMatch.league}</span>
          </div>
        )}
        <div className="ed-hero-meta">
          {matchMeta.map((x, i) => <span key={i} style={{ display: 'contents' }}>{i > 0 && <span className="sep">|</span>}<span>{x}</span></span>)}
        </div>
      </div>
    </button>
  ) : (
    <button className="ed-strip home-sec home-o3" onClick={() => goto('performance')}>
      <div style={{ minWidth: 0 }}>
        <div className="ed-kicker">{t('Prossima partita')}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 5 }}>{t('Nessuna partita in programma al momento.')}</div>
      </div>
      <span className="ed-chev">›</span>
    </button>
  )

  const agenda = (
    <div className="home-sec home-o4">
      <Masthead title={t('Prossimi impegni')} quiet more={t('Agenda →')} onMore={() => goto('agenda')} />
      {events.length === 0 ? (
        <button className="ed-strip" onClick={() => goto('agenda')}>
          <span className="muted" style={{ fontSize: 13 }}>{t('Nessun impegno in programma.')}</span>
          <span className="ed-chev">›</span>
        </button>
      ) : (
        <div className="home-list">
          {events.map(e => {
            const d = new Date(e.start_at)
            const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
            return (
              <button className="home-agenda-row" key={e.id} onClick={() => goto('agenda')}>
                <div className="home-agenda-date">
                  <div className="d">{d.getDate()}</div>
                  <div className="m">{MESI[d.getMonth()].slice(0, 3)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="home-trunc" style={{ fontWeight: 650, fontSize: 13.5, color: 'var(--text)' }}>{e.title}</div>
                  <div className="faint home-trunc" style={{ fontSize: 11.5, marginTop: 2 }}>{time}{e.location ? ` · ${e.location}` : ''}</div>
                </div>
                <span className="ed-chev">›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const stats = (
    <div className="home-sec home-o5">
      <Masthead title={t('In stagione')} quiet more={t('Dettagli →')} onMore={() => goto('performance')} />
      <div className="home-stats">
        <div className="ed-statcols">
          <div className="ed-statcol"><div className="v">{presenze}</div><div className="l">{t('Presenze')}</div></div>
          <div className="ed-statdiv" />
          <div className="ed-statcol"><div className="v" style={{ color: avgRating && avgRating >= 7 ? 'var(--green)' : undefined }}>{avgRating ? avgRating.toFixed(2) : '—'}</div><div className="l">{t('Rating')}</div></div>
          <div className="ed-statdiv" />
          <div className="ed-statcol"><div className="v">{goals}</div><div className="l">{t('Gol')}</div></div>
        </div>
        {nextContractExpiry && (
          <div className="faint" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            {t('Contratto in scadenza il')} {fmtDate(nextContractExpiry.c.end_date)}
          </div>
        )}
      </div>
    </div>
  )

  const last = lastMatch && (
    <button className="ed-strip home-sec home-o6" onClick={() => goto('performance')}>
      <div style={{ minWidth: 0 }}>
        <div className="ed-kicker">{t('Ultima partita')}</div>
        <div className="home-trunc" style={{ fontWeight: 700, fontSize: 14, marginTop: 5 }}>{lastMatch.match_name}</div>
        <div className="faint home-trunc" style={{ fontSize: 11, marginTop: 2 }}>{fmtDate(lastMatch.match_date)} · {lastMatch.minutes}′ giocati · {lastMatch.competition}</div>
      </div>
      <span className="ed-chev">›</span>
    </button>
  )

  return (
    <div className="home">
      <style>{HOME_CSS}</style>
      <div className="home-col">
        {identity}
        {hero}
        {todo}
      </div>
      <div className="home-col">
        {agenda}
        {stats}
        {last}
        <div className="home-sec home-o7"><ReferentiCard goto={goto} /></div>
      </div>
    </div>
  )
}

function Anag({ icon, label, value, href, external }: { icon: string; label: string; value: string; href?: string; external?: boolean }) {
  const inner = (
    <div className="ed-anag">
      <span className="ed-anag-ic"><Icon name={icon} size={15} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="ed-anag-l">{label}</div>
        <div className="ed-anag-v">{value}</div>
      </div>
    </div>
  )
  if (href) return <a href={href} target={external ? '_blank' : undefined} rel="noreferrer" className="ed-anag-link" style={{ display: 'block', minWidth: 0 }}>{inner}</a>
  return inner
}
