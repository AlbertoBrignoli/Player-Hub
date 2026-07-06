import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { Spinner, Stat, Badge, Empty, Select } from '../components/ui'
import { SeasonBlock, LastMatchGrid } from '../components/statbits'
import Icon from '../components/Icon'
import { fmtDate, fmtDateTime, seasonOf } from '../lib/format'
import type { Player, Match, SeasonStat, StatsMatch } from '../lib/types'

interface News { id: string; title: string; source: string | null; url: string | null; published_at: string | null }

export default function Performance({ goto }: { goto?: (r: string) => void }) {
  void goto
  const { athleteId } = useAthlete()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [stats, setStats] = useState<SeasonStat[]>([])
  const [news, setNews] = useState<News[]>([])
  const [tech, setTech] = useState<StatsMatch[]>([])
  const currentSeason = seasonOf(new Date())
  const [season, setSeason] = useState(currentSeason)

  useEffect(() => {
    if (!athleteId) return
    (async () => {
      const pid = athleteId
      const [p, m, s, n, t] = await Promise.all([
        supabase.from('player').select('*').eq('api_player_id', pid).maybeSingle(),
        supabase.from('matches').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
        supabase.from('player_stats_api').select('*').eq('player_id', pid).order('season', { ascending: false }),
        supabase.from('news').select('id,title,source,url,published_at').eq('player_id', pid).order('published_at', { ascending: false }).limit(6),
        supabase.from('player_stats_match').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setStats((s.data as SeasonStat[]) || [])
      setNews((n.data as News[]) || [])
      setTech((t.data as StatsMatch[]) || [])
      setLoading(false)
    })()
  }, [athleteId])

  const seasons = useMemo(() => {
    const s = new Set<string>([
      ...tech.map(t => seasonOf(t.match_date)),
      ...matches.filter(m => m.match_date).map(m => seasonOf(m.match_date!)),
    ])
    s.add(currentSeason)
    return [...s].sort().reverse()
  }, [tech, matches, currentSeason])

  if (loading) return <Spinner />

  const nextMatch = [...matches].reverse().find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  const lastTech = tech[0] || null

  const seasonTech = tech.filter(t => seasonOf(t.match_date) === season)
  const seasonMatches = matches.filter(m => m.match_date && seasonOf(m.match_date) === season)
  const played = seasonMatches.filter(m => m.minutes != null && m.minutes > 0)
  const totMin = played.reduce((s, m) => s + (m.minutes || 0), 0)
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
  const goals = seasonMatches.reduce((s, m) => s + (m.goals || 0), 0)
  const assists = seasonMatches.reduce((s, m) => s + (m.assists || 0), 0)

  // Ultime 5 giocate in assoluto (rating), indipendenti dalla stagione selezionata.
  const last5 = matches.filter(m => m.minutes != null && Number(m.rating) > 0).slice(0, 5).reverse()
  const maxR = Math.max(10, ...last5.map(m => Number(m.rating) || 0))

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Hero: giocatore + casa della stagione */}
      {player && (
        <div className="grid g2" style={{ gap: 14 }}>
          <div className="card card-lg flex gap" style={{ gap: 18, alignItems: 'center' }}>
            {player.photo_url && <img src={player.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border-2)' }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 750 }}>{player.name}</div>
              <div className="muted">{player.position} · {player.team_name} ({player.team_country})</div>
              <div className="flex wrap gap" style={{ gap: 16, marginTop: 10 }}>
                <MiniFact k="Età" v={player.age} />
                <MiniFact k="Altezza" v={player.height} />
                <MiniFact k="Piede" v={player.preferred_foot} />
                <MiniFact k="Maglia" v={player.shirt_number ? '#' + player.shirt_number : '—'} />
              </div>
            </div>
          </div>
          <div className="card stadium-card">
            {player.stadium_photo_url && <img className="stadium-photo" src={player.stadium_photo_url} alt="" />}
            <div className="stadium-overlay">
              <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px' }}>Casa · stagione {currentSeason}</div>
              <div style={{ fontWeight: 750, fontSize: 15 }}>{player.stadium_name || '—'}</div>
              {player.stadium_capacity && <div className="faint" style={{ fontSize: 12 }}>{player.stadium_capacity.toLocaleString('it-IT')} posti</div>}
            </div>
          </div>
        </div>
      )}

      {/* Prossima partita (contesto calcistico) */}
      <div className="card">
        <div className="card-head"><div className="card-title">Prossima partita</div></div>
        {nextMatch ? (
          <div>
            <div style={{ fontSize: 17, fontWeight: 750 }}>{nextMatch.home_team} vs {nextMatch.away_team}</div>
            <div className="muted" style={{ marginTop: 4 }}>{nextMatch.league}{nextMatch.round ? ` · ${nextMatch.round}` : ''}</div>
            <div className="flex gap wrap" style={{ marginTop: 10, gap: 8 }}>
              <Badge tone="accent">{fmtDateTime(nextMatch.match_date)}</Badge>
              <Badge>{nextMatch.venue === 'Home' ? 'In casa' : 'Trasferta'}</Badge>
            </div>
          </div>
        ) : <div className="faint" style={{ padding: '8px 0' }}>Nessuna partita in programma al momento.</div>}
      </div>

      {/* Ultima partita: tutte le stats */}
      {lastTech && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Ultima partita · {lastTech.match_name}</div>
            <div className="card-hint">{fmtDate(lastTech.match_date)} · {lastTech.competition}</div>
          </div>
          <LastMatchGrid m={lastTech} />
        </div>
      )}

      {/* Ultime 5: andamento rating */}
      {last5.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Ultime 5 · andamento rating</div><div className="card-hint">scala 0–10</div></div>
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

      {/* Stagione selezionabile (default: quella in corso) */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Stagione {season}</div>
          <Select value={season} onChange={e => setSeason(e.target.value)} style={{ width: 130 }}>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div className="grid g4" style={{ gap: 10, marginBottom: seasonTech.length ? 14 : 0 }}>
          <Stat icon={<Icon name="check" size={13} />} label="Presenze" value={played.length} sub={`${totMin}' giocati`} />
          <Stat icon={<Icon name="star" size={13} />} label="Rating medio" value={avgRating ? avgRating.toFixed(2) : '—'} tone="var(--accent)" sub={`${ratings.length} valutazioni`} />
          <Stat icon={<Icon name="ball" size={13} />} label="Gol" value={goals} />
          <Stat icon={<Icon name="send" size={13} />} label="Assist" value={assists} />
        </div>
        {seasonTech.length === 0 ? (
          <div className="faint" style={{ padding: '6px 0' }}>
            {season === currentSeason
              ? 'I dati tecnici della nuova stagione arrivano con le prime partite.'
              : 'Nessun dato tecnico registrato per questa stagione.'}
          </div>
        ) : (
          <SeasonBlock stats={seasonTech} />
        )}
      </div>

      {/* Dettaglio tecnico partita per partita (stagione selezionata) */}
      {seasonTech.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Partita per partita · {season}</div>
            <div className="card-hint">{seasonTech.length} partite</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr>
                <th>Data</th><th>Match</th><th>Comp.</th><th>Min.</th>
                <th>Pass %</th><th>Avanti %</th><th>Lanci %</th><th>Duelli %</th><th>Aerei %</th><th>Azioni %</th><th>Int.</th><th>Rec.</th><th>xG</th>
              </tr></thead>
              <tbody>
                {seasonTech.map(t => (
                  <tr key={t.id}>
                    <td className="faint">{fmtDate(t.match_date)}</td>
                    <td><b>{t.match_name}</b></td>
                    <td className="muted">{t.competition === 'UEFA Champions League' ? 'UCL' : 'SL'}</td>
                    <td className="mono">{t.minutes ?? '—'}</td>
                    <Pct v={t.pass_pct} n={t.passaggi_accurati} d={t.passaggi} />
                    <Pct v={t.passaggi_avanti_pct} n={t.passaggi_avanti_accurati} d={t.passaggi_avanti} />
                    <Pct v={t.lanci_lunghi_pct} n={t.lanci_lunghi_accurati} d={t.lanci_lunghi} />
                    <Pct v={t.duelli_pct} n={t.duelli_vinti} d={t.duelli} />
                    <Pct v={t.duelli_aerei_pct} n={t.duelli_aerei_vinti} d={t.duelli_aerei} />
                    <Pct v={t.azioni_pct} n={t.azioni_riuscite} d={t.azioni_totali} />
                    <td className="mono">{t.intercetti ?? '—'}</td>
                    <td className="mono">{t.palle_recuperate ?? '—'}</td>
                    <td className="mono">{t.xg ? Number(t.xg).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Storico competizioni (API) */}
      {stats.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Storico competizioni</div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Stagione</th><th>Competizione</th><th>Pres.</th><th>Min.</th><th>Gol</th><th>Assist</th><th>Rating</th></tr></thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.id}>
                    <td><b>{s.season}</b></td><td>{s.competition || '—'}</td><td>{s.appearances ?? '—'}</td>
                    <td className="mono">{s.minutes ?? '—'}</td><td>{s.goals ?? 0}</td><td>{s.assists ?? 0}</td>
                    <td>{s.rating ? <Badge tone={s.rating >= 7 ? 'green' : undefined}>{s.rating.toFixed(2)}</Badge> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {news.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Rassegna stampa</div></div>
          <div className="list">
            {news.map(n => (
              <a className="row" key={n.id} href={n.url || '#'} target="_blank" rel="noreferrer">
                <div className="row-main">
                  <div className="row-title">{n.title}</div>
                  <div className="row-sub">{n.source} · {fmtDate(n.published_at)}</div>
                </div>
                <span className="faint">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniFact({ k, v }: { k: string; v: any }) {
  return <div><div className="faint" style={{ fontSize: 11 }}>{k}</div><div style={{ fontWeight: 700, fontSize: 15 }}>{v ?? '—'}</div></div>
}

function Pct({ v, n, d }: { v: number | null; n: number | null; d: number | null }) {
  const val = v == null ? null : Number(v)
  const color = val == null ? undefined : val >= 70 ? 'var(--green)' : val < 50 ? 'var(--gold)' : undefined
  return (
    <td className="mono" title={n != null && d != null ? `${n}/${d}` : undefined} style={{ color }}>
      {val == null ? '—' : `${val}%`}
    </td>
  )
}
