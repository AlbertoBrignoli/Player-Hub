// RICERCA TALENT — lato brand.
// Il referente del brand compila le caratteristiche dell'atleta che cerca
// (specchio dell'onboarding commerciale); il sistema calcola un match 0-100
// rule-based con gli atleti del roster usando SOLO dati già visibili al brand
// (cp_preferences_public + player). In fondo, la via diretta al team AUVI.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Field, Input, Textarea, Badge, Empty, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime } from '../lib/format'
import {
  AVAIL_OPTS, VALUE_OPTS, INTEREST_OPTS, LANG_OPTS, MARKET_OPTS,
  computeBrandAthleteMatch, type BrandMatch,
} from '../lib/commercialScore'

function MatchRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const stroke = 6, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  const color = pct >= 70 ? 'var(--green)' : pct >= 45 ? 'var(--gold)' : 'var(--text-faint)'
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * circ} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.3, fontWeight: 700, fill: 'var(--text)' }}>{pct}</text>
    </svg>
  )
}

export default function TalentSearch({ goto }: { goto?: (r: string) => void }) {
  const { session } = useAuth()
  const { setAthleteId } = useAthlete()
  const [brand, setBrand] = useState<any>(null)
  const [search, setSearch] = useState<any>(null)
  const [cats, setCats] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [prefs, setPrefs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [openReasons, setOpenReasons] = useState<number | null>(null)

  useEffect(() => {
    ;(async () => {
      const [b, s, c, p, pr] = await Promise.all([
        supabase.from('crm_brands').select('id, name').limit(1).maybeSingle(),
        supabase.from('cp_brand_search').select('*').limit(1).maybeSingle(),
        supabase.from('cp_brand_categories').select('*').eq('active', true).order('sort'),
        supabase.from('player').select('api_player_id, name, photo_url, age, position, team_name').not('api_player_id', 'is', null),
        supabase.from('cp_preferences_public').select('*'),
      ])
      setBrand(b.data || null)
      setSearch(s.data || null)
      setCats(c.data || [])
      setPlayers(p.data || [])
      setPrefs(pr.data || [])
      setEditing(!s.data) // primo accesso: form aperto
      setLoading(false)
    })()
  }, [])

  const [f, setF] = useState<any>(null)
  useEffect(() => { setF(search || {}) }, [search])

  async function save() {
    if (!brand?.id) return
    setBusy(true)
    const body = {
      brand_id: brand.id,
      categories: f.categories || [],
      values_wanted: f.values_wanted || [],
      interests_wanted: f.interests_wanted || [],
      activities: f.activities || [],
      markets: f.markets || [],
      languages: f.languages || [],
      age_min: f.age_min ? Number(f.age_min) : null,
      age_max: f.age_max ? Number(f.age_max) : null,
      notes: f.notes || null,
      updated_by: session?.user.id || null,
    }
    const { data } = await supabase.from('cp_brand_search').upsert(body, { onConflict: 'brand_id' }).select().maybeSingle()
    setSearch(data || body)
    setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500); setEditing(false)
  }

  const results = useMemo(() => {
    if (!search) return []
    return players
      .map(p => {
        const pref = prefs.find(x => x.player_id === p.api_player_id)
        const m = computeBrandAthleteMatch(search, pref, p) as BrandMatch
        return { player: p, match: m }
      })
      .sort((a, b) => (b.match?.pct || 0) - (a.match?.pct || 0))
  }, [search, players, prefs])

  if (loading) return <Spinner />

  const toggle = (key: string, list: string[]) => {
    const cur: string[] = f?.[key] || []
    setF({ ...f, [key]: cur.includes(list[0]) ? cur.filter(x => x !== list[0]) : [...cur, list[0]] })
  }
  const chips = (key: string, options: string[]) => (
    <div className="flex gap" style={{ flexWrap: 'wrap' }}>
      {options.map(o => {
        const on = (f?.[key] || []).includes(o)
        return <button key={o} className={`btn btn-sm ${on ? 'btn-primary' : ''}`} onClick={() => toggle(key, [o])}>{o}</button>
      })}
    </div>
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ── Profilo di ricerca ── */}
      <div className="card">
        <div className="flex between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700 }}>La tua ricerca</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Descrivi l'atleta ideale per {brand?.name || 'il tuo brand'}: il match con il roster si aggiorna in automatico.
            </div>
          </div>
          {!editing && search && <button className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={13} /> Modifica</button>}
        </div>

        {editing ? (
          <div style={{ marginTop: 14 }}>
            <Field label="Categorie merceologiche del brand">
              <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                {cats.map((c: any) => {
                  const on = (f?.categories || []).includes(c.key)
                  return <button key={c.key} className={`btn btn-sm ${on ? 'btn-primary' : ''}`}
                    onClick={() => setF({ ...f, categories: on ? f.categories.filter((x: string) => x !== c.key) : [...(f.categories || []), c.key] })}>{c.name}</button>
                })}
              </div>
            </Field>
            <Field label="Valori che cerchi nell'atleta">{chips('values_wanted', VALUE_OPTS)}</Field>
            <Field label="Interessi affini al brand">{chips('interests_wanted', INTEREST_OPTS)}</Field>
            <Field label="Attività che ti servono">
              <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                {AVAIL_OPTS.map(a => {
                  const on = (f?.activities || []).includes(a.key)
                  return <button key={a.key} className={`btn btn-sm ${on ? 'btn-primary' : ''}`}
                    onClick={() => setF({ ...f, activities: on ? f.activities.filter((x: string) => x !== a.key) : [...(f.activities || []), a.key] })}>{a.label}</button>
                })}
              </div>
            </Field>
            <Field label="Mercati target">{chips('markets', MARKET_OPTS)}</Field>
            <Field label="Lingue richieste">{chips('languages', LANG_OPTS)}</Field>
            <div className="row2">
              <Field label="Età minima"><Input type="number" value={f?.age_min ?? ''} onChange={e => setF({ ...f, age_min: e.target.value })} /></Field>
              <Field label="Età massima"><Input type="number" value={f?.age_max ?? ''} onChange={e => setF({ ...f, age_max: e.target.value })} /></Field>
            </div>
            <Field label="Note per AUVI (obiettivi, budget indicativo, tempi…)">
              <Textarea rows={2} value={f?.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} />
            </Field>
            <div className="flex gap">
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : saved ? 'Salvato' : 'Salva ricerca'}</button>
              {search && <button className="btn btn-ghost" onClick={() => { setF(search); setEditing(false) }}>Annulla</button>}
            </div>
          </div>
        ) : search ? (
          <div style={{ marginTop: 12 }}>
            <div className="flex gap" style={{ flexWrap: 'wrap' }}>
              {(search.categories || []).map((k: string) => <Badge key={k} tone="accent">{cats.find((c: any) => c.key === k)?.name || k}</Badge>)}
              {(search.values_wanted || []).map((v: string) => <Badge key={v}>{v}</Badge>)}
              {(search.age_min || search.age_max) && <Badge>{search.age_min || '…'}–{search.age_max || '…'} anni</Badge>}
              {(search.markets || []).map((m: string) => <Badge key={m}>{m}</Badge>)}
            </div>
            {search.updated_at && <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>Aggiornata {fmtDateTime(search.updated_at)}</div>}
          </div>
        ) : null}
      </div>

      {/* ── Risultati con match ── */}
      {search && !editing && (
        <>
          <div className="ed-masthead" style={{ alignItems: 'center' }}>
            <div className="ed-masthead-t">Match con il roster AUVI</div>
            <div className="ed-rule" />
          </div>
          {results.length === 0 && <Empty icon={<Icon name="users" size={28} strokeWidth={1.4} />} title="Nessun atleta disponibile" />}
          {results.map(({ player: p, match: m }, i) => (
            <div className="card" key={p.api_player_id}>
              <div className="flex gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                {p.photo_url
                  ? <img src={p.photo_url} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                  : <div className="avatar" style={{ width: 52, height: 52, fontSize: 17 }}>{(p.name || '?').slice(0, 1)}</div>}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 750, fontSize: 15.5 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{p.position || ''}{p.team_name ? ` · ${p.team_name}` : ''}{p.age ? ` · ${p.age} anni` : ''}</div>
                  {m?.partial && !m.blocked && <Badge tone="gold">Profilo in completamento</Badge>}
                </div>
                {m && <MatchRing pct={m.pct} />}
                <div className="flex gap" style={{ flexDirection: 'column' }}>
                  <button className="btn btn-sm" onClick={() => setOpenReasons(openReasons === i ? null : i)}>Perché {m?.pct}/100</button>
                  <button className="btn btn-primary btn-sm" onClick={() => { setAthleteId(p.api_player_id); goto?.('mediakit') }}>Vedi profilo</button>
                </div>
              </div>
              {openReasons === i && m && (
                <div style={{ marginTop: 12, background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                  {m.reasons.map((r, j) => <div key={j}>· {r}</div>)}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Claim finale: la via diretta ad AUVI ── */}
      <div className="card card-lg" style={{ textAlign: 'center', padding: '30px 24px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          Non hai trovato ciò che cerchi?
        </div>
        <div className="muted" style={{ fontSize: 13.5, maxWidth: 480, margin: '0 auto 16px', lineHeight: 1.6 }}>
          Scrivi direttamente al team di AUVI: provvederemo alla ricerca di talent on target con la tua richiesta,
          dentro e fuori dal nostro roster.
        </div>
        <button className="btn btn-primary" onClick={() => goto?.('messages')}>
          <Icon name="message" size={15} /> Scrivi al team AUVI
        </button>
      </div>
    </div>
  )
}
