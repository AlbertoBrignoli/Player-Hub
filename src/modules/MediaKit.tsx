import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty, Select, Badge } from '../components/ui'
import Icon from '../components/Icon'
import { SeasonBlock } from '../components/statbits'
import { seasonOf, fmtDate, fmtDateTime } from '../lib/format'
import { followerBand, AVAIL_OPTS, CATEGORY_NAMES, computeBrandAthleteMatch } from '../lib/commercialScore'
import type { Player, Match, StatsMatch, SeasonStat } from '../lib/types'

type Tab = 'overview' | 'pitch' | 'social' | 'partnership'

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`

interface Agg { app: number; min: number; goals: number; assists: number; rW: number; rMin: number }

// Vista dedicata ai brand: il profilo dell'atleta che sponsorizzano.
// L'atleta è determinato dallo scope RLS (profilo brand → player_api_id).
// Profilo navigabile: Panoramica · In campo · Social. Sola lettura.
export default function MediaKit({ goto }: { goto?: (r: string) => void }) {
  const { athleteId } = useAthlete()
  const { isBrand } = useAuth()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [tech, setTech] = useState<StatsMatch[]>([])
  const [api, setApi] = useState<SeasonStat[]>([])
  const [teaser, setTeaser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const currentSeason = seasonOf(new Date())

  useEffect(() => {
    if (!athleteId) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const pid = athleteId
      const [p, m, t, a, tz] = await Promise.all([
        supabase.from('player').select('*').eq('api_player_id', pid).maybeSingle(),
        supabase.from('matches').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
        supabase.from('player_stats_match').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
        supabase.from('player_stats_api').select('*').eq('player_id', pid).order('season', { ascending: false }),
        supabase.from('cp_public_teaser').select('*').eq('player_id', pid).eq('published', true).maybeSingle(),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setTech((t.data as StatsMatch[]) || [])
      setApi((a.data as SeasonStat[]) || [])
      setTeaser(tz.data || null)
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
        {([['overview', 'Panoramica', 'grid'], ['pitch', 'In campo', 'activity'], ['social', 'Social', 'instagram'], ['partnership', 'Partnership', 'award']] as const).map(([k, label, ico]) => (
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
          isBrand={isBrand} teaser={teaser} goto={goto}
        />
      )}
      {tab === 'pitch' && (
        <Pitch
          matches={matches} api={api} agg={aggOf(activeYear)} rating={ratingOf(aggOf(activeYear))}
          year={activeYear} years={apiYears} onYear={setPitchYear}
          tech={tech.filter(t => seasonOf(t.match_date) === seasonLabel(activeYear))}
        />
      )}
      {tab === 'social' && (isBrand ? <SocialTeaser player={player} teaser={teaser} goto={goto} /> : <Social player={player} fmtK={fmtK} />)}
      {tab === 'partnership' && <Partnership player={player} goto={goto} />}

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
function Overview({ player, agg, rating, seasonTxt, fmtK, onPitch, onSocial, isBrand, teaser, goto }: {
  player: Player; agg: Agg; rating: number | null; seasonTxt: string
  fmtK: (n?: number | null) => string; onPitch: () => void; onSocial: () => void
  isBrand?: boolean; teaser?: any; goto?: (r: string) => void
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
      {isBrand ? (
        <TeaserBlock player={player} teaser={teaser} compact goto={goto} />
      ) : (
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
      )}
      {!isBrand && player.audience_note && (
        <div className="card" style={{ background: 'var(--bg-2)' }}>
          <div className="ed-kicker" style={{ marginBottom: 6 }}>Pubblico</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>{player.audience_note}</div>
        </div>
      )}
    </>
  )
}

/* ---------- TEASER (unica vista commerciale per il ruolo brand) ----------
   Mai ER, reach o demografia: fascia follower + categorie + highlights scelti
   da AUVI (cp_public_teaser). Il profilo completo si richiede in chat. */
function TeaserBlock({ player, teaser, compact, goto }: { player: Player; teaser?: any; compact?: boolean; goto?: (r: string) => void }) {
  const band = teaser?.follower_band || followerBand(player.instagram_followers)
  const cats: string[] = Array.isArray(teaser?.top_categories) ? teaser.top_categories : []
  const highlights: string[] = Array.isArray(teaser?.highlights) ? teaser.highlights : []
  return (
    <div className="card card-lg">
      {teaser?.headline && <div style={{ fontWeight: 750, fontSize: compact ? 15 : 17, marginBottom: 10 }}>{teaser.headline}</div>}
      <div className="flex gap" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: highlights.length || cats.length ? 12 : 0 }}>
        <div className="mk-ig-badge"><Icon name="instagram" size={20} /></div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: compact ? 24 : 30, fontWeight: 700 }}>{band || '—'}</div>
          <div className="faint" style={{ fontSize: 11.5 }}>follower · {igHandle(player.instagram_url) || 'Instagram'}</div>
        </div>
      </div>
      {cats.length > 0 && (
        <div style={{ marginBottom: highlights.length ? 12 : 0 }}>
          <div className="ed-kicker" style={{ marginBottom: 6 }}>Territori commerciali più affini</div>
          <div className="flex gap" style={{ flexWrap: 'wrap' }}>{cats.map(c => <Badge key={c} tone="accent">{c}</Badge>)}</div>
        </div>
      )}
      {highlights.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          {highlights.map((h, i) => <div key={i}>· {h}</div>)}
        </div>
      )}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}>Engagement, audience e storico campagne sono disponibili nel profilo commerciale completo.</span>
        {goto
          ? <button className="btn btn-primary btn-sm" onClick={() => goto('messages')}><Icon name="message" size={13} /> Richiedilo in chat</button>
          : <Badge tone="gold">Richiedilo in chat ad AUVI</Badge>}
      </div>
    </div>
  )
}

function SocialTeaser({ player, teaser, goto }: { player: Player; teaser?: any; goto?: (r: string) => void }) {
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
      <TeaserBlock player={player} teaser={teaser} goto={goto} />
      <div className="faint" style={{ fontSize: 11.5 }}>Panoramica indicativa curata da AUVI Agency · profilo commerciale completo disponibile su richiesta.</div>
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

/* ---------- PARTNERSHIP ----------
   Le scelte commerciali dell'atleta, visibili al brand: valori, stile,
   interessi, categorie gradite/escluse, disponibilità, territori e lingue.
   Fonte: vista cp_preferences_public — SOLO colonne sicure (mai fee minima,
   sponsor attivi, esclusività o dati audience). */
function Partnership({ player, goto }: { player: Player; goto?: (r: string) => void }) {
  const { isBrand } = useAuth()
  const [prefs, setPrefs] = useState<any>(null)
  const [brandSearch, setBrandSearch] = useState<any>(null)
  const [showWhy, setShowWhy] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!player?.api_player_id) { setLoading(false); return }
    ;(async () => {
      const [pr, bs] = await Promise.all([
        supabase.from('cp_preferences_public').select('*').eq('player_id', player.api_player_id).maybeSingle(),
        isBrand ? supabase.from('cp_brand_search').select('*').limit(1).maybeSingle() : Promise.resolve({ data: null }),
      ])
      setPrefs(pr.data || null)
      setBrandSearch((bs as any).data || null)
      setLoading(false)
    })()
  }, [player?.api_player_id, isBrand])
  const match = isBrand && brandSearch ? computeBrandAthleteMatch(brandSearch, prefs, player) : null

  if (loading) return <Spinner />
  const ident = prefs?.identity || {}
  const terr = prefs?.territories || {}
  const liked: string[] = prefs?.categories_liked || []
  const excluded: string[] = prefs?.categories_excluded || []
  const avail = AVAIL_OPTS.filter(a => prefs?.availability?.[a.key]).map(a => a.label)
  const catName = (k: string) => CATEGORY_NAMES[k] || k
  const hasAnything = (ident.values || []).length || liked.length || avail.length || (terr.markets || []).length

  if (!prefs || !hasAnything) {
    return <Empty icon={<Icon name="award" size={28} strokeWidth={1.4} />} title="Preferenze in aggiornamento"
      hint="L'atleta sta completando il suo profilo commerciale. Per una proposta su misura, scrivi ad AUVI in chat." />
  }

  return (
    <>
      {match && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <svg width={62} height={62} style={{ flexShrink: 0 }}>
            <circle cx={31} cy={31} r={26} fill="none" stroke="var(--border)" strokeWidth={6} />
            <circle cx={31} cy={31} r={26} fill="none" stroke={match.pct >= 70 ? 'var(--green)' : match.pct >= 45 ? 'var(--gold)' : 'var(--text-faint)'}
              strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(match.pct / 100) * 2 * Math.PI * 26} ${2 * Math.PI * 26}`} transform="rotate(-90 31 31)" />
            <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, fill: 'var(--text)' }}>{match.pct}</text>
          </svg>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 750 }}>Match con la tua ricerca: {match.pct}/100</div>
            <div className="muted" style={{ fontSize: 12.5 }}>Calcolato sulle preferenze dell'atleta e i criteri che hai indicato in Ricerca talent.</div>
          </div>
          <button className="btn btn-sm" onClick={() => setShowWhy(!showWhy)}>{showWhy ? 'Nascondi' : 'Perché'}</button>
          {showWhy && (
            <div style={{ width: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.8 }}>
              {match.reasons.map((r: string, i: number) => <div key={i}>· {r}</div>)}
            </div>
          )}
        </div>
      )}
      <SectionHead t="Identità e posizionamento" />
      <div className="card card-lg">
        {ident.desired_image && (
          <div style={{ fontSize: 16, fontWeight: 650, lineHeight: 1.5, marginBottom: 14, fontStyle: 'italic' }}>
            “{ident.desired_image}”
          </div>
        )}
        {(ident.values || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="ed-kicker" style={{ marginBottom: 6 }}>Valori</div>
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>{ident.values.map((v: string) => <Badge key={v} tone="accent">{v}</Badge>)}</div>
          </div>
        )}
        {(ident.style || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="ed-kicker" style={{ marginBottom: 6 }}>Stile</div>
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>{ident.style.map((v: string) => <Badge key={v}>{v}</Badge>)}</div>
          </div>
        )}
        {(ident.interests || []).length > 0 && (
          <div>
            <div className="ed-kicker" style={{ marginBottom: 6 }}>Interessi fuori dal campo</div>
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>{ident.interests.map((v: string) => <Badge key={v}>{v}</Badge>)}</div>
          </div>
        )}
      </div>

      <SectionHead t="Collaborazioni" />
      <div className="grid g2">
        <div className="card">
          <div className="ed-kicker" style={{ marginBottom: 8 }}>Categorie gradite</div>
          {liked.length
            ? <div className="flex gap" style={{ flexWrap: 'wrap' }}>{liked.map(k => <Badge key={k} tone="green">{catName(k)}</Badge>)}</div>
            : <div className="faint" style={{ fontSize: 12.5 }}>In definizione con AUVI.</div>}
          {excluded.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="ed-kicker" style={{ marginBottom: 8 }}>Non in linea con il profilo</div>
              <div className="flex gap" style={{ flexWrap: 'wrap' }}>{excluded.map(k => <Badge key={k} tone="red">{catName(k)}</Badge>)}</div>
            </div>
          )}
        </div>
        <div className="card">
          <div className="ed-kicker" style={{ marginBottom: 8 }}>Disponibile per</div>
          {avail.length
            ? <div style={{ fontSize: 13.5, lineHeight: 2 }}>{avail.map(a => <div key={a}>· {a}</div>)}</div>
            : <div className="faint" style={{ fontSize: 12.5 }}>Disponibilità in definizione con AUVI.</div>}
        </div>
      </div>

      {((terr.markets || []).length > 0 || (terr.languages || []).length > 0) && (
        <>
          <SectionHead t="Territori e lingue" />
          <div className="card">
            {(terr.markets || []).length > 0 && (
              <div style={{ marginBottom: (terr.languages || []).length ? 12 : 0 }}>
                <div className="ed-kicker" style={{ marginBottom: 6 }}>Mercati di interesse</div>
                <div className="flex gap" style={{ flexWrap: 'wrap' }}>{terr.markets.map((m: string) => <Badge key={m}>{m}</Badge>)}</div>
              </div>
            )}
            {(terr.languages || []).length > 0 && (
              <div>
                <div className="ed-kicker" style={{ marginBottom: 6 }}>Lingue</div>
                <div className="flex gap" style={{ flexWrap: 'wrap' }}>{terr.languages.map((l: string) => <Badge key={l}>{l}</Badge>)}</div>
              </div>
            )}
            {terr.travel && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>Disponibile a viaggiare per le campagne</div>}
          </div>
        </>
      )}

      <div className="card" style={{ background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>Hai in mente una collaborazione?</div>
          <div className="muted" style={{ fontSize: 12.5 }}>AUVI costruisce la proposta con l'atleta sulla base di queste disponibilità.</div>
        </div>
        {goto
          ? <button className="btn btn-primary" onClick={() => goto('messages')}><Icon name="message" size={15} /> Scrivici in chat</button>
          : <Badge tone="gold">Scrivici in chat</Badge>}
      </div>
      <div className="faint" style={{ fontSize: 11.5 }}>Preferenze indicate dall'atleta con AUVI Agency{prefs.updated_at ? ` · aggiornate ${fmtDate(prefs.updated_at)}` : ''}.</div>
    </>
  )
}
