import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner, Stat, Badge, Empty } from '../components/ui'
import { fmtDate } from '../lib/format'
import type { Player, Match, SeasonStat, StatsMatch, StatsSeason } from '../lib/types'

interface News { id: string; title: string; source: string | null; url: string | null; published_at: string | null }

export default function Performance() {
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [stats, setStats] = useState<SeasonStat[]>([])
  const [news, setNews] = useState<News[]>([])
  const [tech, setTech] = useState<StatsMatch[]>([])
  const [techSeason, setTechSeason] = useState<StatsSeason[]>([])

  useEffect(() => {
    (async () => {
      const [p, m, s, n, t, ts] = await Promise.all([
        supabase.from('player').select('*').limit(1).maybeSingle(),
        supabase.from('matches').select('*').order('match_date', { ascending: false }),
        supabase.from('player_stats_api').select('*').order('season', { ascending: false }),
        supabase.from('news').select('id,title,source,url,published_at').order('published_at', { ascending: false }).limit(6),
        supabase.from('player_stats_match').select('*').order('match_date', { ascending: false }),
        supabase.from('player_stats_season').select('*').order('competition'),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setStats((s.data as SeasonStat[]) || [])
      setNews((n.data as News[]) || [])
      setTech((t.data as StatsMatch[]) || [])
      setTechSeason((ts.data as StatsSeason[]) || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const played = matches.filter(m => m.minutes != null)
  const totMin = played.reduce((s, m) => s + (m.minutes || 0), 0)
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
  const goals = matches.reduce((s, m) => s + (m.goals || 0), 0)
  const assists = matches.reduce((s, m) => s + (m.assists || 0), 0)

  const chartMatches = [...played].reverse().slice(-8)
  const maxR = Math.max(10, ...chartMatches.map(m => Number(m.rating) || 0))

  return (
    <div className="grid" style={{ gap: 18 }}>
      {player && (
        <div className="card card-lg flex gap" style={{ gap: 18, alignItems: 'center' }}>
          {player.photo_url && <img src={player.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border-2)' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 750 }}>{player.name}</div>
            <div className="muted">{player.position} · {player.team_name} ({player.team_country})</div>
          </div>
          <div className="flex wrap gap" style={{ gap: 22 }}>
            <MiniFact k="Età" v={player.age} />
            <MiniFact k="Altezza" v={player.height} />
            <MiniFact k="Peso" v={player.weight} />
            <MiniFact k="Piede" v={player.preferred_foot} />
            <MiniFact k="Maglia" v={player.shirt_number ? '#' + player.shirt_number : '—'} />
          </div>
        </div>
      )}

      <div className="grid g4">
        <Stat icon="🎯" label="Presenze" value={played.length} sub={`${totMin}' giocati`} />
        <Stat icon="⭐" label="Rating medio" value={avgRating ? avgRating.toFixed(2) : '—'} tone="var(--accent)" sub={`${ratings.length} valutazioni`} />
        <Stat icon="⚽" label="Gol" value={goals} />
        <Stat icon="🅰️" label="Assist" value={assists} />
      </div>

      {chartMatches.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Andamento rating · ultime partite</div><div className="card-hint">scala 0–10</div></div>
          <div className="chart">
            {chartMatches.map(m => {
              const r = Number(m.rating) || 0
              return (
                <div className="chart-col" key={m.id}>
                  <div className="chart-v" style={{ color: r >= 7 ? 'var(--green)' : r >= 6 ? 'var(--text)' : 'var(--red)' }}>{r ? r.toFixed(1) : '—'}</div>
                  <div className="chart-bar" style={{ height: `${(r / maxR) * 100}%` }} />
                  <div className="chart-x">{m.opponent?.slice(0, 3).toUpperCase()}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {techSeason.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">📐 Dati tecnici · medie stagionali</div>
            <div className="card-hint">percentuali calcolate da Supabase</div>
          </div>
          <div className="grid g2" style={{ gap: 14 }}>
            {techSeason.map(c => (
              <div className="card" key={c.competition} style={{ background: 'var(--bg-2)' }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>{c.competition} <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>· {c.partite} partite, {c.minuti}'</span></div>
                <div className="grid g3" style={{ gap: 10 }}>
                  <PctFact k="Precisione passaggi" v={c.pass_pct} sub={`${c.passaggi_media}/partita`} />
                  <PctFact k="Passaggi in avanti" v={c.passaggi_avanti_pct} sub={`${c.passaggi_avanti_media}/partita`} />
                  <PctFact k="Lanci lunghi" v={c.lanci_lunghi_pct} sub={`${c.lanci_lunghi_media}/partita`} />
                  <PctFact k="Duelli vinti" v={c.duelli_pct} sub={`${c.duelli_media}/partita`} />
                  <PctFact k="Duelli aerei" v={c.duelli_aerei_pct} sub={`${c.duelli_aerei_media}/partita`} />
                  <PctFact k="Azioni riuscite" v={c.azioni_pct} />
                  <MiniFact k="Intercetti/partita" v={c.intercetti_media} />
                  <MiniFact k="Recuperi/partita" v={c.palle_recuperate_media} />
                  <MiniFact k="xG medio" v={c.xg_medio} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tech.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">🔬 Dati tecnici · partita per partita</div>
            <div className="card-hint">{tech.length} partite</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr>
                <th>Data</th><th>Match</th><th>Comp.</th><th>Min.</th>
                <th>Pass %</th><th>Avanti %</th><th>Lanci %</th><th>Duelli %</th><th>Aerei %</th><th>Azioni %</th><th>Int.</th><th>Rec.</th><th>xG</th>
              </tr></thead>
              <tbody>
                {tech.map(t => (
                  <tr key={t.id}>
                    <td className="faint">{fmtDate(t.match_date)}</td>
                    <td><b>{t.match_name}</b></td>
                    <td className="muted">{t.competition === 'UEFA Champions League' ? 'UCL' : 'SLG'}</td>
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

      {stats.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Statistiche stagionali</div></div>
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

      <div className="card">
        <div className="card-head"><div className="card-title">Ultime partite</div><div className="card-hint">{matches.length} totali</div></div>
        {matches.length === 0 ? <Empty icon="⚽" title="Nessuna partita registrata" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Data</th><th>Match</th><th>Lega</th><th>Min.</th><th>G</th><th>A</th><th>Rating</th></tr></thead>
              <tbody>
                {matches.slice(0, 15).map(m => {
                  const r = Number(m.rating) || 0
                  return (
                    <tr key={m.id}>
                      <td className="faint">{fmtDate(m.match_date)}</td>
                      <td><b>{m.home_team}</b> vs {m.away_team}</td>
                      <td className="muted">{m.league}</td>
                      <td className="mono">{m.minutes ?? '—'}</td>
                      <td>{m.goals || 0}</td><td>{m.assists || 0}</td>
                      <td>{r ? <Badge tone={r >= 7 ? 'green' : r < 6 ? 'red' : undefined}>{r.toFixed(1)}</Badge> : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {news.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">📰 Rassegna stampa</div></div>
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

function PctFact({ k, v, sub }: { k: string; v: number | null; sub?: string }) {
  const n = v == null ? null : Number(v)
  const color = n == null ? undefined : n >= 70 ? 'var(--green)' : n >= 50 ? 'var(--accent)' : 'var(--gold)'
  return (
    <div>
      <div className="faint" style={{ fontSize: 11 }}>{k}</div>
      <div style={{ fontWeight: 750, fontSize: 17, color }}>{n == null ? '—' : `${n}%`}</div>
      {sub && <div className="faint" style={{ fontSize: 10.5 }}>{sub}</div>}
    </div>
  )
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
