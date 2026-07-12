import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty, Select } from '../components/ui'
import Icon from '../components/Icon'
import { SeasonBlock } from '../components/statbits'
import { seasonOf, fmtDate, fmtDateTime } from '../lib/format'
import type { Player, Match, StatsMatch, SeasonStat } from '../lib/types'

type Tab = 'overview' | 'pitch' | 'social'

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`

interface Agg { app: number; min: number; goals: number; assists: number; rW: number; rMin: number }

// Vista dedicata ai brand: il profilo dell'atleta che sponsorizzano.
// L'atleta è determinato dallo scope RLS (profilo brand → player_api_id).
// Profilo navigabile: Panoramica · In campo · Social. Sola lettura.
export default function MediaKit() {
  const { athleteId } = useAthlete()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [tech, setTech] = useState<StatsMatch[]>([])
  const [api, setApi] = useState<SeasonStat[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const currentSeason = seasonOf(new Date())

  useEffect(() => {
    if (!athleteId) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const pid = athleteId
      const [p, m, t, a] = await Promise.all([
        supabase.from('player').select('*').eq('api_player_id', pid).maybeSingle(),
        supabase.from('matches').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
        supabase.from('player_stats_match').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
        supabase.from('player_stats_api').select('*').eq('player_id', pid).order('season', { ascending: false }),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setTech((t.data as StatsMatch[]) || [])
      setApi((a.data as SeasonStat[]) || [])
      setLoading(false)
    })()
  }, [athleteId])

  // Aggregati stagionali dalle statistiche API (fonte primaria dei numeri "in campo")
  const seasonMap = useMemo(() => {
    const map = new Map<number, Agg>()
    api.forEach(s => {
      if (s.season == null) return
      const cur = map.get(s.season) ?? { app: 0, min: 0, goals: 0, assists: 0, rW: 0, rMin: 0 }
      cur.app += s.appearances || 0
      cur.min += s.minutes || 0
      cur.goals += s.goals || 0
      cur.assists += s.assists || 0
      if (s.rating && s.minutes) { cur.rW += Number(s.rating) * s.minutes; cur.rMin += s.minutes }
      map.set(s.season, cur)
    })
    return map
  }, [api])

  const apiYears = useMemo(() => [...seasonMap.keys()].sort((a, b) => b - a), [seasonMap])
  const curStart = Number(currentSeason.slice(0, 4))
  // Stagione da mostrare: quella in corso se ha presenze, altrimenti l'ultima con presenze reali.
  const displayYear = useMemo(() => {
    if ((seasonMap.get(curStart)?.app || 0) > 0) return curStart
    const withApp = apiYears.filter(y => (seasonMap.get(y)!.app || 0) > 0)
    return withApp[0] ?? apiYears[0] ?? curStart
  }, [apiYears, seasonMap, curStart])

  const [pitchYear, setPitchYear] = useState<number | null>(null)
  const activeYear = pitchYear ?? displayYear

  if (loading) return <Spinner />
  if (!player) return <Empty icon={<Icon name="award" size={28} strokeWidth={1.4} />} title="Profilo non disponibile" hint="Nessun atleta collegato a questo accesso. Contatta AUVI Agency." />

  const fmtK = (n?: number | null) => n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : String(n)
  const aggOf = (y: number) => seasonMap.get(y) ?? { app: 0, min: 0, goals: 0, assists: 0, rW: 0, rMin: 0 }
  const ratingOf = (a: Agg) => a.rMin > 0 ? a.rW / a.rMin : null

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Hero player={player} season={currentSeason} onOpen={() => setTab('pitch')} />

      <div className="mk-tabs">
        {([['overview', 'Panoramica', 'grid'], ['pitch', 'In campo', 'activity'], ['social', 'Social', 'instagram']] as const).map(([k, label, ico]) => (
          <button key={k} className={`mk-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            <Icon name={ico} size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Overview
          player={player} agg={aggOf(displayYear)} rating={ratingOf(aggOf(displayYear))}
          seasonTxt={seasonMap.has(displayYear) ? seasonLabel(displayYear) : currentSeason} fmtK={fmtK}
          onPitch={() => setTab('pitch')} onSocial={() => setTab('social')}
        />
      )}
      {tab === 'pitch' && (
        <Pitch
          matches={matches} api={api} agg={aggOf(activeYear)} rating={ratingOf(aggOf(activeYear))}
          year={activeYear} years={apiYears} onYear={setPitchYear}
          tech={tech.filter(t => seasonOf(t.match_date) === seasonLabel(activeYear))}
        />
      )}
      {tab === 'social' && <Social player={player} fmtK={fmtK} />}

      <div className="faint" style={{ fontSize: 11.5, textAlign: 'center', padding: '4px 0 8px' }}>
        Dati riservati · condivisi da AUVI Agency per la valutazione della partnership.
      </div>
    </div>
  )
}

/* ---------- HERO cliccabile ---------- */
function Hero({ player, season, onOpen }: { player: Player; season: string; onOpen: () => void }) {
  return (
    <button className="mk-hero" onClick={onOpen} title="Apri le performance in campo">
      {player.photo_url && <img className="mk-hero-photo" src={player.photo_url} alt="" />}
      <div className="mk-hero-body">
        <div className="ed-kicker">Media kit · stagione {season}</div>
        <div className="mk-hero-name">{player.name}</div>
        <div className="mk-hero-meta">
          {player.position || '—'} · {player.team_name}{player.team_country ? ` (${player.team_country})` : ''}{player.shirt_number ? ` · #${player.shirt_number}` : ''}
        </div>
        <div className="mk-hero-facts">
          <Fact k="Età" v={player.age} />
          <Fact k="Altezza" v={player.height} />
          <Fact k="Piede" v={player.preferred_foot} />
          <Fact k="Nazione" v={player.nationality} />
        </div>
      </div>
      <span className="mk-hero-cta"><span>Profilo completo</span><Icon name="chevron-right" size={16} /></span>
    </button>
  )
}

/* ---------- PANORAMICA ---------- */
function Overview({ player, agg, rating, seasonTxt, fmtK, onPitch, onSocial }: {
  player: Player; agg: Agg; rating: number | null; seasonTxt: string
  fmtK: (n?: number | null) => string; onPitch: () => void; onSocial: () => void
}) {
  return (
    <>
      <SectionHead t={`In campo · ${seasonTxt}`} onMore={onPitch} moreLabel="Dettaglio" />
      <div className="grid g4">
        <StatCard label="Presenze" value={agg.app || '—'} sub={agg.min ? `${agg.min.toLocaleString('it-IT')}′ giocati` : undefined} />
        <StatCard label="Rating medio" value={rating ? rating.toFixed(2) : '—'} tone={rating && rating >= 7 ? 'var(--green)' : undefined} />
        <StatCard label="Gol" value={agg.goals} />
        <StatCard label="Assist" value={agg.assists} />
      </div>

      <SectionHead t="Audience · Instagram" onMore={onSocial} moreLabel="Dettaglio" />
      <div className="grid g4">
        <StatCard label="Follower" value={fmtK(player.instagram_followers)} />
        <StatCard label="Engagement" value={player.instagram_engagement != null ? player.instagram_engagement + '%' : '—'} tone="var(--green)" />
        <StatCard label="Reach medio" value={fmtK(player.instagram_reach)} />
        <div className="card stat mk-ig" onClick={() => player.instagram_url && window.open(player.instagram_url, '_blank')} style={{ cursor: player.instagram_url ? 'pointer' : 'default' }}>
          <div className="stat-label">Profilo</div>
          <div className="stat-value" style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="instagram" size={16} /> {igHandle(player.instagram_url) || '—'}
          </div>
          {player.instagram_url && <div className="stat-sub">apri su Instagram ↗</div>}
        </div>
      </div>
      {player.audience_note && (
        <div className="card" style={{ background: 'var(--bg-2)' }}>
          <div className="ed-kicker" style={{ marginBottom: 6 }}>Pubblico</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>{player.audience_note}</div>
        </div>
      )}
    </>
  )
}

/* ---------- IN CAMPO ---------- */
function Pitch({ matches, api, agg, rating, year, years, onYear, tech }: {
  matches: Match[]; api: SeasonStat[]; agg: Agg; rating: number | null
  year: number; years: number[]; onYear: (y: number) => void; tech: StatsMatch[]
}) {
  const nextMatch = [...matches].reverse().find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  const last5 = matches.filter(m => m.minutes != null && Number(m.rating) > 0).slice(0, 5).reverse()
  const maxR = Math.max(10, ...last5.map(m => Number(m.rating) || 0))
  const seasonComps = api.filter(s => s.season === year && (s.appearances || 0) > 0)

  return (
    <>
      <div className="ed-masthead" style={{ alignItems: 'center' }}>
        <div className="ed-masthead-t">In campo · {seasonLabel(year)}</div>
        <div className="ed-rule" />
        {years.length > 1 && (
          <Select value={String(year)} onChange={e => onYear(Number(e.target.value))} style={{ width: 120, flexShrink: 0 }}>
            {years.map(y => <option key={y} value={y}>{seasonLabel(y)}</option>)}
          </Select>
        )}
      </div>

      <div className="grid g4">
        <StatCard label="Presenze" value={agg.app || '—'} sub={agg.min ? `${agg.min.toLocaleString('it-IT')}′ giocati` : undefined} />
        <StatCard label="Rating medio" value={rating ? rating.toFixed(2) : '—'} tone={rating && rating >= 7 ? 'var(--green)' : undefined} />
        <StatCard label="Gol" value={agg.goals} />
        <StatCard label="Assist" value={agg.assists} />
      </div>

      {seasonComps.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Per competizione · {seasonLabel(year)}</div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Competizione</th><th>Pres.</th><th>Min.</th><th>Gol</th><th>Assist</th><th>Rating</th></tr></thead>
              <tbody>
                {seasonComps.map(s => (
                  <tr key={s.id}>
                    <td><b>{s.competition}</b></td>
                    <td className="mono">{s.appearances ?? '—'}</td>
                    <td className="mono">{s.minutes != null ? s.minutes.toLocaleString('it-IT') : '—'}</td>
                    <td className="mono">{s.goals ?? 0}</td>
                    <td className="mono">{s.assists ?? 0}</td>
                    <td className="mono" style={{ color: s.rating && s.rating >= 7 ? 'var(--green)' : undefined }}>{s.rating ? Number(s.rating).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nextMatch && (
        <div className="card">
          <div className="card-head"><div className="card-title">Prossima partita</div></div>
          <div style={{ fontSize: 16, fontWeight: 750 }}>{nextMatch.home_team} vs {nextMatch.away_team}</div>
          <div className="muted" style={{ marginTop: 4 }}>{nextMatch.league}{nextMatch.round ? ` · ${nextMatch.round}` : ''} · {fmtDateTime(nextMatch.match_date)}</div>
        </div>
      )}

      {last5.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Ultime {last5.length} · andamento rating</div><div className="card-hint">scala 0–10</div></div>
          <div className="chart">
            {last5.map(m => {
              const r = Number(m.rating) || 0
              return (
                <div className="chart-col" key={m.id}>
                  <div className="chart-v" style={{ color: r >= 7 ? 'var(--green)' : r >= 6 ? 'var(--text)' : 'var(--red)' }}>{r ? r.toFixed(1) : '—'}</div>
                  <div className="chart-bar" style={{ height: `${(r / maxR) * 100}%` }} />
                  <div className="chart-x">{(m.opponent || m.away_team || '').slice(0, 3).toUpperCase()}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tech.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Rendimento tecnico · {seasonLabel(year)}</div></div>
          <SeasonBlock stats={tech} />
        </div>
      )}
    </>
  )
}

/* ---------- SOCIAL ---------- */
function Social({ player, fmtK }: { player: Player; fmtK: (n?: number | null) => string }) {
  const hasNumbers = player.instagram_followers != null
  return (
    <>
      <SectionHead t="Instagram" />
      <div className="card card-lg mk-social-head">
        <div className="mk-ig-badge"><Icon name="instagram" size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 750, fontSize: 17 }}>{igHandle(player.instagram_url) || player.name}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>Account ufficiale</div>
        </div>
        {player.instagram_url && (
          <a href={player.instagram_url} target="_blank" rel="noreferrer" className="btn btn-primary"><Icon name="instagram" size={15} /> Apri</a>
        )}
      </div>

      <div className="grid g3">
        <StatCard label="Follower" value={fmtK(player.instagram_followers)} big />
        <StatCard label="Engagement rate" value={player.instagram_engagement != null ? player.instagram_engagement + '%' : '—'} tone="var(--green)" big />
        <StatCard label="Reach medio / post" value={fmtK(player.instagram_reach)} big />
      </div>

      {player.audience_note && (
        <div className="card" style={{ background: 'var(--bg-2)' }}>
          <div className="ed-kicker" style={{ marginBottom: 6 }}>Chi è il pubblico</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>{player.audience_note}</div>
        </div>
      )}

      {!hasNumbers && <div className="faint" style={{ fontSize: 12 }}>I numeri social saranno aggiornati da AUVI.</div>}
      <div className="faint" style={{ fontSize: 11.5 }}>Dati Instagram indicativi · aggiornati periodicamente da AUVI Agency.</div>
    </>
  )
}

/* ---------- bit riutilizzabili ---------- */
function SectionHead({ t, onMore, moreLabel }: { t: string; onMore?: () => void; moreLabel?: string }) {
  return (
    <div className="ed-masthead" style={{ alignItems: 'center' }}>
      <div className="ed-masthead-t">{t}</div>
      <div className="ed-rule" />
      {onMore && <button className="btn btn-sm" onClick={onMore} style={{ flexShrink: 0 }}>{moreLabel} <Icon name="chevron-right" size={13} /></button>}
    </div>
  )
}

function StatCard({ label, value, sub, tone, big }: { label: string; value: React.ReactNode; sub?: string; tone?: string; big?: boolean }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ ...(tone ? { color: tone } : {}), ...(big ? { fontSize: 30 } : {}) }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function Fact({ k, v }: { k: string; v: any }) {
  if (v == null || v === '') return null
  return <div><div className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.4px' }}>{k}</div><div style={{ fontWeight: 700, fontSize: 14 }}>{v}</div></div>
}

function igHandle(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/instagram\.com\/([^/?#]+)/i)
  return m ? '@' + m[1] : null
}
