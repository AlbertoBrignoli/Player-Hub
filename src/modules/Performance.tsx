import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { Spinner, Stat, Badge, Select } from '../components/ui'
import { SeasonBlock, LastMatchGrid } from '../components/statbits'
import { ApiSeason, ApiMatchList, ApiCareer, ApiTrophies, ApiTransfers, ApiInjuries, type ApiSeasonRow, type ApiExtra } from '../components/apistats'
import Icon from '../components/Icon'
import { fmtDate, fmtMatchDateTime, seasonOf } from '../lib/format'
import type { Player, Match, StatsMatch } from '../lib/types'

interface News { id: string; title: string; source: string | null; url: string | null; published_at: string | null }

export default function Performance({ goto }: { goto?: (r: string) => void }) {
  void goto
  const { athleteId, athleteTz } = useAthlete()
  const { t } = useLang()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [stats, setStats] = useState<ApiSeasonRow[]>([])
  const [extra, setExtra] = useState<ApiExtra | null>(null)
  const [news, setNews] = useState<News[]>([])
  const [tech, setTech] = useState<StatsMatch[]>([])
  const currentSeason = seasonOf(new Date())
  const [season, setSeason] = useState(currentSeason)

  useEffect(() => {
    if (!athleteId) return
    (async () => {
      const pid = athleteId
      const [p, m, s, n, t, x] = await Promise.all([
        supabase.from('player').select('*').eq('api_player_id', pid).maybeSingle(),
        supabase.from('matches').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
        supabase.from('player_stats_api').select('*').eq('player_id', pid).order('season', { ascending: false }),
        supabase.from('news').select('id,title,source,url,published_at').eq('player_id', pid).order('published_at', { ascending: false }).limit(6),
        supabase.from('player_stats_match').select('*').eq('player_id', pid).order('match_date', { ascending: false }),
        supabase.from('player_api_extra').select('*').eq('player_id', pid).maybeSingle(),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setStats((s.data as ApiSeasonRow[]) || [])
      setExtra((x.data as ApiExtra) || null)
      setNews((n.data as News[]) || [])
      setTech((t.data as StatsMatch[]) || [])
      setLoading(false)
    })()
  }, [athleteId])

  // Ultima partita GIOCATA (dal record matches, che ha tutto il dettaglio API).
  const lastMatch = useMemo(
    () => (matches || []).find(x => x.status === 'FT' && (x.minutes || 0) > 0) || null,
    [matches],
  )

  const seasons = useMemo(() => {
    const s = new Set<string>([
      ...tech.map(t => seasonOf(t.match_date)),
      ...matches.filter(m => m.match_date).map(m => seasonOf(m.match_date!)),
      ...stats.filter(r => r.season && (r.appearances || 0) > 0).map(r => `${r.season}/${String((r.season! + 1) % 100).padStart(2, '0')}`),
    ])
    s.add(currentSeason)
    return [...s].sort().reverse()
  }, [tech, matches, stats, currentSeason])

  if (loading) return <Spinner />

  const nextMatch = [...matches].reverse().find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  const seasonYear = Number(season.slice(0, 4))

  // Stagione: fonte principale = statistiche di stagione API-Football (player_stats_api.raw).
  const seasonApi = stats.filter(s => s.season === seasonYear && ((s.appearances || 0) > 0 || s.raw))
    .sort((a, b) => (b.appearances || 0) - (a.appearances || 0))
  const seasonMatches = matches.filter(m => m.match_date && seasonOf(m.match_date) === season
    && new Date(m.match_date).getTime() < Date.now() && m.status === 'FT')
  // Ripiego se API non ha ancora la stagione: totali dalle partite giocate.
  const played = seasonMatches.filter(m => (m.minutes || 0) > 0)
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

  // Dati avanzati (report partita importati a parte: xG, lanci, duelli aerei...): solo se ci sono.
  const seasonTech = tech.filter(x => seasonOf(x.match_date) === season)
  const hasAdvanced = seasonTech.some(x => x.xg != null || x.passaggi_avanti != null || x.lanci_lunghi != null
    || x.duelli_aerei != null || x.azioni_totali != null || x.palle_recuperate != null)

  // Ultime 5 giocate in assoluto (voto), indipendenti dalla stagione selezionata.
  const last5 = matches.filter(m => (m.minutes || 0) > 0 && Number(m.rating) > 0).slice(0, 5).reverse()
  const maxR = Math.max(10, ...last5.map(m => Number(m.rating) || 0))

  // Profilo API: luogo di nascita, infortunio in corso, numero di maglia della stagione.
  const prof = extra?.profile
  const curRaw = stats.find(s => s.season === Number(currentSeason.slice(0, 4)) && s.raw?.games?.number)?.raw
  const shirt = curRaw?.games?.number ?? player?.shirt_number
  const trophies = extra?.trophies || []
  const transfers = extra?.transfers || []
  const sidelined = extra?.sidelined || []

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Hero: giocatore + casa della stagione */}
      {player && (
        <div className="grid g2" style={{ gap: 14 }}>
          <div className="card card-lg flex gap" style={{ gap: 18, alignItems: 'center' }}>
            {player.photo_url && <img src={player.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border-2)' }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex wrap" style={{ gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 750 }}>{player.name}</div>
                {prof?.injured && <Badge tone="red">Infortunato</Badge>}
              </div>
              <div className="muted">{player.position} · {player.team_name} ({player.team_country})</div>
              <div className="flex wrap gap" style={{ gap: 16, marginTop: 10 }}>
                <MiniFact k="Età" v={player.age} />
                <MiniFact k="Altezza" v={player.height ? `${String(player.height).replace(/\s*cm/i, '')} cm` : null} />
                {player.weight && <MiniFact k="Peso" v={`${String(player.weight).replace(/\s*kg/i, '')} kg`} />}
                <MiniFact k="Piede" v={player.preferred_foot === 'Right' ? 'Destro' : player.preferred_foot === 'Left' ? 'Sinistro' : player.preferred_foot} />
                <MiniFact k="Maglia" v={shirt ? '#' + shirt : '—'} />
              </div>
              {prof?.birth?.place && (
                <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                  Nato a {prof.birth.place}{prof.birth.country ? ` (${prof.birth.country})` : ''}{prof.birth.date ? ` il ${fmtDate(prof.birth.date)}` : ''}
                </div>
              )}
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
              <Badge tone="accent">{fmtMatchDateTime(nextMatch.match_date, athleteTz)}</Badge>
              <Badge>{(nextMatch.venue || '').toLowerCase() === 'home' ? 'In casa' : 'Trasferta'}</Badge>
            </div>
          </div>
        ) : <div className="faint" style={{ padding: '8px 0' }}>Nessuna partita in programma al momento.</div>}
      </div>

      {/* Ultima partita: tutte le stats fornite da API-Football */}
      {lastMatch && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Ultima partita · {lastMatch.home_team} - {lastMatch.away_team}</div>
            <div className="card-hint">{fmtDate(lastMatch.match_date)} · {lastMatch.league}</div>
          </div>
          <LastMatchGrid m={lastMatch} />
        </div>
      )}

      {/* Ultime 5: andamento voto */}
      {last5.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">{t("Ultime 5 · andamento rating")}</div><div className="card-hint">scala 0–10</div></div>
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
        {seasonApi.length > 0 ? (
          <ApiSeason rows={seasonApi} />
        ) : played.length > 0 ? (
          <div className="grid g4" style={{ gap: 10 }}>
            <Stat icon={<Icon name="check" size={13} />} label={t("Presenze")} value={played.length} sub={`${played.reduce((a, m) => a + (m.minutes || 0), 0)}' giocati`} />
            <Stat icon={<Icon name="star" size={13} />} label={t("Rating medio")} value={avgRating ? avgRating.toFixed(2) : '—'} tone="var(--accent)" />
            <Stat icon={<Icon name="ball" size={13} />} label={t("Gol")} value={played.reduce((a, m) => a + (m.goals || 0), 0)} />
            <Stat icon={<Icon name="send" size={13} />} label={t("Assist")} value={played.reduce((a, m) => a + (m.assists || 0), 0)} />
          </div>
        ) : (
          <div className="faint" style={{ padding: '6px 0' }}>
            {season === currentSeason ? 'Le statistiche della nuova stagione arrivano con le prime partite.' : 'Nessuna statistica per questa stagione.'}
          </div>
        )}
      </div>

      {/* Partita per partita (stagione selezionata) */}
      {seasonMatches.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Partita per partita · {season}</div>
            <div className="card-hint">{played.length} giocate</div>
          </div>
          <ApiMatchList matches={seasonMatches} />
        </div>
      )}

      {/* Dati avanzati da report partita (non API-Football): solo se presenti */}
      {hasAdvanced && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Dati avanzati · {season}</div>
            <div className="card-hint">report partita</div>
          </div>
          <SeasonBlock stats={seasonTech} />
        </div>
      )}

      {/* Carriera */}
      {stats.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">{t("Carriera")}</div></div>
          <ApiCareer rows={stats} />
        </div>
      )}

      {trophies.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Trofei</div></div>
          <ApiTrophies list={trophies} />
        </div>
      )}

      {transfers.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Trasferimenti</div></div>
          <ApiTransfers list={transfers} />
        </div>
      )}

      {sidelined.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">Storico infortuni</div></div>
          <ApiInjuries list={sidelined} />
        </div>
      )}

      {news.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">{t("Rassegna stampa")}</div></div>
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

      {extra?.updated_at && (
        <div className="faint" style={{ fontSize: 11.5, textAlign: 'center' }}>
          Dati API-Football · carriera aggiornata il {fmtDate(extra.updated_at)}
        </div>
      )}
    </div>
  )
}

function MiniFact({ k, v }: { k: string; v: any }) {
  return <div><div className="faint" style={{ fontSize: 11 }}>{k}</div><div style={{ fontWeight: 700, fontSize: 15 }}>{v ?? '—'}</div></div>
}
