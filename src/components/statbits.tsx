// Mattoncini condivisi per le statistiche (Dashboard + Performance).
import { Badge } from './ui'
import type { StatsMatch } from '../lib/types'

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
  const color = val == null ? undefined : val >= 70 ? 'var(--green)' : val >= 50 ? 'var(--accent)' : 'var(--gold)'
  return (
    <div title={n != null && d != null ? `${n}/${d}` : undefined}>
      <div className="faint" style={{ fontSize: 11 }}>{k}</div>
      <div style={{ fontWeight: 750, fontSize: 17, color }}>{val == null ? '—' : `${val}%`}</div>
      {n != null && d != null && <div className="faint" style={{ fontSize: 10.5 }}>{n}/{d}</div>}
    </div>
  )
}

// Griglia statistiche di una singola partita: legge dal record `matches`
// (tutti i dati che API-Football fornisce). Si adatta al ruolo portiere.
export function LastMatchGrid({ m }: { m: any }) {
  const isGK = String(m.position || '').toUpperCase().startsWith('G') || m.saves != null
  const wpct = (n: any, d: any) => (d ? Math.round(Number(n) * 100 / Number(d)) : null)
  const has = (v: any) => v !== null && v !== undefined
  return (
    <div className="grid g4" style={{ gap: 10 }}>
      <SFact k="Voto" v={m.rating != null ? Number(m.rating).toFixed(1) : '—'} />
      <SFact k="Minuti" v={`${m.minutes ?? '—'}′`} />
      {isGK ? (
        <>
          <SFact k="Parate" v={m.saves ?? '—'} />
          <SFact k="Gol subiti" v={has(m.goals_conceded) ? m.goals_conceded : '—'} />
        </>
      ) : (
        <>
          <SFact k="Gol / Assist" v={`${m.goals ?? 0} / ${m.assists ?? 0}`} />
          <SFact k="Tiri (in porta)" v={has(m.shots_total) ? `${m.shots_total} (${m.shots_on ?? 0})` : '—'} />
        </>
      )}
      <SFact k="Gialli / Rossi" v={`${m.yellow_cards ?? 0} / ${m.red_cards ?? 0}`} />
      <SPct k="Precisione passaggi" pct={m.passes_accuracy} />
      <SFact k="Passaggi" v={m.passes_total ?? '—'} />
      <SFact k="Passaggi chiave" v={has(m.passes_key) ? m.passes_key : '—'} />
      {!isGK && <SPct k="Dribbling riusciti" pct={wpct(m.dribbles_success, m.dribbles_attempts)} n={m.dribbles_success} d={m.dribbles_attempts} />}
      <SPct k="Duelli vinti" pct={wpct(m.duels_won, m.duels_total)} n={m.duels_won} d={m.duels_total} />
      <SFact k="Contrasti" v={has(m.tackles) ? m.tackles : '—'} />
      <SFact k="Intercetti" v={has(m.interceptions) ? m.interceptions : '—'} />
      <SFact k="Falli (subiti / fatti)" v={`${m.fouls_drawn ?? 0} / ${m.fouls_committed ?? 0}`} />
      <SFact k="Fuorigioco" v={has(m.offsides) ? m.offsides : '—'} />
      {(m.penalty_scored || m.penalty_missed || m.penalty_saved || m.penalty_won || m.penalty_committed) ? (
        <SFact k={isGK ? 'Rigori parati' : 'Rigori (seg/sbagl)'} v={isGK ? (m.penalty_saved ?? 0) : `${m.penalty_scored ?? 0} / ${m.penalty_missed ?? 0}`} />
      ) : null}
    </div>
  )
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
