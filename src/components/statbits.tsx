// Mattoncini condivisi per le statistiche (Dashboard + Performance).
import { Badge } from './ui'
import type { StatsMatch } from '../lib/types'
import { roleOf, isCleanSheet } from './apistats'

export function SFact({ k, v, big }: { k: string; v: any; big?: boolean }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 11 }}>{k}</div>
      <div style={{ fontWeight: 750, fontSize: big ? 20 : 15 }}>{v ?? '—'}</div>
    </div>
  )
}

export function SPct({ k, pct, n, d }: { k: string; pct: number | null; n?: number | null; d?: number | null }) {
  const val = pct == null ? null : Number(pct)
  const color = val == null ? undefined : val >= 70 ? 'var(--green)' : val >= 50 ? undefined : 'var(--gold)'
  return (
    <div title={n != null && d != null ? `${n}/${d}` : undefined}>
      <div className="faint" style={{ fontSize: 11 }}>{k}</div>
      <div style={{ fontWeight: 750, fontSize: 17, color }}>{val == null ? '—' : `${val}%`}</div>
      {n != null && d != null && <div className="faint" style={{ fontSize: 10.5 }}>{n}/{d}</div>}
    </div>
  )
}

// Griglia statistiche di una singola partita: legge dal record `matches`
// (tutti i dati che API-Football fornisce) e mostra SOLO le voci pertinenti al
// RUOLO del giocatore: Portiere, Difensore, Centrocampista, Attaccante.
// Una voce che API non fornisce per quella partita non compare (niente "—").
export function LastMatchGrid({ m }: { m: any }) {
  const role = roleOf(m.position) // G / D / M / F
  const isGK = role === 'G' || (role === '' && Number(m.saves) > 0)
  const wpct = (n: any, d: any) => (d ? Math.round(Number(n) * 100 / Number(d)) : null)
  const has = (v: any) => v !== null && v !== undefined && v !== ''
  const bits: any[] = []
  const F = (k: string, v: any, ok = has(v)) => { if (ok) bits.push(<SFact key={k} k={k} v={v} />) }
  const P = (k: string, pct: any, n?: any, d?: any) => { if (pct != null) bits.push(<SPct key={k} k={k} pct={pct} n={n} d={d} />) }
  const shots = () => F('Tiri (in porta)', `${m.shots_total} (${m.shots_on ?? 0})`, has(m.shots_total))
  const dribbling = () => P('Dribbling riusciti', wpct(m.dribbles_success, m.dribbles_attempts), m.dribbles_success, m.dribbles_attempts)
  const keyPass = () => F('Passaggi chiave', m.passes_key)
  const duels = () => P('Duelli vinti', wpct(m.duels_won, m.duels_total), m.duels_won, m.duels_total)
  const tackles = () => F('Contrasti', m.tackles)
  const interc = () => F('Intercetti', m.interceptions)

  // Sempre in testa
  F('Voto', m.rating != null ? Number(m.rating).toFixed(1) : null)
  F('Minuti', `${m.minutes}′${m.is_substitute ? ' (sub.)' : ''}`, has(m.minutes))

  if (isGK) {
    // PORTIERE
    F('Parate', m.saves)
    F('Gol subiti', m.goals_conceded)
    // parate sui tiri in porta subiti (parate + gol)
    if (has(m.saves) && has(m.goals_conceded) && Number(m.saves) + Number(m.goals_conceded) > 0)
      P('Parate su tiri in porta', wpct(m.saves, Number(m.saves) + Number(m.goals_conceded)), m.saves, Number(m.saves) + Number(m.goals_conceded))
    if (isCleanSheet(m)) F('Porta inviolata', 'Sì')
    if (m.penalty_saved) F('Rigori parati', m.penalty_saved)
    duels()
  } else {
    // GIOCATORE DI MOVIMENTO — sempre gol/assist
    F('Gol / Assist', `${m.goals ?? 0} / ${m.assists ?? 0}`, true)
    if (role === 'F') {           // ATTACCANTE
      shots(); dribbling(); keyPass(); duels()
      F('Fuorigioco', m.offsides)
      if (m.penalty_scored || m.penalty_missed) F('Rigori (seg/sbagl)', `${m.penalty_scored ?? 0} / ${m.penalty_missed ?? 0}`)
    } else if (role === 'M') {    // CENTROCAMPISTA
      keyPass(); dribbling(); duels(); tackles(); interc(); shots()
    } else if (role === 'D') {    // DIFENSORE
      duels(); tackles(); interc()
      F('Tiri respinti', m.blocks)
    } else {                      // ruolo non noto — set generale
      shots(); duels(); tackles(); interc()
    }
  }

  // Comuni finali
  P('Precisione passaggi', wpct(m.passes_accuracy, m.passes_total), m.passes_accuracy, m.passes_total)
  F('Passaggi', m.passes_total)
  F('Falli (subiti / fatti)', `${m.fouls_drawn ?? 0} / ${m.fouls_committed ?? 0}`, has(m.fouls_drawn) || has(m.fouls_committed))
  F('Gialli / Rossi', `${m.yellow_cards ?? 0} / ${m.red_cards ?? 0}`, has(m.yellow_cards) || has(m.red_cards))

  return <div className="kv-grid" style={{ gap: 12 }}>{bits}</div>
}

// Aggregato di una stagione: totali, percentuali sui totali, spacco per competizione.
export function SeasonBlock({ stats }: { stats: StatsMatch[] }) {
  const comps = [...new Set(stats.map(s => s.competition))]
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
        <SFact k="Gialli / Rossi" v={`${tot.gialli} / ${tot.rossi}`} big />
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
