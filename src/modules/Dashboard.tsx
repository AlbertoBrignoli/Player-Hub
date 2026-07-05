import { useEffect, useMemo, useState } from 'react'
import { supabase, PLAYER_NAME } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Stat, Spinner, Badge, Select } from '../components/ui'
import { fmtDate, fmtDateTime, daysUntil, seasonOf } from '../lib/format'
import type { Player, Task, EventItem, Contract, Match, StatsMatch } from '../lib/types'

export default function Dashboard({ goto }: { goto: (r: string) => void }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [tech, setTech] = useState<StatsMatch[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const currentSeason = seasonOf(new Date())
  const [season, setSeason] = useState(currentSeason)

  useEffect(() => {
    (async () => {
      const [p, m, t, tk, ev, ct] = await Promise.all([
        supabase.from('player').select('*').limit(1).maybeSingle(),
        supabase.from('matches').select('*').order('match_date', { ascending: true }),
        supabase.from('player_stats_match').select('*').order('match_date', { ascending: false }),
        supabase.from('crm_tasks').select('*'),
        supabase.from('crm_events').select('*').gte('start_at', new Date().toISOString()).order('start_at').limit(3),
        supabase.from('crm_contracts').select('*'),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setTech((t.data as StatsMatch[]) || [])
      setTasks((tk.data as Task[]) || [])
      setEvents((ev.data as EventItem[]) || [])
      setContracts((ct.data as Contract[]) || [])
      setLoading(false)
    })()
  }, [])

  const seasons = useMemo(() => {
    const s = new Set<string>(tech.map(t => seasonOf(t.match_date)))
    s.add(currentSeason)
    return [...s].sort().reverse()
  }, [tech, currentSeason])

  const seasonStats = useMemo(() => tech.filter(t => seasonOf(t.match_date) === season), [tech, season])
  const lastMatch = tech[0] || null
  const upcoming = matches.filter(m => m.match_date && new Date(m.match_date).getTime() > Date.now()).slice(0, 5)

  if (loading) return <Spinner />

  const openTasks = tasks.filter(t => t.status !== 'done')
  const nextContractExpiry = contracts
    .filter(c => c.end_date)
    .map(c => ({ c, d: daysUntil(c.end_date) }))
    .filter(x => x.d != null && x.d >= 0)
    .sort((a, b) => (a.d! - b.d!))[0]

  const greeting = new Date().getHours() < 13 ? 'Buongiorno' : new Date().getHours() < 19 ? 'Buon pomeriggio' : 'Buonasera'
  const firstName = (profile?.full_name || PLAYER_NAME).split(' ')[0]

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Hero */}
      <div className="card card-lg flex between wrap" style={{ gap: 20, alignItems: 'center' }}>
        <div className="flex gap" style={{ gap: 16 }}>
          {player?.photo_url
            ? <img src={player.photo_url} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border-2)' }} />
            : <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{firstName[0]}</div>}
          <div>
            <div style={{ fontSize: 20, fontWeight: 750, letterSpacing: '-.5px' }}>{greeting}, {firstName}</div>
            <div className="muted" style={{ marginTop: 3 }}>
              {player ? `${player.position} · ${player.team_name} · #${player.shirt_number ?? '—'}` : 'Gestione riservata AUVI'}
            </div>
          </div>
        </div>
        {lastMatch && (
          <div className="card" style={{ background: 'var(--bg-2)', minWidth: 220 }}>
            <div className="stat-label">Ultima partita</div>
            <div style={{ fontWeight: 700, marginTop: 4, fontSize: 13.5 }}>{lastMatch.match_name}</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{fmtDate(lastMatch.match_date)} · {lastMatch.minutes}′ in campo</div>
          </div>
        )}
      </div>

      {/* Prossime partite */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">📅 Prossime partite</div>
          <button className="btn btn-ghost btn-sm" onClick={() => goto('editorial')}>Calendario →</button>
        </div>
        {upcoming.length === 0 ? (
          <div className="faint" style={{ padding: '10px 0' }}>
            Nessuna partita in programma — il calendario della nuova stagione apparirà qui automaticamente.
          </div>
        ) : (
          <div className="list">
            {upcoming.map(m => (
              <div className="row" key={m.id}>
                <span className="dot" style={{ background: 'var(--accent)' }} />
                <div className="row-main">
                  <div className="row-title">{m.home_team} vs {m.away_team}</div>
                  <div className="row-sub">{m.league}{m.round ? ` · ${m.round}` : ''}{m.venue === 'Home' ? ' · in casa' : m.venue === 'Away' ? ' · trasferta' : ''}</div>
                </div>
                <div className="row-right faint" style={{ fontSize: 12 }}>{fmtDateTime(m.match_date)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ultima partita: tutte le stats */}
      {lastMatch && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">🔬 Ultima partita · {lastMatch.match_name}</div>
            <div className="card-hint">{fmtDate(lastMatch.match_date)} · {lastMatch.competition}</div>
          </div>
          <div className="grid g4" style={{ gap: 10 }}>
            <SFact k="Minuti" v={`${lastMatch.minutes ?? '—'}′`} />
            <SFact k="Gol / Assist" v={`${lastMatch.goal ?? 0} / ${lastMatch.assist ?? 0}`} />
            <SFact k="xG" v={lastMatch.xg != null ? Number(lastMatch.xg).toFixed(2) : '—'} />
            <SFact k="Cartellini" v={`${lastMatch.cartellini_gialli ?? 0}🟨 ${lastMatch.cartellini_rossi ?? 0}🟥`} />
            <SPct k="Precisione passaggi" pct={lastMatch.pass_pct} n={lastMatch.passaggi_accurati} d={lastMatch.passaggi} />
            <SPct k="Passaggi in avanti" pct={lastMatch.passaggi_avanti_pct} n={lastMatch.passaggi_avanti_accurati} d={lastMatch.passaggi_avanti} />
            <SPct k="Lanci lunghi" pct={lastMatch.lanci_lunghi_pct} n={lastMatch.lanci_lunghi_accurati} d={lastMatch.lanci_lunghi} />
            <SPct k="Azioni riuscite" pct={lastMatch.azioni_pct} n={lastMatch.azioni_riuscite} d={lastMatch.azioni_totali} />
            <SPct k="Duelli vinti" pct={lastMatch.duelli_pct} n={lastMatch.duelli_vinti} d={lastMatch.duelli} />
            <SPct k="Duelli aerei" pct={lastMatch.duelli_aerei_pct} n={lastMatch.duelli_aerei_vinti} d={lastMatch.duelli_aerei} />
            <SPct k="Duelli difensivi" pct={lastMatch.duelli_dif_pct} n={lastMatch.duelli_dif_vinti} d={lastMatch.duelli_difensivi} />
            <SFact k="Intercetti · Spazzate" v={`${lastMatch.intercetti ?? 0} · ${lastMatch.spazzate ?? 0}`} />
            <SFact k="Palle recuperate" v={lastMatch.palle_recuperate ?? '—'} />
            <SFact k="Palle perse" v={lastMatch.palle_perse ?? '—'} />
            <SFact k="Falli" v={lastMatch.falli ?? 0} />
            <SFact k="Tiri (in porta)" v={`${lastMatch.tiri ?? 0} (${lastMatch.tiri_porta ?? 0})`} />
          </div>
        </div>
      )}

      {/* Stagione con selettore */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">📊 Stagione {season}</div>
          <Select value={season} onChange={e => setSeason(e.target.value)} style={{ width: 130 }}>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        {seasonStats.length === 0 ? (
          <div className="faint" style={{ padding: '10px 0' }}>
            Nessuna partita registrata nella stagione {season}{season === currentSeason ? ' — le statistiche arrivano con le prime partite.' : '.'}
          </div>
        ) : (
          <SeasonBlock stats={seasonStats} />
        )}
      </div>

      {/* Strip gestione compatta */}
      <div className="grid g3">
        <Stat icon="✓" label="Task aperte" value={openTasks.length} tone={openTasks.length ? 'var(--accent)' : undefined}
          sub={openTasks[0]?.title || 'nessuna attività'} />
        <Stat icon="📄" label="Contratti" value={contracts.filter(c => c.status === 'active').length}
          sub={nextContractExpiry ? `scadenza tra ${nextContractExpiry.d} gg` : `${contracts.length} totali`} />
        <Stat icon="🗓" label="Prossimo impegno" value={events[0] ? fmtDate(events[0].start_at) : '—'}
          sub={events[0]?.title || 'agenda libera'} />
      </div>
    </div>
  )
}

function SeasonBlock({ stats }: { stats: StatsMatch[] }) {
  const comps = [...new Set(stats.map(s => s.competition))]
  const sum = (f: (s: StatsMatch) => number | null) => stats.reduce((a, s) => a + Number(f(s) || 0), 0)
  const agg = (rows: StatsMatch[]) => {
    const s = (f: (x: StatsMatch) => number | null) => rows.reduce((a, x) => a + Number(f(x) || 0), 0)
    const pct = (n: number, d: number) => d ? Math.round(n * 1000 / d) / 10 : null
    return {
      partite: rows.length,
      minuti: s(x => x.minutes),
      gol: s(x => x.goal),
      assist: s(x => x.assist),
      pass: pct(s(x => x.passaggi_accurati), s(x => x.passaggi)),
      avanti: pct(s(x => x.passaggi_avanti_accurati), s(x => x.passaggi_avanti)),
      lanci: pct(s(x => x.lanci_lunghi_accurati), s(x => x.lanci_lunghi)),
      duelli: pct(s(x => x.duelli_vinti), s(x => x.duelli)),
      aerei: pct(s(x => x.duelli_aerei_vinti), s(x => x.duelli_aerei)),
      azioni: pct(s(x => x.azioni_riuscite), s(x => x.azioni_totali)),
      intercetti: rows.length ? Math.round(s(x => x.intercetti) * 10 / rows.length) / 10 : 0,
      recuperi: rows.length ? Math.round(s(x => x.palle_recuperate) * 10 / rows.length) / 10 : 0,
      gialli: s(x => x.cartellini_gialli),
      rossi: s(x => x.cartellini_rossi),
    }
  }
  const tot = agg(stats)
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid g4" style={{ gap: 10 }}>
        <SFact k="Partite" v={tot.partite} big />
        <SFact k="Minuti" v={`${tot.minuti}′`} big />
        <SFact k="Gol / Assist" v={`${tot.gol} / ${tot.assist}`} big />
        <SFact k="Cartellini" v={`${tot.gialli}🟨 ${tot.rossi}🟥`} big />
      </div>
      <div className="grid g3" style={{ gap: 10 }}>
        <SPct k="Precisione passaggi" pct={tot.pass} />
        <SPct k="Passaggi in avanti" pct={tot.avanti} />
        <SPct k="Lanci lunghi" pct={tot.lanci} />
        <SPct k="Duelli vinti" pct={tot.duelli} />
        <SPct k="Duelli aerei" pct={tot.aerei} />
        <SPct k="Azioni riuscite" pct={tot.azioni} />
        <SFact k="Intercetti / partita" v={tot.intercetti} />
        <SFact k="Recuperi / partita" v={tot.recuperi} />
        <SFact k="Minuti / partita" v={tot.partite ? Math.round(tot.minuti / tot.partite) + '′' : '—'} />
      </div>
      {comps.length > 1 && (
        <div className="grid g2" style={{ gap: 10 }}>
          {comps.map(c => {
            const a = agg(stats.filter(s => s.competition === c))
            return (
              <div className="card" key={c} style={{ background: 'var(--bg-2)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13.5 }}>
                  {c} <Badge>{a.partite} partite</Badge>
                </div>
                <div className="grid g3" style={{ gap: 8 }}>
                  <SFact k="Minuti" v={`${a.minuti}′`} />
                  <SFact k="Gol / Assist" v={`${a.gol} / ${a.assist}`} />
                  <SPct k="Passaggi" pct={a.pass} />
                  <SPct k="Duelli" pct={a.duelli} />
                  <SPct k="Aerei" pct={a.aerei} />
                  <SPct k="Azioni" pct={a.azioni} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SFact({ k, v, big }: { k: string; v: any; big?: boolean }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 11 }}>{k}</div>
      <div style={{ fontWeight: 750, fontSize: big ? 20 : 15 }}>{v ?? '—'}</div>
    </div>
  )
}

function SPct({ k, pct, n, d }: { k: string; pct: number | null; n?: number | null; d?: number | null }) {
  const val = pct == null ? null : Number(pct)
  const color = val == null ? undefined : val >= 70 ? 'var(--green)' : val >= 50 ? 'var(--accent)' : 'var(--gold)'
  return (
    <div title={n != null && d != null ? `${n}/${d}` : undefined}>
      <div className="faint" style={{ fontSize: 11 }}>{k}</div>
      <div style={{ fontWeight: 750, fontSize: 17, color }}>{val == null ? '—' : `${val}%`}</div>
      {n != null && d != null && <div className="faint" style={{ fontSize: 10.5 }}>{n}/{d}</div>}
    </div>
  )
}
