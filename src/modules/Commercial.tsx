// AUVI COMMERCIAL PROFILE
// "Misura il tuo valore. Scopri i brand più compatibili. Costruisci nuove opportunità."
//
// Il gemello commerciale digitale dell'atleta: profilo, score, brand fit,
// media kit, opportunità, collaborazioni e performance in un unico modulo.
// Dati riservati (note interne, margini, valutazioni) restano su tabelle
// admin-only (RLS) e non transitano mai da questa vista quando l'utente è player.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { supabase, AGENCY_NAME } from '../lib/supabase'
import { Modal, Field, Input, Textarea, Select, Badge, Empty, Spinner, Stat, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtMoney, fmtDate, fmtDateTime } from '../lib/format'
import type { Player } from '../lib/types'
import {
  COMP_META, DISCLAIMER, computeFullScore, computeCategoryFit, buildRecommendations, trendOf,
  type FullScore, type Reco,
} from '../lib/commercialScore'

// ── Vocabolari onboarding ─────────────────────────────────────────────────────
const VALUE_OPTS = ['Determinazione', 'Famiglia', 'Disciplina', 'Umiltà', 'Ambizione', 'Lealtà', 'Creatività', 'Resilienza', 'Solidarietà', 'Professionalità', 'Autenticità', 'Rispetto']
const INTEREST_OPTS = ['Moda', 'Tecnologia', 'Gaming', 'Motori', 'Musica', 'Cinema & Serie', 'Viaggi', 'Cucina', 'Fitness', 'Lettura', 'Fotografia', 'Natura', 'Arte', 'Animali']
const STYLE_OPTS = ['Elegante', 'Sportivo', 'Casual', 'Streetwear', 'Minimal', 'Premium', 'Autentico', 'Energico', 'Riservato', 'Solare']
const AVAIL_OPTS: { key: string; label: string }[] = [
  { key: 'shooting', label: 'Shooting fotografici' }, { key: 'video', label: 'Video commerciali' },
  { key: 'eventi', label: 'Eventi' }, { key: 'meet_greet', label: 'Meet & greet' },
  { key: 'social_post', label: 'Social post' }, { key: 'stories', label: 'Stories' },
  { key: 'reels', label: 'Reels' }, { key: 'presenza', label: 'Presenza fisica' },
  { key: 'lungo_periodo', label: 'Campagne di lungo periodo' }, { key: 'ambassador', label: 'Ambassador' },
  { key: 'licensing', label: 'Licensing' }, { key: 'immagine', label: "Utilizzo dell'immagine" },
]
const LANG_OPTS = ['Italiano', 'Inglese', 'Spagnolo', 'Francese', 'Tedesco', 'Portoghese', 'Greco']
const MARKET_OPTS = ['Italia', 'Grecia', 'Regno Unito', 'Spagna', 'Francia', 'Germania', 'USA', 'Sud America', 'Medio Oriente', 'Asia']
const EXCL_PRESET = [['betting', 'Betting'], ['alcol', 'Alcol'], ['politica', 'Politica']]

const OPP_STATUS: Record<string, { label: string; tone?: 'green' | 'red' | 'gold' | 'blue' | 'accent' }> = {
  nuova: { label: 'Nuova opportunità', tone: 'blue' },
  in_valutazione: { label: 'In valutazione', tone: 'gold' },
  interesse_confermato: { label: 'Interesse confermato', tone: 'green' },
  negoziazione: { label: 'Negoziazione', tone: 'gold' },
  contratto: { label: 'Contratto', tone: 'accent' },
  in_produzione: { label: 'In produzione', tone: 'blue' },
  in_approvazione: { label: 'In approvazione', tone: 'gold' },
  pubblicazione: { label: 'Pubblicazione', tone: 'blue' },
  completata: { label: 'Completata', tone: 'green' },
  non_accettata: { label: 'Non accettata', tone: 'red' },
}
const fmtN = (n: any) => (n == null || n === '' ? '—' : Number(n).toLocaleString('it-IT'))

// ═════════════════════════════════════════════════════════════════════════════
export default function Commercial() {
  const { isAdmin, role, profile: user } = useAuth()
  const { athleteId } = useAthlete()
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<any[]>([])
  const [editorial, setEditorial] = useState<any[]>([])
  const [cfg, setCfg] = useState<any>(null)
  const [cats, setCats] = useState<any[]>([])
  const [prof, setProf] = useState<any>(null)
  const [snaps, setSnaps] = useState<any[]>([])
  const [opps, setOpps] = useState<any[]>([])
  const [collabs, setCollabs] = useState<any[]>([])
  const [perf, setPerf] = useState<any[]>([])
  const [relBand, setRelBand] = useState<number | null>(null)
  const [wizard, setWizard] = useState(false)
  const snapDone = useRef(false)

  async function reload() {
    if (!athleteId) return
    const [pl, st, ed, cf, ct, pr, sn, op, cl, pf, rb] = await Promise.all([
      supabase.from('player').select('*').eq('api_player_id', athleteId).maybeSingle(),
      supabase.from('player_stats_api').select('*').eq('player_id', athleteId),
      supabase.from('crm_editorial').select('id, entry_date, type, status').eq('player_id', athleteId),
      supabase.from('cp_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('cp_brand_categories').select('*').eq('active', true).order('sort'),
      supabase.from('cp_profiles').select('*').eq('player_id', athleteId).maybeSingle(),
      supabase.from('cp_score_snapshots').select('*').eq('player_id', athleteId).order('computed_at', { ascending: false }).limit(120),
      supabase.from('cp_opportunities').select('*').eq('player_id', athleteId).order('created_at', { ascending: false }),
      supabase.from('cp_collaborations').select('*').eq('player_id', athleteId).order('created_at', { ascending: false }),
      supabase.from('cp_performance').select('*').eq('player_id', athleteId),
      supabase.rpc('cp_reliability_band', { pid: athleteId }),
    ])
    setPlayer((pl.data as Player) || null)
    setStats(st.data || [])
    setEditorial(ed.data || [])
    setCfg(cf.data || null)
    setCats(ct.data || [])
    setSnaps(sn.data || [])
    setOpps(op.data || [])
    setCollabs(cl.data || [])
    setPerf(pf.data || [])
    setRelBand(typeof rb.data === 'number' ? rb.data : null)
    let p = pr.data
    if (!p && (role === 'admin' || role === 'player')) {
      const ins = await supabase.from('cp_profiles').insert({ player_id: athleteId }).select().single()
      p = ins.data
    }
    setProf(p || {})
    if (p && !p.onboarding_completed && role === 'player') setWizard(true)
    setLoading(false)
  }
  useEffect(() => { setLoading(true); snapDone.current = false; reload() }, [athleteId])

  async function saveProf(patch: any) {
    if (!prof?.id) return
    await supabase.from('cp_profiles').update(patch).eq('id', prof.id)
    setProf((p: any) => ({ ...p, ...patch }))
  }

  const score: FullScore | null = useMemo(() => {
    if (!prof || loading) return null
    return computeFullScore(cfg, { player, stats, profile: prof, editorial, reliabilityBand: relBand, collabs, perf })
  }, [cfg, player, stats, prof, editorial, relBand, collabs, perf, loading])

  // Snapshot giornaliero → alimenta i trend 30/90gg
  useEffect(() => {
    if (!score || !athleteId || snapDone.current || role === 'brand') return
    snapDone.current = true
    const today = new Date().toISOString().slice(0, 10)
    const last = snaps[0]
    if (!last || String(last.computed_at).slice(0, 10) !== today || Math.abs(Number(last.total) - score.total) >= 1) {
      const comps: any = {}; COMP_META.forEach(m => { comps[m.key] = score.components[m.key].score })
      supabase.from('cp_score_snapshots').insert({ player_id: athleteId, total: score.total, components: comps, level: score.level, value_lo: score.valueLo, value_hi: score.valueHi }).then(() => {})
    }
  }, [score, athleteId])

  const catFits = useMemo(() => !prof ? [] : cats.map((c: any) => ({ key: c.key, name: c.name, ...computeCategoryFit(c.key, prof, player) })), [cats, prof, player])
  const topFits = catFits.filter(f => !f.excluded).sort((a, b) => b.pct - a.pct)
  const recos: Reco[] = useMemo(() => (score && prof ? buildRecommendations(prof, player, score) : []), [score, prof, player])
  const activeOpps = opps.filter(o => !['completata', 'non_accettata'].includes(o.status))

  if (loading) return <Spinner />
  if (wizard && prof) return <Onboarding profile={prof} save={saveProf} onDone={() => { setWizard(false); reload() }} onLater={() => setWizard(false)} />

  const TABS = [
    { id: 'overview', l: 'Overview' }, { id: 'valore', l: 'Il mio valore' }, { id: 'brandfit', l: 'Brand Fit' },
    { id: 'mediakit', l: 'Media Kit' }, { id: 'opportunita', l: `Opportunità${activeOpps.length ? ` · ${activeOpps.length}` : ''}` },
    { id: 'collaborazioni', l: 'Collaborazioni' }, { id: 'performance', l: 'Performance' }, { id: 'dati', l: 'Dati e preferenze' },
    ...(isAdmin ? [{ id: 'admin', l: 'Gestione AUVI' }] : []),
  ]

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* Subnav */}
      <div className="flex gap" style={{ flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : ''}`} onClick={() => setTab(t.id)}>{t.l}</button>
        ))}
      </div>

      {prof && !prof.onboarding_completed && tab !== 'admin' && (
        <div className="card" style={{ borderColor: 'var(--gold)', cursor: 'pointer' }} onClick={() => setWizard(true)}>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            <span style={{ color: 'var(--gold)' }}><Icon name="star" size={20} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>Completa l'onboarding commerciale</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Pochi minuti: punteggio e compatibilità con i brand diventeranno molto più precisi.</div>
            </div>
            <Icon name="chevron-right" size={18} />
          </div>
        </div>
      )}

      {tab === 'overview' && score && <Overview score={score} snaps={snaps} topFits={topFits} activeOpps={activeOpps} recos={recos} goto={setTab} />}
      {tab === 'valore' && score && <Valore score={score} snaps={snaps} recos={recos} relBand={relBand} goto={setTab} />}
      {tab === 'brandfit' && <BrandFit topFits={topFits} excluded={catFits.filter(f => f.excluded)} />}
      {tab === 'mediakit' && prof && score && <MediaKitTab player={player} prof={prof} topFits={topFits} collabs={collabs} cats={cats} saveProf={saveProf} />}
      {tab === 'opportunita' && <Opportunita opps={opps} cats={cats} role={role} userName={user?.full_name || user?.email || ''} reload={reload} />}
      {tab === 'collaborazioni' && <Collaborazioni collabs={collabs} perf={perf} cats={cats} role={role} reload={reload} />}
      {tab === 'performance' && <PerformanceTab collabs={collabs} perf={perf} />}
      {tab === 'dati' && prof && <DatiPreferenze prof={prof} saveProf={saveProf} openWizard={() => setWizard(true)} />}
      {tab === 'admin' && isAdmin && <AdminPanel athleteId={athleteId!} cfg={cfg} cats={cats} opps={opps} collabs={collabs} perf={perf} userName={user?.full_name || 'AUVI'} reload={reload} />}
    </div>
  )
}

// ── Piccoli componenti condivisi ─────────────────────────────────────────────
function ScoreRing({ value, size = 128 }: { value: number; size?: number }) {
  const stroke = 10, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(value / 100) * circ} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.3, fontWeight: 700, fill: 'var(--text)' }}>{value}</text>
      <text x="50%" y="67%" textAnchor="middle" style={{ fontSize: size * 0.085, fill: 'var(--text-faint)' }}>/ 100</text>
    </svg>
  )
}
function TrendPill({ delta, label }: { delta: number | null; label: string }) {
  if (delta === null) return null
  return <Badge tone={delta >= 0 ? 'green' : 'red'}>{delta >= 0 ? '+' : ''}{delta} pt · {label}</Badge>
}
function ProgressRow({ name, pct, onClick, open }: { name: string; pct: number; onClick?: () => void; open?: boolean }) {
  return (
    <div className="flex gap" style={{ alignItems: 'center', padding: '8px 0', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ width: 130, fontWeight: 600, fontSize: 13.5 }}>{name}</div>
      <div className="bar" style={{ flex: 1 }}><span style={{ width: `${pct}%` }} /></div>
      <div style={{ width: 44, textAlign: 'right', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>{pct}%</div>
      {onClick && <Icon name="chevron-right" size = {14} style={{ transform: open ? 'rotate(90deg)' : 'none', color: 'var(--text-faint)' }} />}
    </div>
  )
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────────
function Overview({ score, snaps, topFits, activeOpps, recos, goto }: any) {
  return (<>
    <div className="grid g2">
      <div className="card">
        <div className="flex gap" style={{ alignItems: 'center', gap: 20 }}>
          <ScoreRing value={score.total} />
          <div>
            <div className="faint" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Commercial Score</div>
            <div style={{ fontWeight: 700, fontSize: 16, margin: '4px 0 10px' }}>{score.level}</div>
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>
              <TrendPill delta={trendOf(snaps, score.total, 30)} label="30gg" />
              <TrendPill delta={trendOf(snaps, score.total, 90)} label="90gg" />
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="faint" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Valore commerciale indicativo</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, margin: '8px 0 2px' }}>
          {fmtMoney(score.valueLo)} – {fmtMoney(score.valueHi)}
          <span className="muted" style={{ fontSize: 14, fontFamily: 'var(--font)', fontWeight: 500 }}> /anno</span>
        </div>
        <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 8 }}>{DISCLAIMER}</div>
      </div>
    </div>

    <div className="grid g2">
      <div className="card">
        <div className="flex between" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>Completezza del profilo</div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: score.components.readiness.score >= 70 ? 'var(--green)' : 'var(--gold)' }}>{score.components.readiness.score}%</span>
        </div>
        <div className="bar"><span style={{ width: `${score.components.readiness.score}%` }} /></div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          {score.components.readiness.missing.length ? `Da completare: ${score.components.readiness.missing.slice(0, 3).join(', ')}${score.components.readiness.missing.length > 3 ? '…' : ''}` : 'Profilo completo.'}
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Categorie più compatibili</div>
        {topFits.slice(0, 4).map((f: any) => <ProgressRow key={f.key} name={f.name} pct={f.pct} />)}
        <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => goto('brandfit')}>Vedi tutte</button>
      </div>
    </div>

    <div className="grid g2">
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Opportunità attive</div>
        {activeOpps.length === 0
          ? <div className="muted" style={{ fontSize: 12.5 }}>Nessuna opportunità attiva. Completa il profilo per aumentare le possibilità di riceverne.</div>
          : activeOpps.slice(0, 4).map((o: any) => (
            <div key={o.id} className="flex between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => goto('opportunita')}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{o.brand_name}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>{o.category_key || ''}</div>
              </div>
              <Badge tone={OPP_STATUS[o.status]?.tone}>{OPP_STATUS[o.status]?.label || o.status}</Badge>
            </div>
          ))}
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Azioni consigliate</div>
        {recos.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Profilo in ottima forma, nessuna azione urgente.</div>}
        {recos.slice(0, 4).map((r: Reco, i: number) => (
          <div key={i} className="flex gap" style={{ alignItems: 'center', padding: '7px 0', cursor: 'pointer' }} onClick={() => goto(r.section)}>
            <Badge tone="gold">+{r.impact} pt</Badge>
            <span style={{ flex: 1, fontSize: 13 }}>{r.title}</span>
            <Icon name="chevron-right" size={14} style={{ color: 'var(--text-faint)' }} />
          </div>
        ))}
      </div>
    </div>
  </>)
}

// ── IL MIO VALORE ─────────────────────────────────────────────────────────────
function Valore({ score, snaps, recos, relBand, goto }: any) {
  const [open, setOpen] = useState<string | null>(null)
  const relLabel = relBand === null ? null : relBand >= 90 ? 'Ottima' : relBand >= 75 ? 'Molto buona' : relBand >= 60 ? 'Buona' : 'In costruzione'
  return (<>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Le componenti del tuo punteggio</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Ogni area mostra i dati usati per il calcolo e cosa manca. I pesi sono definiti da {AGENCY_NAME}.</div>
      {COMP_META.map(m => {
        const c = score.components[m.key]
        const isOpen = open === m.key
        const delta30 = (() => {
          const cutoff = Date.now() - 30 * 24 * 3600 * 1000
          const past = snaps.filter((s: any) => new Date(s.computed_at).getTime() <= cutoff)[0]
          return past?.components?.[m.key] != null ? c.score - Number(past.components[m.key]) : null
        })()
        return (
          <div key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex gap" style={{ alignItems: 'center', padding: '11px 0', cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : m.key)}>
              <span style={{ color: 'var(--text-dim)', width: 22 }}><Icon name={m.icon} size={17} /></span>
              <div style={{ width: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.label}</div>
                <div className="faint" style={{ fontSize: 11 }}>peso {c.weight}%{delta30 ? ` · ${delta30 > 0 ? '+' : ''}${delta30} (30gg)` : ''}</div>
              </div>
              <div className="bar" style={{ flex: 1 }}><span style={{ width: `${c.score}%` }} /></div>
              <div style={{ width: 36, textAlign: 'right', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{c.score}</div>
              <Icon name="chevron-right" size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', color: 'var(--text-faint)' }} />
            </div>
            {isOpen && (
              <div style={{ margin: '0 0 12px 34px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                {m.key === 'reputation' && relLabel && <div style={{ fontSize: 13, marginBottom: 8 }}>Affidabilità: <b style={{ color: 'var(--green)' }}>{relLabel}</b></div>}
                {c.factors.map((f: any, i: number) => (
                  <div key={i} className="flex between" style={{ fontSize: 12.5, padding: '3px 0' }}>
                    <span className="muted">{f.label}{f.note ? <span className="faint"> — {f.note}</span> : null}</span>
                    <b>{f.val}</b>
                  </div>
                ))}
                {c.missing.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gold)' }}>Dati mancanti: {c.missing.join(', ')}</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Come aumentare il tuo valore</div>
      {recos.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Hai completato tutte le azioni consigliate.</div>}
      {recos.map((r: Reco, i: number) => (
        <div key={i} className="flex gap" style={{ alignItems: 'center', padding: '10px 0', borderBottom: i < recos.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <Badge tone="gold">+{r.impact} pt</Badge>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.title}</div>
            <div className="faint" style={{ fontSize: 12 }}>{r.cta}</div>
          </div>
          <span className="faint" style={{ fontSize: 11, textTransform: 'uppercase', color: r.priority === 'alta' ? 'var(--red)' : r.priority === 'media' ? 'var(--gold)' : undefined }}>{r.priority}</span>
          <button className="btn btn-sm" onClick={() => goto(r.section)}>Vai</button>
        </div>
      ))}
    </div>
  </>)
}

// ── BRAND FIT ─────────────────────────────────────────────────────────────────
function BrandFit({ topFits, excluded }: any) {
  const [open, setOpen] = useState<string | null>(null)
  return (<>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Compatibilità per categoria</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Percentuali derivate da regole tracciabili: preferenze, interessi, audience, territori e contenuti. Più il profilo è completo, più il matching è preciso.</div>
      {topFits.map((f: any) => (
        <div key={f.key} style={{ borderBottom: '1px solid var(--border)' }}>
          <ProgressRow name={f.name} pct={f.pct} open={open === f.key} onClick={() => setOpen(open === f.key ? null : f.key)} />
          {open === f.key && (
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, padding: '0 0 12px 4px' }}>
              {f.reasons.map((r: string, i: number) => <div key={i}>· {r}</div>)}
            </div>
          )}
        </div>
      ))}
      {excluded.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Categorie escluse da te</div>
          <div className="flex gap" style={{ flexWrap: 'wrap' }}>{excluded.map((f: any) => <Badge key={f.key} tone="red">{f.name}</Badge>)}</div>
        </div>
      )}
    </div>
    <div className="card">
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        <b style={{ color: 'var(--text)' }}>In arrivo:</b> il matching con i singoli brand sarà attivato quando il sistema avrà accumulato dati sufficienti dalle campagne reali.
      </div>
    </div>
  </>)
}

// ── MEDIA KIT ─────────────────────────────────────────────────────────────────
function MediaKitTab({ player, prof, topFits, collabs, cats, saveProf }: any) {
  const [lang, setLang] = useState(prof?.media_kit?.lang || 'it')
  const [target, setTarget] = useState(prof?.media_kit?.target_category || '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const avail = AVAIL_OPTS.filter(a => prof?.availability?.[a.key]).map(a => a.label)
  const aud = prof?.audience || {}

  async function gen() {
    setBusy(true)
    try {
      await makePdf(player, prof, topFits, collabs, cats, lang, target || null)
      await saveProf({ media_kit: { ...(prof.media_kit || {}), lang, target_category: target || null, generated_at: new Date().toISOString() } })
      setDone(true); setTimeout(() => setDone(false), 3000)
    } finally { setBusy(false) }
  }

  return (<>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Media Kit dinamico</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Generato automaticamente dai dati del profilo: sempre aggiornato, personalizzabile per lingua e categoria di brand.</div>
      <div className="row2">
        <Field label="Lingua"><Select value={lang} onChange={e => setLang(e.target.value)}><option value="it">Italiano</option><option value="en">English</option></Select></Field>
        <Field label="Personalizza per categoria"><Select value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">Generico</option>
          {cats.map((c: any) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </Select></Field>
      </div>
      <div className="flex gap">
        <button className="btn btn-primary" disabled={busy} onClick={gen}>
          <Icon name="download" size={15} /> {busy ? 'Generazione…' : done ? 'PDF scaricato' : 'Genera PDF'}
        </button>
      </div>
      {prof?.media_kit?.generated_at && <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>Ultimo aggiornamento: {fmtDateTime(prof.media_kit.generated_at)}</div>}
    </div>

    {/* Anteprima */}
    <div className="card">
      <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Anteprima</div>
      <div className="flex gap" style={{ alignItems: 'center', marginBottom: 14 }}>
        {player?.photo_url && <img src={player.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border)' }} />}
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>{player?.name}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{player?.team_name} · {player?.position}{player?.age ? ` · ${player.age} anni` : ''}</div>
        </div>
      </div>
      <div className="grid g3" style={{ marginBottom: 14 }}>
        {player?.instagram_followers ? <Stat label="Instagram" value={fmtN(player.instagram_followers)} sub={player.instagram_engagement ? `ER ${player.instagram_engagement}%` : undefined} /> : null}
        {aud?.tiktok?.followers ? <Stat label="TikTok" value={fmtN(aud.tiktok.followers)} sub={aud.tiktok.er ? `ER ${aud.tiktok.er}%` : undefined} /> : null}
        {aud?.youtube?.followers ? <Stat label="YouTube" value={fmtN(aud.youtube.followers)} sub={aud.youtube.er ? `ER ${aud.youtube.er}%` : undefined} /> : null}
      </div>
      {(prof?.identity?.values || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Valori</div>
          <div className="flex gap" style={{ flexWrap: 'wrap' }}>{prof.identity.values.map((v: string) => <Badge key={v}>{v}</Badge>)}</div>
        </div>
      )}
      {avail.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Formati disponibili</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{avail.join(' · ')}</div>
        </div>
      )}
      <div>
        <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Top categorie</div>
        <div className="flex gap" style={{ flexWrap: 'wrap' }}>{topFits.slice(0, 4).map((f: any) => <Badge key={f.key} tone="accent">{f.name} {f.pct}%</Badge>)}</div>
      </div>
    </div>
  </>)
}

// PDF con jsPDF (dipendenza già presente, stesso pattern dell'Area Fitness)
async function makePdf(player: any, prof: any, topFits: any[], collabs: any[], cats: any[], lang: string, target: string | null) {
  const { jsPDF } = await import('jspdf')
  const t = (it: string, en: string) => (lang === 'en' ? en : it)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  let y: number

  doc.setFillColor(10, 10, 11); doc.rect(0, 0, W, 46, 'F')
  doc.setTextColor(255, 214, 10); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
  doc.text(`${AGENCY_NAME.toUpperCase()} — COMMERCIAL PROFILE · MEDIA KIT`, 14, 13)
  doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.text(player?.name || '', 14, 26)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(170, 170, 178)
  doc.text(`${player?.team_name || ''} · ${player?.position || ''}${player?.age ? ` · ${player.age} ${t('anni', 'y.o.')}` : ''}`, 14, 34)
  if (target) {
    const cat = cats.find((c: any) => c.key === target)
    doc.setTextColor(255, 214, 10); doc.text(t(`Focus: ${cat?.name || target}`, `Tailored for: ${cat?.name || target}`), 14, 40)
  }
  if (player?.photo_url) {
    try {
      const blob = await (await fetch(player.photo_url)).blob()
      const dataUrl: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob) })
      doc.addImage(dataUrl, 'JPEG', W - 44, 8, 30, 30, undefined, 'FAST')
    } catch { /* senza foto */ }
  }
  y = 56
  const section = (title: string) => {
    doc.setTextColor(120, 120, 128); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
    doc.text(title.toUpperCase(), 14, y); doc.setDrawColor(230, 230, 234); doc.line(14, y + 2, W - 14, y + 2); y += 8
  }
  const kv = (rows: [string, string][]) => {
    doc.setFontSize(9.5)
    rows.forEach(([k, v]) => {
      if (!v) return
      doc.setFont('helvetica', 'bold'); doc.setTextColor(10, 10, 11); doc.text(k, 14, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 108)
      const lines = doc.splitTextToSize(v, 128); doc.text(lines, 64, y); y += lines.length * 4.6 + 2.4
    })
    y += 4
  }

  section(t('Profilo', 'Profile'))
  kv([
    [t('Club', 'Club'), player?.team_name || ''],
    [t('Ruolo', 'Position'), player?.position || ''],
    [t('Nazionalità', 'Nationality'), player?.nationality || ''],
    [t('Età', 'Age'), player?.age ? String(player.age) : ''],
  ])
  const ident = prof?.identity || {}
  if ((ident.values || []).length || (ident.style || []).length) {
    section(t('Valori e stile', 'Values & style'))
    kv([
      [t('Valori', 'Values'), (ident.values || []).join(', ')],
      [t('Stile', 'Style'), (ident.style || []).join(', ')],
      [t('Interessi', 'Interests'), (ident.interests || []).join(', ')],
    ])
  }
  const aud = prof?.audience || {}
  const audRows: [string, string][] = []
  if (player?.instagram_followers) audRows.push(['Instagram', `${Number(player.instagram_followers).toLocaleString('it-IT')} follower${player.instagram_engagement ? ` · ER ${player.instagram_engagement}%` : ''}${player.instagram_reach ? ` · reach ${Number(player.instagram_reach).toLocaleString('it-IT')}` : ''}`])
  if (aud?.tiktok?.followers) audRows.push(['TikTok', `${Number(aud.tiktok.followers).toLocaleString('it-IT')} follower${aud.tiktok.er ? ` · ER ${aud.tiktok.er}%` : ''}`])
  if (aud?.youtube?.followers) audRows.push(['YouTube', `${Number(aud.youtube.followers).toLocaleString('it-IT')} iscritti`])
  if ((aud.geo || []).length) audRows.push([t('Geografia', 'Geography'), aud.geo.join(', ')])
  if (aud.age_band) audRows.push([t('Fascia età', 'Age band'), aud.age_band])
  if (audRows.length) { section('Audience'); kv(audRows) }

  const fits = [...topFits].sort((a, b) => (a.key === target ? -1 : b.key === target ? 1 : b.pct - a.pct)).slice(0, 6)
  if (fits.length) {
    section(t('Categorie più compatibili', 'Top brand categories'))
    fits.forEach(f => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(10, 10, 11); doc.setFontSize(9.5)
      doc.text(`${f.name} — ${f.pct}%`, 14, y)
      doc.setFillColor(235, 235, 239); doc.roundedRect(90, y - 3, 100, 3.6, 1.8, 1.8, 'F')
      if (f.key === target) doc.setFillColor(255, 214, 10); else doc.setFillColor(10, 10, 11)
      doc.roundedRect(90, y - 3, f.pct, 3.6, 1.8, 1.8, 'F')
      y += 7.5
    })
    y += 4
  }
  const avail = AVAIL_OPTS.filter(a => prof?.availability?.[a.key]).map(a => a.label)
  if (avail.length) { section(t('Formati disponibili', 'Available formats')); kv([[t('Attività', 'Activities'), avail.join(' · ')]]) }
  const terr = prof?.territories || {}
  if ((terr.markets || []).length || (terr.languages || []).length) {
    section(t('Territori e lingue', 'Territories & languages'))
    kv([[t('Mercati', 'Markets'), (terr.markets || []).join(', ')], [t('Lingue', 'Languages'), (terr.languages || []).join(', ')]])
  }
  if (collabs.length) {
    if (y > 235) { doc.addPage(); y = 20 }
    section(t('Collaborazioni', 'Past collaborations'))
    kv(collabs.slice(0, 6).map((c: any) => [c.brand_name, `${c.category_key || ''}${c.period_start ? ` · ${new Date(c.period_start).getFullYear()}` : ''}`] as [string, string]))
  }
  const fy = 285
  doc.setDrawColor(230, 230, 234); doc.line(14, fy - 6, W - 14, fy - 6)
  doc.setFontSize(8); doc.setTextColor(100, 100, 108)
  doc.text(t(`Contatti commerciali: ${AGENCY_NAME}`, `Commercial contacts: ${AGENCY_NAME}`), 14, fy)
  doc.setTextColor(150, 150, 158)
  doc.text(t('Documento generato automaticamente da AUVI Commercial Profile.', 'Automatically generated by AUVI Commercial Profile.'), 14, fy + 4)
  doc.save(`MediaKit_${(player?.name || 'atleta').replace(/\s+/g, '_')}${target ? '_' + target : ''}_${lang}.pdf`)
}

// ── OPPORTUNITÀ ───────────────────────────────────────────────────────────────
function Opportunita({ opps, cats, role, userName, reload }: any) {
  const [sel, setSel] = useState<any>(null)
  return (<>
    {opps.length === 0 && <div className="card"><Empty icon={<Icon name="briefcase" size={30} strokeWidth={1.4} />} title="Nessuna opportunità al momento" hint="Quando AUVI riceverà proposte commerciali compatibili con il tuo profilo, le troverai qui." /></div>}
    <div className="grid g2">
      {opps.map((o: any) => (
        <div key={o.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSel(o)}>
          <div className="flex between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{o.brand_name}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {cats.find((c: any) => c.key === o.category_key)?.name || ''}
                {o.deadline ? ` · scade ${fmtDate(o.deadline)}` : ''}
              </div>
            </div>
            <Badge tone={OPP_STATUS[o.status]?.tone}>{OPP_STATUS[o.status]?.label || o.status}</Badge>
          </div>
          {o.description && <div className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>{o.description.length > 130 ? o.description.slice(0, 130) + '…' : o.description}</div>}
        </div>
      ))}
    </div>
    {sel && <OppModal opp={sel} cats={cats} role={role} userName={userName} onClose={() => setSel(null)} reload={reload} />}
  </>)
}

function OppModal({ opp, cats, role, userName, onClose, reload }: any) {
  const [events, setEvents] = useState<any[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [askInfo, setAskInfo] = useState(false)
  useEffect(() => { supabase.from('cp_opportunity_events').select('*').eq('opportunity_id', opp.id).order('created_at').then(({ data }) => setEvents(data || [])) }, [opp.id])

  async function act(response: string, newStatus: string | null, eventBody: string) {
    setBusy(true)
    const patch: any = { athlete_response: response }
    if (note.trim()) patch.athlete_note = note.trim()
    if (newStatus) patch.status = newStatus
    await supabase.from('cp_opportunities').update(patch).eq('id', opp.id)
    await supabase.from('cp_opportunity_events').insert({ opportunity_id: opp.id, actor: userName || 'Atleta', kind: 'athlete_action', body: eventBody + (note.trim() ? ` — "${note.trim()}"` : '') })
    setBusy(false); onClose(); reload()
  }
  const cat = cats.find((c: any) => c.key === opp.category_key)
  const canRespond = role === 'player' && ['nuova', 'in_valutazione'].includes(opp.status) && !opp.athlete_response
  const row = (l: string, v: any) => v ? (
    <div style={{ marginBottom: 10 }}>
      <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{l}</div>
      <div style={{ fontSize: 13.5 }}>{v}</div>
    </div>
  ) : null

  return (
    <Modal title={opp.brand_name} onClose={onClose} wide>
      <div className="flex between" style={{ marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 12.5 }}>{cat?.name || ''}</div>
        <Badge tone={OPP_STATUS[opp.status]?.tone}>{OPP_STATUS[opp.status]?.label || opp.status}</Badge>
      </div>
      {row('Descrizione', opp.description)}
      {(opp.fee_lo || opp.fee_hi) && row('Compenso indicativo', `${opp.fee_lo ? fmtMoney(Number(opp.fee_lo)) : ''}${opp.fee_hi ? ` – ${fmtMoney(Number(opp.fee_hi))}` : ''}${opp.fee_note ? ` (${opp.fee_note})` : ''}`)}
      {opp.activities?.length > 0 && row('Attività richieste', opp.activities.join(' · '))}
      {row('Durata', opp.duration)}
      {row('Territorio', opp.territory)}
      {row('Esclusività', opp.exclusivity)}
      {opp.deadline && row('Scadenza', fmtDate(opp.deadline))}
      {row('Referente AUVI', opp.referente)}
      {opp.materials_requested?.length > 0 && row('Materiali richiesti', opp.materials_requested.join(' · '))}
      {opp.athlete_response && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Risposta dell'atleta: </span>
          <b style={{ color: opp.athlete_response === 'interesse' ? 'var(--green)' : opp.athlete_response === 'rifiuto' ? 'var(--red)' : 'var(--blue)' }}>
            {opp.athlete_response === 'interesse' ? 'Interesse confermato' : opp.athlete_response === 'rifiuto' ? 'Non interessato' : 'Richiesta informazioni'}
          </b>
          {opp.athlete_note ? <span className="muted" style={{ fontSize: 12.5 }}> — "{opp.athlete_note}"</span> : null}
        </div>
      )}
      {events.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Timeline</div>
          {events.map((e, i) => (
            <div key={i} className="flex gap" style={{ fontSize: 12.5, padding: '4px 0' }}>
              <span className="faint" style={{ width: 78, flexShrink: 0 }}>{fmtDate(e.created_at)}</span>
              <span className="muted"><b style={{ color: 'var(--text)' }}>{e.actor}</b> · {e.body}</span>
            </div>
          ))}
        </div>
      )}
      {canRespond && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <Field label="Nota o disponibilità (facoltativa)"><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
          <div className="flex gap" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => act('interesse', 'interesse_confermato', "Ha espresso interesse per l'opportunità")}>Mi interessa</button>
            <button className="btn" disabled={busy} onClick={() => setAskInfo(!askInfo)}>Chiedi informazioni</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => act('rifiuto', 'non_accettata', "Ha declinato l'opportunità")}>Non mi interessa</button>
          </div>
          {askInfo && <button className="btn" style={{ marginTop: 10 }} disabled={busy || !note.trim()} onClick={() => act('info', null, 'Ha chiesto informazioni')}>{note.trim() ? 'Invia richiesta di informazioni' : 'Scrivi prima una nota'}</button>}
        </div>
      )}
      <div className="faint" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>Le condizioni economiche vengono gestite da {AGENCY_NAME}: il tuo referente ti accompagna in ogni passaggio della trattativa.</div>
    </Modal>
  )
}

// ── COLLABORAZIONI ────────────────────────────────────────────────────────────
function Collaborazioni({ collabs, perf, cats, role, reload }: any) {
  const [sel, setSel] = useState<any>(null)
  return (<>
    {collabs.length === 0 && <div className="card"><Empty icon={<Icon name="award" size={30} strokeWidth={1.4} />} title="Nessuna collaborazione registrata" hint="Le campagne concluse con i brand costruiranno qui il tuo storico commerciale." /></div>}
    <div className="grid g2">
      {collabs.map((c: any) => (
        <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSel(c)}>
          <div className="flex between">
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.brand_name}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {cats.find((x: any) => x.key === c.category_key)?.name || ''}
                {c.period_start ? ` · ${fmtDate(c.period_start)}` : ''}{c.period_end ? ` → ${fmtDate(c.period_end)}` : ''}
              </div>
            </div>
            <div className="right">
              {c.contract_value != null && <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--green)' }}>{fmtMoney(Number(c.contract_value))}</div>}
              <Badge tone={c.status === 'completata' ? 'green' : c.status === 'annullata' ? 'red' : 'blue'}>{c.status}</Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
    {sel && <CollabModal collab={sel} p={perf.find((x: any) => x.collaboration_id === sel.id)} cats={cats} role={role} onClose={() => setSel(null)} reload={reload} />}
  </>)
}

function CollabModal({ collab, p, cats, role, onClose, reload }: any) {
  const [fb, setFb] = useState(collab.athlete_feedback || '')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={collab.brand_name} onClose={onClose} wide>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>{cats.find((c: any) => c.key === collab.category_key)?.name || ''} · {collab.status}</div>
      {collab.contract_value != null && (
        <div style={{ marginBottom: 14 }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Valore contratto</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>{fmtMoney(Number(collab.contract_value))}</div>
        </div>
      )}
      {collab.activities?.length > 0 && <div style={{ marginBottom: 12, fontSize: 13.5 }}><span className="faint" style={{ fontSize: 11, textTransform: 'uppercase' }}>Attività · </span>{collab.activities.join(' · ')}</div>}
      {collab.notes && <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{collab.notes}</div>}
      {p && (
        <div style={{ marginBottom: 14 }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Risultati della campagna</div>
          <div className="grid g3">
            {p.reach != null && <Stat label="Reach" value={fmtN(p.reach)} />}
            {p.impressions != null && <Stat label="Impression" value={fmtN(p.impressions)} />}
            {p.engagement != null && <Stat label="Engagement" value={`${p.engagement}%`} />}
            {p.views != null && <Stat label="Views" value={fmtN(p.views)} />}
            {p.clicks != null && <Stat label="Click" value={fmtN(p.clicks)} />}
            {p.posts_count != null && <Stat label="Contenuti" value={fmtN(p.posts_count)} />}
          </div>
        </div>
      )}
      {collab.brand_feedback && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Feedback del brand</div>
          <div style={{ fontSize: 13 }}>"{collab.brand_feedback}"</div>
        </div>
      )}
      {role === 'player' && (<>
        <Field label="Il tuo feedback"><Textarea rows={2} value={fb} onChange={e => setFb(e.target.value)} placeholder="Com'è andata questa collaborazione?" /></Field>
        <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await supabase.from('cp_collaborations').update({ athlete_feedback: fb }).eq('id', collab.id); setBusy(false); onClose(); reload() }}>Salva feedback</button>
      </>)}
    </Modal>
  )
}

// ── PERFORMANCE ───────────────────────────────────────────────────────────────
function PerformanceTab({ collabs, perf }: any) {
  if (!perf.length) return <div className="card"><Empty icon={<Icon name="activity" size={30} strokeWidth={1.4} />} title="Ancora nessun dato di performance" hint="I risultati delle campagne verranno registrati da AUVI e alimenteranno il tuo Commercial Score." /></div>
  const sum = (k: string) => perf.reduce((s: number, p: any) => s + (Number(p[k]) || 0), 0)
  const ers = perf.map((p: any) => Number(p.engagement) || 0).filter((x: number) => x > 0)
  return (<>
    <div className="grid g3">
      <Stat label="Reach totale" value={fmtN(sum('reach'))} />
      <Stat label="Impression" value={fmtN(sum('impressions'))} />
      <Stat label="ER medio" value={ers.length ? `${(ers.reduce((a: number, b: number) => a + b, 0) / ers.length).toFixed(1)}%` : '—'} />
    </div>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Per campagna</div>
      {perf.map((p: any) => {
        const c = collabs.find((x: any) => x.id === p.collaboration_id)
        return (
          <div key={p.id} className="flex between" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c?.brand_name || 'Campagna'}</div>
            <div className="flex gap" style={{ fontSize: 12.5, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
              {p.reach != null && <span>Reach <b style={{ color: 'var(--text)' }}>{fmtN(p.reach)}</b></span>}
              {p.engagement != null && <span>ER <b style={{ color: 'var(--text)' }}>{p.engagement}%</b></span>}
              {p.posts_count != null && <span>Contenuti <b style={{ color: 'var(--text)' }}>{p.posts_count}</b></span>}
              {p.on_time != null && <Badge tone={p.on_time ? 'green' : 'gold'}>{p.on_time ? 'Puntuale' : 'Ritardi'}</Badge>}
            </div>
          </div>
        )
      })}
    </div>
  </>)
}

// ── DATI E PREFERENZE ────────────────────────────────────────────────────────
function DatiPreferenze({ prof, saveProf, openWizard }: any) {
  const [aud, setAud] = useState<any>(prof?.audience || {})
  const [content, setContent] = useState<any>(prof?.content || {})
  const [sport, setSport] = useState<any>(prof?.sport || {})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const plat = (p: string, label: string) => (
    <div className="row2" key={p} style={{ marginBottom: 4 }}>
      <Field label={`${label} — follower`}><Input type="number" value={aud?.[p]?.followers || ''} onChange={e => setAud({ ...aud, [p]: { ...(aud[p] || {}), followers: e.target.value ? Number(e.target.value) : null } })} /></Field>
      <Field label={`${label} — engagement %`}><Input type="number" step="0.1" value={aud?.[p]?.er || ''} onChange={e => setAud({ ...aud, [p]: { ...(aud[p] || {}), er: e.target.value ? Number(e.target.value) : null } })} /></Field>
    </div>
  )
  const toggle = (obj: any, setObj: any, key: string, label: string) => (
    <button className={`btn btn-sm ${obj[key] ? 'btn-primary' : ''}`} onClick={() => setObj({ ...obj, [key]: !obj[key] })}>
      {obj[key] ? <Icon name="check" size={13} /> : null} {label}
    </button>
  )
  return (<>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Audience — altri canali</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Instagram è gestito da AUVI nel Media Kit; qui puoi aggiungere gli altri canali e i dati del pubblico. In futuro saranno sincronizzati dalle API.</div>
      {plat('tiktok', 'TikTok')}{plat('youtube', 'YouTube')}
      <div className="row2">
        <Field label="Paesi principali audience"><Input placeholder="Es. Italia, Grecia, Spagna" value={(aud.geo || []).join(', ')} onChange={e => setAud({ ...aud, geo: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></Field>
        <Field label="Fascia età prevalente"><Select value={aud.age_band || ''} onChange={e => setAud({ ...aud, age_band: e.target.value })}>
          <option value="">—</option><option>13-17</option><option>18-24</option><option>25-34</option><option>35-44</option><option>45+</option>
        </Select></Field>
      </div>
      <div className="row2">
        <Field label="Genere prevalente"><Select value={aud.gender_split || ''} onChange={e => setAud({ ...aud, gender_split: e.target.value })}>
          <option value="">—</option><option>Prevalenza uomini</option><option>Prevalenza donne</option><option>Bilanciato</option>
        </Select></Field>
        <Field label="Follower reali stimati %"><Input type="number" placeholder="Es. 92" value={aud.authenticity || ''} onChange={e => setAud({ ...aud, authenticity: e.target.value ? Number(e.target.value) : null })} /></Field>
      </div>
    </div>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Contenuti & sport</div>
      <div className="flex gap" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {toggle(content, setContent, 'shooting_available', 'Disponibile per shooting professionali')}
        {toggle(content, setContent, 'lifestyle', 'Pubblico contenuti lifestyle')}
      </div>
      <div className="row2">
        <Field label="Nazionale (se convocato)"><Input placeholder="Es. Italia U21" value={sport.national || ''} onChange={e => setSport({ ...sport, national: e.target.value })} /></Field>
        <Field label="Competizioni internazionali"><Input placeholder="Es. Youth League" value={sport.competitions || ''} onChange={e => setSport({ ...sport, competitions: e.target.value })} /></Field>
      </div>
    </div>
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Preferenze commerciali</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Valori, categorie, disponibilità, territori e storico si modificano dall'onboarding guidato.</div>
      <button className="btn" onClick={openWizard}><Icon name="edit" size={14} /> Modifica le preferenze</button>
    </div>
    <div className="flex" style={{ justifyContent: 'flex-end' }}>
      <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await saveProf({ audience: aud, content, sport }); setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500) }}>
        {busy ? 'Salvo…' : saved ? 'Salvato' : 'Salva dati'}
      </button>
    </div>
  </>)
}

// ── ONBOARDING (5 step, salvabile in più momenti) ────────────────────────────
function Onboarding({ profile, save, onDone, onLater }: any) {
  const [step, setStep] = useState(Math.min(profile?.onboarding_step || 0, 4))
  const [ident, setIdent] = useState<any>(profile?.identity || {})
  const [liked, setLiked] = useState<string[]>(profile?.categories_liked || [])
  const [excluded, setExcluded] = useState<string[]>(profile?.categories_excluded || [])
  const [avail, setAvail] = useState<any>(profile?.availability || {})
  const [terr, setTerr] = useState<any>(profile?.territories || {})
  const [hist, setHist] = useState<any>(profile?.history || {})
  const [busy, setBusy] = useState(false)
  const CATS = [['sportswear', 'Sportswear'], ['fashion', 'Moda'], ['technology', 'Tecnologia'], ['gaming', 'Gaming'], ['automotive', 'Automotive'], ['food', 'Food'], ['beverage', 'Beverage'], ['wellness', 'Wellness'], ['travel', 'Travel'], ['finance', 'Finance'], ['luxury', 'Luxury'], ['family', 'Family'], ['entertainment', 'Entertainment']]
  const STEPS = ['Identità', 'Categorie', 'Disponibilità', 'Territori', 'Storico']

  async function persist(completed: boolean, nextStep: number) {
    setBusy(true)
    await save({ identity: ident, categories_liked: liked, categories_excluded: excluded, availability: avail, territories: terr, history: hist, onboarding_step: nextStep, onboarding_completed: completed })
    setBusy(false)
  }
  const chips = (options: string[], selected: string[], onChange: (v: string[]) => void, max?: number) => (
    <div className="flex gap" style={{ flexWrap: 'wrap' }}>
      {options.map(o => {
        const on = selected.includes(o)
        return <button key={o} className={`btn btn-sm ${on ? 'btn-primary' : ''}`} onClick={() => on ? onChange(selected.filter(x => x !== o)) : (!max || selected.length < max) && onChange([...selected, o])}>{o}</button>
      })}
    </div>
  )

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 760 }}>
      <div className="card">
        <div className="faint" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>AUVI Commercial Profile — Onboarding</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}>Costruiamo il tuo profilo commerciale</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>5 passaggi, pochi minuti. Puoi salvare e completare quando vuoi.</div>
        <div className="flex gap" style={{ marginTop: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1 }}>
              <div style={{ height: 4, borderRadius: 4, background: i <= step ? 'var(--accent)' : 'var(--border)' }} />
              <div className="faint" style={{ fontSize: 10, marginTop: 5, textTransform: 'uppercase', letterSpacing: '.05em', color: i === step ? 'var(--text)' : undefined }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        {step === 0 && (<>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Come vuoi essere percepito?</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Scegli i valori, lo stile e gli interessi che ti rappresentano davvero.</div>
          <Field label="I tuoi valori (max 5)">{chips(VALUE_OPTS, ident.values || [], v => setIdent({ ...ident, values: v }), 5)}</Field>
          <Field label="Il tuo stile (max 4)">{chips(STYLE_OPTS, ident.style || [], v => setIdent({ ...ident, style: v }), 4)}</Field>
          <Field label="Interessi fuori dal campo">{chips(INTEREST_OPTS, ident.interests || [], v => setIdent({ ...ident, interests: v }))}</Field>
          <Field label="Come vorresti essere descritto in una frase"><Input value={ident.desired_image || ''} onChange={e => setIdent({ ...ident, desired_image: e.target.value })} placeholder="Es. Un professionista autentico, vicino ai giovani e alla famiglia" /></Field>
        </>)}
        {step === 1 && (<>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Categorie commerciali</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Con quali tipologie di brand vorresti collaborare? E quali escludi a priori?</div>
          <Field label="Categorie gradite">{chips(CATS.map(c => c[1]), liked.map(k => CATS.find(c => c[0] === k)?.[1] || k), v => setLiked(v.map(n => CATS.find(c => c[1] === n)?.[0] || n)))}</Field>
          <Field label="Categorie escluse">
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>
              {[...EXCL_PRESET, ...CATS].map(([k, n]) => {
                const on = excluded.includes(k)
                return <button key={k} className="btn btn-sm" style={on ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined} onClick={() => setExcluded(on ? excluded.filter(x => x !== k) : [...excluded, k])}>{on ? '✕ ' : ''}{n}</button>
              })}
            </div>
          </Field>
        </>)}
        {step === 2 && (<>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Disponibilità</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Quali attività sei disponibile a svolgere per una campagna?</div>
          <div className="grid g2">
            {AVAIL_OPTS.map(a => (
              <button key={a.key} className={`btn ${avail[a.key] ? 'btn-primary' : ''}`} style={{ justifyContent: 'flex-start' }} onClick={() => setAvail({ ...avail, [a.key]: !avail[a.key] })}>
                {avail[a.key] ? <Icon name="check" size={14} /> : <span style={{ width: 14 }} />} {a.label}
              </button>
            ))}
          </div>
        </>)}
        {step === 3 && (<>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Territori e lingue</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Dove sei riconosciuto e in quali mercati vuoi crescere?</div>
          <Field label="Mercati di interesse">{chips(MARKET_OPTS, terr.markets || [], v => setTerr({ ...terr, markets: v }))}</Field>
          <Field label="Lingue parlate">{chips(LANG_OPTS, terr.languages || [], v => setTerr({ ...terr, languages: v }))}</Field>
          <button className={`btn btn-sm ${terr.travel ? 'btn-primary' : ''}`} onClick={() => setTerr({ ...terr, travel: !terr.travel })}>{terr.travel ? <Icon name="check" size={13} /> : null} Disponibile a viaggiare per campagne</button>
        </>)}
        {step === 4 && (<>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Storico commerciale</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Sponsor attivi, collaborazioni passate ed eventuali esclusività.</div>
          <Field label="Sponsor personali attivi"><Input value={hist.sponsors || ''} onChange={e => setHist({ ...hist, sponsors: e.target.value })} placeholder="Es. Nike (scarpe), nessun altro" /></Field>
          <Field label="Collaborazioni precedenti"><Textarea rows={3} value={hist.collaborations || ''} onChange={e => setHist({ ...hist, collaborations: e.target.value })} placeholder="Brand, anno, tipo di attività" /></Field>
          <Field label="Esclusività o categorie già occupate"><Input value={hist.exclusivities || ''} onChange={e => setHist({ ...hist, exclusivities: e.target.value })} placeholder="Es. esclusiva sportswear fino al 2027" /></Field>
          <Field label="Fascia economica minima (facoltativa)"><Input value={hist.min_fee || ''} onChange={e => setHist({ ...hist, min_fee: e.target.value })} placeholder="Es. €2.000 per campagna" /></Field>
        </>)}

        <div className="flex between" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" disabled={busy} onClick={async () => { await persist(false, step); onLater() }}>Continua più tardi</button>
          <div className="flex gap">
            {step > 0 && <button className="btn" disabled={busy} onClick={() => setStep(step - 1)}>Indietro</button>}
            {step < 4
              ? <button className="btn btn-primary" disabled={busy} onClick={async () => { await persist(false, step + 1); setStep(step + 1) }}>{busy ? '…' : 'Avanti'}</button>
              : <button className="btn btn-primary" disabled={busy} onClick={async () => { await persist(true, 5); onDone() }}>{busy ? '…' : 'Completa il profilo'}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// GESTIONE AUVI (solo admin): opportunità, collaborazioni, valutazioni, pesi
// ═════════════════════════════════════════════════════════════════════════════
function AdminPanel({ athleteId, cfg, cats, opps, collabs, perf, userName, reload }: any) {
  const [sub, setSub] = useState('opportunita')
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex gap" style={{ flexWrap: 'wrap' }}>
        {[['opportunita', 'Opportunità'], ['collaborazioni', 'Collaborazioni'], ['valutazioni', 'Valutazione riservata'], ['config', 'Pesi & Config']].map(([id, l]) => (
          <button key={id} className={`btn btn-sm ${sub === id ? 'btn-primary' : ''}`} onClick={() => setSub(id)}>{l}</button>
        ))}
      </div>
      {sub === 'opportunita' && <AdminOpps athleteId={athleteId} cats={cats} opps={opps} userName={userName} reload={reload} />}
      {sub === 'collaborazioni' && <AdminCollabs athleteId={athleteId} cats={cats} collabs={collabs} perf={perf} reload={reload} />}
      {sub === 'valutazioni' && <AdminEval athleteId={athleteId} reload={reload} />}
      {sub === 'config' && cfg && <AdminConfig cfg={cfg} reload={reload} />}
    </div>
  )
}

function AdminOpps({ athleteId, cats, opps, userName, reload }: any) {
  const [edit, setEdit] = useState<any>(null)
  const [privFor, setPrivFor] = useState<any>(null)

  async function setStatus(o: any, status: string) {
    await supabase.from('cp_opportunities').update({ status }).eq('id', o.id)
    await supabase.from('cp_opportunity_events').insert({ opportunity_id: o.id, actor: userName, kind: 'status', body: `Stato aggiornato: ${OPP_STATUS[status]?.label || status}` })
    reload()
  }
  return (<>
    <div><button className="btn btn-primary" onClick={() => setEdit({})}>+ Nuova opportunità</button></div>
    {opps.length === 0 && <div className="card"><Empty icon={<Icon name="briefcase" size={28} strokeWidth={1.4} />} title="Nessuna opportunità" hint="Crea la prima opportunità commerciale per l'atleta." /></div>}
    {opps.map((o: any) => (
      <div key={o.id} className="card">
        <div className="flex between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{o.brand_name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {cats.find((c: any) => c.key === o.category_key)?.name || ''}
              {(o.fee_lo || o.fee_hi) ? ` · ${o.fee_lo ? fmtMoney(Number(o.fee_lo)) : ''}${o.fee_hi ? '–' + fmtMoney(Number(o.fee_hi)) : ''}` : ''}
              {o.athlete_response ? ` · risposta: ${o.athlete_response}` : ''}
            </div>
          </div>
          <div className="flex gap">
            <Select value={o.status} onChange={e => setStatus(o, e.target.value)} style={{ width: 'auto' }}>
              {Object.keys(OPP_STATUS).map(s => <option key={s} value={s}>{OPP_STATUS[s].label}</option>)}
            </Select>
            <button className="btn btn-sm" onClick={() => setEdit(o)}>Modifica</button>
            <button className="btn btn-sm" onClick={() => setPrivFor(o)}><Icon name="lock" size={13} /> Note riservate</button>
            <ConfirmButton onConfirm={async () => { await supabase.from('cp_opportunities').delete().eq('id', o.id); reload() }}>Elimina</ConfirmButton>
          </div>
        </div>
      </div>
    ))}
    {edit && <OppForm athleteId={athleteId} cats={cats} value={edit} userName={userName} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    {privFor && <PrivateNotesModal opp={privFor} onClose={() => setPrivFor(null)} />}
  </>)
}

function OppForm({ athleteId, cats, value, userName, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ referente: userName, ...value, activities_txt: (value.activities || []).join(', '), materials_txt: (value.materials_requested || []).join(', ') })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  async function save() {
    setBusy(true)
    const payload: any = {
      brand_name: f.brand_name, category_key: f.category_key || null, description: f.description || null,
      referente: f.referente || null, fee_lo: f.fee_lo ? Number(f.fee_lo) : null, fee_hi: f.fee_hi ? Number(f.fee_hi) : null,
      fee_note: f.fee_note || null, duration: f.duration || null, territory: f.territory || null,
      exclusivity: f.exclusivity || null, deadline: f.deadline || null,
      activities: (f.activities_txt || '').split(',').map((x: string) => x.trim()).filter(Boolean),
      materials_requested: (f.materials_txt || '').split(',').map((x: string) => x.trim()).filter(Boolean),
    }
    if (f.id) await supabase.from('cp_opportunities').update(payload).eq('id', f.id)
    else {
      const { data } = await supabase.from('cp_opportunities').insert({ ...payload, player_id: athleteId, status: 'nuova' }).select().single()
      if (data) await supabase.from('cp_opportunity_events').insert({ opportunity_id: data.id, actor: userName, kind: 'created', body: 'Opportunità creata' })
    }
    setBusy(false); onSaved()
  }
  return (
    <Modal title={f.id ? 'Modifica opportunità' : 'Nuova opportunità'} onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Annulla</button><button className="btn btn-primary" disabled={busy || !f.brand_name} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button></>}>
      <div className="row2">
        <Field label="Brand *"><Input value={f.brand_name || ''} onChange={e => set('brand_name', e.target.value)} /></Field>
        <Field label="Categoria"><Select value={f.category_key || ''} onChange={e => set('category_key', e.target.value)}><option value="">—</option>{cats.map((c: any) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
      </div>
      <Field label="Descrizione"><Textarea rows={2} value={f.description || ''} onChange={e => set('description', e.target.value)} /></Field>
      <div className="row2">
        <Field label="Compenso da (€)"><Input type="number" value={f.fee_lo || ''} onChange={e => set('fee_lo', e.target.value)} /></Field>
        <Field label="Compenso a (€)"><Input type="number" value={f.fee_hi || ''} onChange={e => set('fee_hi', e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="Durata"><Input placeholder="Es. 6 mesi" value={f.duration || ''} onChange={e => set('duration', e.target.value)} /></Field>
        <Field label="Territorio"><Input placeholder="Es. Italia + Grecia" value={f.territory || ''} onChange={e => set('territory', e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="Esclusività"><Input placeholder="Es. categoria sportswear" value={f.exclusivity || ''} onChange={e => set('exclusivity', e.target.value)} /></Field>
        <Field label="Scadenza"><Input type="date" value={f.deadline || ''} onChange={e => set('deadline', e.target.value)} /></Field>
      </div>
      <Field label="Attività richieste (separate da virgola)"><Input placeholder="2 reel, 4 stories, 1 evento" value={f.activities_txt || ''} onChange={e => set('activities_txt', e.target.value)} /></Field>
      <Field label="Materiali richiesti (separati da virgola)"><Input placeholder="foto HD, liberatoria" value={f.materials_txt || ''} onChange={e => set('materials_txt', e.target.value)} /></Field>
      <Field label="Referente AUVI"><Input value={f.referente || ''} onChange={e => set('referente', e.target.value)} /></Field>
    </Modal>
  )
}

// Note riservate: vivono su cp_opportunity_private (RLS admin-only)
function PrivateNotesModal({ opp, onClose }: any) {
  const [f, setF] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('cp_opportunity_private').select('*').eq('opportunity_id', opp.id).maybeSingle()
      .then(({ data }) => setF(data || { opportunity_id: opp.id }))
  }, [opp.id])
  if (!f) return null
  async function save() {
    setBusy(true)
    await supabase.from('cp_opportunity_private').upsert({ opportunity_id: opp.id, internal_notes: f.internal_notes || null, margin: f.margin ? Number(f.margin) : null, negotiation_notes: f.negotiation_notes || null })
    setBusy(false); onClose()
  }
  return (
    <Modal title={`Riservato — ${opp.brand_name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Chiudi</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button></>}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12, color: 'var(--red)' }}>Questi dati sono su una tabella riservata (RLS admin-only): l'atleta non può leggerli in nessun caso.</div>
      <Field label="Margine AUVI (€)"><Input type="number" value={f.margin ?? ''} onChange={e => setF({ ...f, margin: e.target.value })} /></Field>
      <Field label="Note interne"><Textarea rows={3} value={f.internal_notes || ''} onChange={e => setF({ ...f, internal_notes: e.target.value })} /></Field>
      <Field label="Note di trattativa"><Textarea rows={3} value={f.negotiation_notes || ''} onChange={e => setF({ ...f, negotiation_notes: e.target.value })} /></Field>
    </Modal>
  )
}

function AdminCollabs({ athleteId, cats, collabs, perf, reload }: any) {
  const [edit, setEdit] = useState<any>(null)
  const [perfFor, setPerfFor] = useState<any>(null)
  return (<>
    <div><button className="btn btn-primary" onClick={() => setEdit({})}>+ Nuova collaborazione</button></div>
    {collabs.length === 0 && <div className="card"><Empty icon={<Icon name="award" size={28} strokeWidth={1.4} />} title="Nessuna collaborazione" hint="Registra le campagne per costruire lo storico commerciale." /></div>}
    {collabs.map((c: any) => (
      <div key={c.id} className="card">
        <div className="flex between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{c.brand_name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{c.status}{c.contract_value != null ? ` · ${fmtMoney(Number(c.contract_value))}` : ''}</div>
          </div>
          <div className="flex gap">
            <button className="btn btn-sm" onClick={() => setEdit(c)}>Modifica</button>
            <button className="btn btn-sm" onClick={() => setPerfFor(c)}><Icon name="activity" size={13} /> Performance</button>
            <ConfirmButton onConfirm={async () => { await supabase.from('cp_collaborations').delete().eq('id', c.id); reload() }}>Elimina</ConfirmButton>
          </div>
        </div>
      </div>
    ))}
    {edit && <CollabForm athleteId={athleteId} cats={cats} value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    {perfFor && <PerfForm collab={perfFor} existing={perf.find((p: any) => p.collaboration_id === perfFor.id)} onClose={() => setPerfFor(null)} onSaved={() => { setPerfFor(null); reload() }} />}
  </>)
}

function CollabForm({ athleteId, cats, value, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ status: 'attiva', ...value, activities_txt: (value.activities || []).join(', ') })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  async function save() {
    setBusy(true)
    const payload: any = {
      brand_name: f.brand_name, category_key: f.category_key || null, period_start: f.period_start || null,
      period_end: f.period_end || null, contract_value: f.contract_value ? Number(f.contract_value) : null,
      status: f.status, notes: f.notes || null, brand_feedback: f.brand_feedback || null,
      activities: (f.activities_txt || '').split(',').map((x: string) => x.trim()).filter(Boolean),
    }
    if (f.id) await supabase.from('cp_collaborations').update(payload).eq('id', f.id)
    else await supabase.from('cp_collaborations').insert({ ...payload, player_id: athleteId })
    setBusy(false); onSaved()
  }
  return (
    <Modal title={f.id ? 'Modifica collaborazione' : 'Nuova collaborazione'} onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Annulla</button><button className="btn btn-primary" disabled={busy || !f.brand_name} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button></>}>
      <div className="row2">
        <Field label="Brand *"><Input value={f.brand_name || ''} onChange={e => set('brand_name', e.target.value)} /></Field>
        <Field label="Categoria"><Select value={f.category_key || ''} onChange={e => set('category_key', e.target.value)}><option value="">—</option>{cats.map((c: any) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
      </div>
      <div className="row2">
        <Field label="Valore contratto (€)"><Input type="number" value={f.contract_value ?? ''} onChange={e => set('contract_value', e.target.value)} /></Field>
        <Field label="Stato"><Select value={f.status} onChange={e => set('status', e.target.value)}><option value="attiva">Attiva</option><option value="completata">Completata</option><option value="annullata">Annullata</option></Select></Field>
      </div>
      <div className="row2">
        <Field label="Inizio"><Input type="date" value={f.period_start || ''} onChange={e => set('period_start', e.target.value)} /></Field>
        <Field label="Fine"><Input type="date" value={f.period_end || ''} onChange={e => set('period_end', e.target.value)} /></Field>
      </div>
      <Field label="Attività (separate da virgola)"><Input value={f.activities_txt || ''} onChange={e => set('activities_txt', e.target.value)} /></Field>
      <Field label="Feedback del brand"><Input value={f.brand_feedback || ''} onChange={e => set('brand_feedback', e.target.value)} /></Field>
      <Field label="Note"><Textarea rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}

function PerfForm({ collab, existing, onClose, onSaved }: any) {
  const [f, setF] = useState<any>(existing || {})
  const [busy, setBusy] = useState(false)
  const num = (k: string, label: string) => (
    <Field label={label}><Input type="number" value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>
  )
  async function save() {
    setBusy(true)
    const body: any = { collaboration_id: collab.id, player_id: collab.player_id }
    ;['reach', 'impressions', 'engagement', 'views', 'clicks', 'conversions', 'posts_count', 'quality'].forEach(k => { body[k] = f[k] === '' || f[k] == null ? null : Number(f[k]) })
    body.on_time = f.on_time === true || f.on_time === 'true' ? true : f.on_time === false || f.on_time === 'false' ? false : null
    body.brand_feedback = f.brand_feedback || null
    if (existing?.id) await supabase.from('cp_performance').update(body).eq('id', existing.id)
    else await supabase.from('cp_performance').insert(body)
    setBusy(false); onSaved()
  }
  return (
    <Modal title={`Performance — ${collab.brand_name}`} onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Annulla</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button></>}>
      <div className="row2">{num('reach', 'Reach')}{num('impressions', 'Impression')}</div>
      <div className="row2">{num('engagement', 'Engagement %')}{num('views', 'Views')}</div>
      <div className="row2">{num('clicks', 'Click')}{num('conversions', 'Conversioni')}</div>
      <div className="row2">{num('posts_count', 'N. contenuti')}{num('quality', 'Qualità (1-10)')}</div>
      <Field label="Consegne puntuali"><Select value={f.on_time == null ? '' : String(f.on_time)} onChange={e => setF({ ...f, on_time: e.target.value })}><option value="">—</option><option value="true">Sì</option><option value="false">No</option></Select></Field>
      <Field label="Feedback del brand"><Input value={f.brand_feedback || ''} onChange={e => setF({ ...f, brand_feedback: e.target.value })} /></Field>
    </Modal>
  )
}

function AdminEval({ athleteId, reload }: any) {
  const [f, setF] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    supabase.from('cp_internal_evals').select('*').eq('player_id', athleteId).maybeSingle()
      .then(({ data }) => setF(data || { player_id: athleteId }))
  }, [athleteId])
  if (!f) return <Spinner />
  async function save() {
    setBusy(true)
    await supabase.from('cp_internal_evals').upsert({
      player_id: athleteId,
      reliability: f.reliability === '' || f.reliability == null ? null : Number(f.reliability),
      professionalism: f.professionalism === '' || f.professionalism == null ? null : Number(f.professionalism),
      punctuality: f.punctuality === '' || f.punctuality == null ? null : Number(f.punctuality),
      risk_rating: f.risk_rating || null,
      internal_notes: f.internal_notes || null,
    }, { onConflict: 'player_id' })
    setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500); reload()
  }
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Valutazione riservata</div>
      <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 14 }}>Tabella admin-only: l'atleta vede soltanto un'etichetta sintetica di affidabilità (Ottima / Molto buona / Buona / In costruzione).</div>
      <div className="row2">
        <Field label="Affidabilità (0-100)"><Input type="number" value={f.reliability ?? ''} onChange={e => setF({ ...f, reliability: e.target.value })} /></Field>
        <Field label="Professionalità (0-100)"><Input type="number" value={f.professionalism ?? ''} onChange={e => setF({ ...f, professionalism: e.target.value })} /></Field>
      </div>
      <div className="row2">
        <Field label="Puntualità (0-100)"><Input type="number" value={f.punctuality ?? ''} onChange={e => setF({ ...f, punctuality: e.target.value })} /></Field>
        <Field label="Rating rischio"><Select value={f.risk_rating || ''} onChange={e => setF({ ...f, risk_rating: e.target.value })}><option value="">—</option><option value="basso">Basso</option><option value="medio">Medio</option><option value="alto">Alto</option></Select></Field>
      </div>
      <Field label="Note interne"><Textarea rows={3} value={f.internal_notes || ''} onChange={e => setF({ ...f, internal_notes: e.target.value })} /></Field>
      <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : saved ? 'Salvato' : 'Salva valutazione'}</button>
    </div>
  )
}

function AdminConfig({ cfg, reload }: any) {
  const [w, setW] = useState<any>({ ...cfg.weights })
  const [bands, setBands] = useState<any[]>(cfg.value_bands || [])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const total = COMP_META.reduce((s, m) => s + (Number(w[m.key]) || 0), 0)
  async function save() {
    if (total !== 100) return
    setBusy(true)
    await supabase.from('cp_config').update({ weights: w, value_bands: bands }).eq('id', 1)
    setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500); reload()
  }
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Pesi del Commercial Score</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>La somma deve fare 100. I nuovi pesi si applicano subito al calcolo del punteggio.</div>
      <div className="grid g3">
        {COMP_META.map(m => (
          <Field key={m.key} label={m.label}><Input type="number" value={w[m.key] ?? ''} onChange={e => setW({ ...w, [m.key]: Number(e.target.value) })} /></Field>
        ))}
      </div>
      <div style={{ margin: '6px 0 18px', fontWeight: 700, color: total === 100 ? 'var(--green)' : 'var(--red)' }}>Totale: {total}/100</div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Bande di valore commerciale (€/anno)</div>
      {bands.map((b: any, i: number) => (
        <div key={i} className="flex gap" style={{ alignItems: 'center', marginBottom: 8 }}>
          <span style={{ width: 90, fontSize: 13, fontWeight: 600 }}>Score ≥ {b.min}</span>
          <Input type="number" value={b.lo} onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, lo: Number(e.target.value) } : x))} />
          <Input type="number" value={b.hi} onChange={e => setBands(bands.map((x, j) => j === i ? { ...x, hi: Number(e.target.value) } : x))} />
        </div>
      ))}
      <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy || total !== 100} onClick={save}>{busy ? 'Salvo…' : saved ? 'Salvato' : 'Salva configurazione'}</button>
    </div>
  )
}
