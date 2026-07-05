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

// Griglia completa delle statistiche di una singola partita.
export function LastMatchGrid({ m }: { m: StatsMatch }) {
  return (
    <div className="grid g4" style={{ gap: 10 }}>
      <SFact k="Minuti" v={`${m.minutes ?? '—'}′`} />
      <SFact k="Gol / Assist" v={`${m.goal ?? 0} / ${m.assist ?? 0}`} />
      <SFact k="xG" v={m.xg != null ? Number(m.xg).toFixed(2) : '—'} />
      <SFact k="Cartellini" v={`${m.cartellini_gialli ?? 0}🟨 ${m.cartellini_rossi ?? 0}🟥`} />
      <SPct k="Precisione passaggi" pct={m.pass_pct} n={m.passaggi_accurati} d={m.passaggi} />
      <SPct k="Passaggi in avanti" pct={m.passaggi_avanti_pct} n={m.passaggi_avanti_accurati} d={m.passaggi_avanti} />
      <SPct k="Lanci lunghi" pct={m.lanci_lunghi_pct} n={m.lanci_lunghi_accurati} d={m.lanci_lunghi} />
      <SPct k="Azioni riuscite" pct={m.azioni_pct} n={m.azioni_riuscite} d={m.azioni_totali} />
      <SPct k="Duelli vinti" pct={m.duelli_pct} n={m.duelli_vinti} d={m.duelli} />
      <SPct k="Duelli aerei" pct={m.duelli_aerei_pct} n={m.duelli_aerei_vinti} d={m.duelli_aerei} />
      <SPct k="Duelli difensivi" pct={m.duelli_dif_pct} n={m.duelli_dif_vinti} d={m.duelli_difensivi} />
      <SFact k="Intercetti · Spazzate" v={`${m.intercetti ?? 0} · ${m.spazzate ?? 0}`} />
      <SFact k="Palle recuperate" v={m.palle_recuperate ?? '—'} />
      <SFact k="Palle perse" v={m.palle_perse ?? '—'} />
      <SFact k="Falli" v={m.falli ?? 0} />
      <SFact k="Tiri (in porta)" v={`${m.tiri ?? 0} (${m.tiri_porta ?? 0})`} />
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
