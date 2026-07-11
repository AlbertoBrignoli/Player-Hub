import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { SeasonBlock } from '../components/statbits'
import { seasonOf } from '../lib/format'
import type { Player, Match, StatsMatch } from '../lib/types'

// Vista dedicata ai brand: i numeri di Lorenzo, sportivi e social. Sola lettura.
export default function MediaKit() {
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [tech, setTech] = useState<StatsMatch[]>([])
  const currentSeason = seasonOf(new Date())

  useEffect(() => {
    (async () => {
      const [p, m, t] = await Promise.all([
        supabase.from('player').select('*').limit(1).maybeSingle(),
        supabase.from('matches').select('*').order('match_date', { ascending: false }),
        supabase.from('player_stats_match').select('*').order('match_date', { ascending: false }),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setTech((t.data as StatsMatch[]) || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const played = matches.filter(m => m.minutes != null && m.minutes > 0)
  const presenze = played.length
  const minuti = played.reduce((s, m) => s + (m.minutes || 0), 0)
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
  const goals = matches.reduce((s, m) => s + (m.goals || 0), 0)
  const assists = matches.reduce((s, m) => s + (m.assists || 0), 0)
  const seasonTech = tech.filter(t => seasonOf(t.match_date) === currentSeason)
  const fmtK = (n?: number | null) => n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : String(n)

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Testata giocatore */}
      {player && (
        <div className="card card-lg flex gap wrap" style={{ gap: 18, alignItems: 'center' }}>
          {player.photo_url && <img src={player.photo_url} alt="" style={{ width: 84, height: 84, borderRadius: 18, objectFit: 'cover', border: '1px solid var(--border-2)' }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ed-kicker">Media kit · stagione {currentSeason}</div>
            <div className="ed-display" style={{ fontSize: 30, marginTop: 4 }}>{player.name}</div>
            <div className="muted" style={{ marginTop: 4 }}>{player.position} · {player.team_name} ({player.team_country}) · #{player.shirt_number ?? '—'}</div>
          </div>
          {player.instagram_url && (
            <a href={player.instagram_url} target="_blank" rel="noreferrer" className="btn"><Icon name="instagram" size={15} /> Profilo IG</a>
          )}
        </div>
      )}

      {/* Numeri social */}
      <div>
        <div className="ed-masthead"><div className="ed-masthead-t">Audience · Instagram</div><div className="ed-rule" /></div>
        <div className="grid g4">
          <div className="card stat"><div className="stat-label">Follower</div><div className="stat-value">{fmtK(player?.instagram_followers)}</div></div>
          <div className="card stat"><div className="stat-label">Engagement</div><div className="stat-value" style={{ color: 'var(--green)' }}>{player?.instagram_engagement != null ? player.instagram_engagement + '%' : '—'}</div></div>
          <div className="card stat"><div className="stat-label">Reach medio</div><div className="stat-value">{fmtK(player?.instagram_reach)}</div></div>
          <div className="card stat"><div className="stat-label">Ruolo</div><div className="stat-value" style={{ fontSize: 20 }}>Difensore</div><div className="stat-sub">titolare Champions</div></div>
        </div>
        {player?.audience_note && (
          <div className="card" style={{ marginTop: 12, background: 'var(--bg-2)' }}>
            <div className="ed-kicker" style={{ marginBottom: 6 }}>Pubblico</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>{player.audience_note}</div>
          </div>
        )}
        {(player?.instagram_followers == null) && (
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>I numeri social saranno aggiornati da AUVI.</div>
        )}
      </div>

      {/* Numeri sportivi */}
      <div>
        <div className="ed-masthead"><div className="ed-masthead-t">In campo · stagione {currentSeason}</div><div className="ed-rule" /></div>
        <div className="grid g4" style={{ marginBottom: seasonTech.length ? 16 : 0 }}>
          <div className="card stat"><div className="stat-label">Presenze</div><div className="stat-value">{presenze}</div><div className="stat-sub">{minuti}′ giocati</div></div>
          <div className="card stat"><div className="stat-label">Rating medio</div><div className="stat-value" style={{ color: avgRating && avgRating >= 7 ? 'var(--green)' : undefined }}>{avgRating ? avgRating.toFixed(2) : '—'}</div></div>
          <div className="card stat"><div className="stat-label">Gol</div><div className="stat-value">{goals}</div></div>
          <div className="card stat"><div className="stat-label">Assist</div><div className="stat-value">{assists}</div></div>
        </div>
        {seasonTech.length > 0 && <SeasonBlock stats={seasonTech} />}
      </div>

      <div className="faint" style={{ fontSize: 11.5, textAlign: 'center', padding: '4px 0 8px' }}>
        Dati riservati · condivisi da AUVI Agency per la valutazione della partnership.
      </div>
    </div>
  )
}
