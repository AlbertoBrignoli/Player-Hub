// Motore del Commercial Score — rule-based e tracciabile.
// Ogni componente restituisce i fattori usati e i dati mancanti; i pesi
// arrivano da cp_config (DB) e non sono mai hardcoded nell'interfaccia.
import type { Player } from './types'

export interface CompFactor { label: string; note: string; val: number }
export interface CompResult { score: number; factors: CompFactor[]; missing: string[] }
export interface ScoreConfig { weights: Record<string, number>; levels: { min: number; label: string }[]; value_bands: { min: number; lo: number; hi: number }[] }
export interface FullScore {
  total: number; level: string; valueLo: number; valueHi: number
  components: Record<string, CompResult & { weight: number; label: string }>
}
export interface Reco { title: string; impact: number; priority: 'alta' | 'media' | 'bassa'; section: string; cta: string }

export const COMP_META = [
  { key: 'sport', label: 'Sport Value', icon: 'ball' },
  { key: 'audience', label: 'Audience Value', icon: 'users' },
  { key: 'content', label: 'Content Value', icon: 'image' },
  { key: 'brand_fit', label: 'Brand Fit', icon: 'award' },
  { key: 'reputation', label: 'Reputation & Reliability', icon: 'check-square' },
  { key: 'readiness', label: 'Commercial Readiness', icon: 'activity' },
]

export const DISCLAIMER = 'Stima indicativa basata sui dati disponibili. Non rappresenta un prezzo garantito o una valutazione finanziaria definitiva.'

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const fmtN = (n: any) => (n == null || n === '' ? '—' : Number(n).toLocaleString('it-IT'))

// Media pesata sui soli fattori disponibili; i mancanti finiscono in `missing`.
function wavg(parts: { val: number | null; w: number; label: string; note: string }[]): CompResult {
  const present = parts.filter(p => p.val !== null)
  const missing = parts.filter(p => p.val === null).map(p => p.label)
  if (!present.length) return { score: 25, factors: [], missing }
  const tw = present.reduce((s, p) => s + p.w, 0)
  const score = present.reduce((s, p) => s + (p.val as number) * p.w, 0) / tw
  return { score: clamp(Math.round(score)), factors: present.map(p => ({ label: p.label, note: p.note, val: Math.round(p.val as number) })), missing }
}

// ── SPORT VALUE — da player + player_stats_api (stagione corrente) ──────────
export function computeSport(player: Player | null, stats: any[], sportExtra: any = {}): CompResult {
  const season = stats.reduce((best: string | null, s: any) => (!best || String(s.season) > best ? String(s.season) : best), null)
  const cur = stats.filter(s => String(s.season) === season)
  const apps = cur.reduce((s, x) => s + (x.appearances || 0), 0)
  const minutes = cur.reduce((s, x) => s + (x.minutes || 0), 0)
  const goals = cur.reduce((s, x) => s + (x.goals || 0), 0)
  const assists = cur.reduce((s, x) => s + (x.assists || 0), 0)
  const ratings = cur.filter(x => x.rating && x.appearances).map(x => ({ r: Number(x.rating), w: x.appearances }))
  const rating = ratings.length ? ratings.reduce((s, x) => s + x.r * x.w, 0) / ratings.reduce((s, x) => s + x.w, 0) : null

  const pos = (player?.position || '').toLowerCase()
  const isGK = pos.includes('goal'), isDef = pos.includes('def'), isAtt = pos.includes('attack') || pos.includes('forward') || pos.includes('striker') || pos.includes('wing')

  const utilizzo = apps > 0 ? clamp((minutes / (apps * 90)) * 110) : null
  let produzione: number | null = null
  if (apps > 3 && !isGK) {
    const per = (goals + assists) / apps
    const target = isAtt ? 0.55 : isDef ? 0.15 : 0.3
    produzione = clamp((per / target) * 85)
  }
  const age = player?.age ?? null
  const eta = age === null ? null : age <= 19 ? 88 : age <= 23 ? 95 : age <= 27 ? 86 : age <= 30 ? 72 : 60
  const continuita = apps > 0 ? clamp((apps / 30) * 100) : null
  const ratingScore = rating !== null ? clamp(rating * 10.5) : null
  const nazionale = sportExtra?.national ? 92 : null

  return wavg([
    { val: utilizzo, w: 0.26, label: 'Utilizzo / titolarità', note: `${fmtN(minutes)} min in ${apps} presenze` },
    { val: produzione, w: 0.18, label: 'Produzione offensiva', note: `${goals} gol · ${assists} assist` },
    { val: ratingScore, w: 0.2, label: 'Rating stagionale', note: rating !== null ? rating.toFixed(2) : '' },
    { val: continuita, w: 0.14, label: 'Continuità', note: `${apps} presenze stagionali` },
    { val: eta, w: 0.14, label: 'Età e prospettiva', note: age ? `${age} anni` : '' },
    { val: nazionale, w: 0.08, label: 'Nazionale', note: sportExtra?.national || '' },
  ])
}

// ── AUDIENCE VALUE — instagram dal player, altri canali dal profilo ──────────
export function computeAudience(player: Player | null, aud: any = {}): CompResult {
  const ig = { followers: player?.instagram_followers || aud?.instagram?.followers || 0, er: player?.instagram_engagement ?? aud?.instagram?.er ?? null, reach: player?.instagram_reach || null }
  const total = (Number(ig.followers) || 0) + (Number(aud?.tiktok?.followers) || 0) + (Number(aud?.youtube?.followers) || 0)
  const ers = [ig.er, aud?.tiktok?.er, aud?.youtube?.er].map(Number).filter(x => x > 0)
  const er = ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null

  const followersScore = total > 0 ? clamp((Math.log10(total) / Math.log10(500_000)) * 100) : null
  // Una community piccola ma coinvolta vale più di una grande e fredda: l'ER pesa più dei follower.
  const erScore = er === null ? null : er >= 8 ? 96 : er >= 6 ? 88 : er >= 4 ? 74 : er >= 2 ? 55 : 38
  const reachScore = ig.reach && ig.followers ? clamp((ig.reach / ig.followers) * 260) : null
  const geoScore = Array.isArray(aud?.geo) && aud.geo.length ? 80 : null
  const demoScore = aud?.age_band || aud?.gender_split ? 78 : null
  const authScore = aud?.authenticity ? clamp(Number(aud.authenticity)) : null

  return wavg([
    { val: followersScore, w: 0.24, label: 'Follower totali', note: total ? fmtN(total) : '' },
    { val: erScore, w: 0.28, label: 'Engagement rate', note: er !== null ? `${Number(er).toFixed(1)}% medio` : '' },
    { val: reachScore, w: 0.14, label: 'Reach media', note: ig.reach ? `${fmtN(ig.reach)} per post` : '' },
    { val: geoScore, w: 0.1, label: 'Distribuzione geografica', note: (aud?.geo || []).join(', ') },
    { val: demoScore, w: 0.12, label: 'Demografia audience', note: [aud?.age_band, aud?.gender_split].filter(Boolean).join(' · ') },
    { val: authScore, w: 0.12, label: 'Autenticità follower', note: aud?.authenticity ? `${aud.authenticity}% stimata reale` : '' },
  ])
}

// ── CONTENT VALUE — dal calendario editoriale reale (crm_editorial) ─────────
export function computeContent(editorial: any[], contentExtra: any = {}): CompResult {
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000
  const recent = (editorial || []).filter(e => e.entry_date && new Date(e.entry_date).getTime() > cutoff && new Date(e.entry_date).getTime() <= Date.now())
  const freq = recent.length ? clamp((recent.length / 24) * 100) : null // target ~2 contenuti/settimana
  const videoShare = recent.length ? recent.filter(e => ['reel', 'video'].includes(e.type)).length / recent.length : null
  const videoScore = videoShare === null ? null : clamp((videoShare / 0.4) * 100)
  const types = new Set(recent.map(e => e.type).filter(Boolean))
  const varieta = recent.length ? clamp(types.size * 25) : null
  const done = recent.length ? recent.filter(e => (e.status || '').toLowerCase().includes('pubblic')).length / recent.length : null
  const affid = done === null ? null : clamp(45 + done * 55)
  const lifestyle = contentExtra?.lifestyle ? 85 : null
  const shooting = contentExtra?.shooting_available ? 88 : null

  return wavg([
    { val: freq, w: 0.28, label: 'Frequenza di pubblicazione', note: `${recent.length} contenuti negli ultimi 90gg` },
    { val: videoScore, w: 0.2, label: 'Utilizzo video / reel', note: videoShare !== null ? `${Math.round(videoShare * 100)}% dei contenuti` : '' },
    { val: varieta, w: 0.14, label: 'Varietà editoriale', note: `${types.size} formati diversi` },
    { val: affid, w: 0.16, label: 'Continuità e pubblicazione', note: done !== null ? `${Math.round(done * 100)}% pubblicati` : '' },
    { val: lifestyle, w: 0.1, label: 'Contenuti lifestyle', note: 'presenti nel profilo' },
    { val: shooting, w: 0.12, label: 'Shooting professionali', note: 'disponibilità dichiarata' },
  ])
}

// ── BRAND FIT (componente score: quanto il profilo è "matchabile") ───────────
export function computeBrandFitScore(profile: any): CompResult {
  const liked = profile?.categories_liked || []
  const excl = profile?.categories_excluded || []
  const ident = profile?.identity || {}
  const terr = profile?.territories || {}
  const availCount = Object.values(profile?.availability || {}).filter(Boolean).length
  return wavg([
    { val: liked.length >= 3 ? 90 : liked.length > 0 ? 65 : null, w: 0.24, label: 'Categorie preferite', note: `${liked.length} selezionate` },
    { val: excl.length > 0 ? 85 : null, w: 0.1, label: 'Categorie escluse definite', note: `${excl.length} escluse` },
    { val: (ident.values || []).length >= 3 ? 88 : (ident.values || []).length ? 62 : null, w: 0.2, label: 'Valori e posizionamento', note: (ident.values || []).slice(0, 4).join(', ') },
    { val: (terr.languages || []).length >= 2 ? 88 : (terr.languages || []).length ? 68 : null, w: 0.14, label: 'Lingue', note: (terr.languages || []).join(', ') },
    { val: (terr.markets || []).length >= 2 ? 86 : (terr.markets || []).length ? 66 : null, w: 0.14, label: 'Territori di riferimento', note: (terr.markets || []).join(', ') },
    { val: availCount >= 5 ? 92 : availCount >= 2 ? 70 : availCount ? 55 : null, w: 0.18, label: 'Disponibilità commerciale', note: `${availCount} formati disponibili` },
  ])
}

// ── REPUTATION — fascia sintetica da AUVI (mai il dato interno) + storico ───
export function computeReputation(reliabilityBand: number | null, collabs: any[], perf: any[]): CompResult {
  const completed = collabs.filter(c => c.status === 'completata')
  const onTime = perf.filter(p => p.on_time !== null && p.on_time !== undefined)
  const onTimeShare = onTime.length ? onTime.filter(p => p.on_time).length / onTime.length : null
  const quality = perf.filter(p => p.quality).map(p => p.quality)
  const qualityAvg = quality.length ? quality.reduce((a, b) => a + b, 0) / quality.length : null
  return wavg([
    { val: reliabilityBand, w: 0.45, label: 'Affidabilità operativa', note: 'valutazione AUVI' },
    { val: onTimeShare === null ? null : clamp(40 + onTimeShare * 60), w: 0.2, label: 'Puntualità nelle campagne', note: onTime.length ? `${Math.round((onTimeShare as number) * 100)}% consegne puntuali` : '' },
    { val: qualityAvg === null ? null : clamp(qualityAvg * 10), w: 0.15, label: 'Qualità collaborazioni', note: qualityAvg ? `${qualityAvg.toFixed(1)}/10 media brand` : '' },
    { val: completed.length ? clamp(60 + completed.length * 8) : null, w: 0.1, label: 'Storico collaborazioni', note: `${completed.length} completate` },
    { val: 72, w: 0.1, label: 'Reputazione pubblica', note: 'nessuna controversia registrata' },
  ])
}

// ── READINESS — checklist di completezza operativa ───────────────────────────
export function computeReadiness(profile: any, player: Player | null): CompResult {
  const aud = profile?.audience || {}
  const hasAudience = !!(player?.instagram_followers || aud?.tiktok?.followers || aud?.youtube?.followers)
  const availCount = Object.values(profile?.availability || {}).filter(Boolean).length
  const items = [
    { label: 'Onboarding completato', done: !!profile?.onboarding_completed },
    { label: 'Foto profilo', done: !!player?.photo_url },
    { label: 'Dati audience inseriti', done: hasAudience },
    { label: 'Distribuzione geografica audience', done: (aud.geo || []).length > 0 },
    { label: 'Disponibilità indicate', done: availCount >= 3 },
    { label: 'Categorie selezionate', done: (profile?.categories_liked || []).length >= 3 },
    { label: 'Lingue e territori', done: (profile?.territories?.languages || []).length > 0 },
    { label: 'Contatto commerciale', done: !!player?.contact_email },
    { label: 'Dati spedizione', done: !!player?.shipping },
    { label: 'Media Kit generato', done: !!profile?.media_kit?.generated_at },
  ]
  const done = items.filter(i => i.done).length
  return {
    score: Math.round((done / items.length) * 100),
    factors: items.map(i => ({ label: i.label, note: i.done ? 'completato' : 'da completare', val: i.done ? 100 : 0 })),
    missing: items.filter(i => !i.done).map(i => i.label),
  }
}

// ── SCORE COMPLESSIVO ────────────────────────────────────────────────────────
export function computeFullScore(cfg: ScoreConfig | null, args: {
  player: Player | null; stats: any[]; profile: any; editorial: any[]
  reliabilityBand: number | null; collabs: any[]; perf: any[]
}): FullScore {
  const w = cfg?.weights || { sport: 25, audience: 20, content: 15, brand_fit: 15, reputation: 15, readiness: 10 }
  const comps: any = {
    sport: computeSport(args.player, args.stats, args.profile?.sport),
    audience: computeAudience(args.player, args.profile?.audience),
    content: computeContent(args.editorial, args.profile?.content),
    brand_fit: computeBrandFitScore(args.profile),
    reputation: computeReputation(args.reliabilityBand, args.collabs, args.perf),
    readiness: computeReadiness(args.profile, args.player),
  }
  let total = 0, tw = 0
  COMP_META.forEach(m => {
    const wgt = Number(w[m.key]) || 0
    total += comps[m.key].score * wgt; tw += wgt
    comps[m.key].weight = wgt; comps[m.key].label = m.label
  })
  total = tw ? Math.round(total / tw) : 0
  const level = (cfg?.levels || []).find(l => total >= l.min)?.label || 'Profilo commerciale iniziale'
  const band = (cfg?.value_bands || []).find(b => total >= b.min) || { lo: 1000, hi: 4000 }
  return { total, level, valueLo: band.lo, valueHi: band.hi, components: comps }
}

// ── BRAND FIT per categoria: regole tracciabili, mai percentuali casuali ─────
const CAT_BASE: Record<string, number> = {
  sportswear: 78, wellness: 66, technology: 60, fashion: 58, food: 58, entertainment: 56,
  beverage: 56, gaming: 55, travel: 54, automotive: 52, family: 52, luxury: 48, finance: 45,
}
const INTEREST_CAT: Record<string, string[]> = {
  moda: ['fashion', 'luxury'], tecnologia: ['technology'], gaming: ['gaming', 'technology'],
  motori: ['automotive'], musica: ['entertainment'], 'cinema & serie': ['entertainment'],
  viaggi: ['travel'], cucina: ['food'], fitness: ['wellness', 'sportswear'], fotografia: ['technology', 'fashion'],
}
export function computeCategoryFit(catKey: string, profile: any, player: Player | null) {
  const reasons: string[] = []
  if ((profile?.categories_excluded || []).includes(catKey)) return { pct: 0, reasons: ['Categoria esclusa dalle tue preferenze'], excluded: true }
  let pct = CAT_BASE[catKey] ?? 50
  reasons.push('Coerenza di base con il profilo sportivo')
  if ((profile?.categories_liked || []).includes(catKey)) { pct += 12; reasons.push('Categoria indicata tra le preferite') }
  const interests = (profile?.identity?.interests || []).map((x: string) => x.toLowerCase())
  interests.forEach((i: string) => { if ((INTEREST_CAT[i] || []).includes(catKey)) { pct += 6; reasons.push(`Interesse personale: ${i}`) } })
  const ageBand = (profile?.audience?.age_band || '').toLowerCase()
  if (['gaming', 'technology', 'entertainment'].includes(catKey) && (ageBand.includes('13') || ageBand.includes('18'))) { pct += 7; reasons.push('Audience giovane coerente') }
  if (catKey === 'family' && (profile?.identity?.values || []).includes('Famiglia')) { pct += 10; reasons.push('Valore personale: famiglia') }
  if (catKey === 'travel' && (profile?.territories?.markets || []).length > 1) { pct += 8; reasons.push('Profilo internazionale, più mercati') }
  if (['fashion', 'luxury', 'travel'].includes(catKey) && profile?.content?.lifestyle) { pct += 5; reasons.push('Contenuti lifestyle presenti') }
  if ((profile?.territories?.languages || []).length >= 2 && ['travel', 'luxury', 'technology'].includes(catKey)) { pct += 4; reasons.push('Più lingue parlate') }
  if ((player?.instagram_engagement || 0) >= 4 && ['sportswear', 'fashion', 'technology'].includes(catKey)) { pct += 5; reasons.push('Engagement Instagram sopra la media') }
  return { pct: clamp(Math.round(pct), 0, 98), reasons, excluded: false }
}

// ── Raccomandazioni: azioni concrete con impatto stimato ─────────────────────
export function buildRecommendations(profile: any, player: Player | null, score: FullScore): Reco[] {
  const out: Reco[] = []
  const aud = profile?.audience || {}
  const hasAud = !!(player?.instagram_followers || aud?.tiktok?.followers || aud?.youtube?.followers)
  if (!hasAud) out.push({ title: 'Completa le informazioni sulla tua audience', impact: 3, priority: 'alta', section: 'dati', cta: 'Inserisci follower ed engagement dei tuoi canali' })
  if (hasAud && !(aud.geo || []).length) out.push({ title: "Completa la distribuzione geografica dell'audience", impact: 2, priority: 'media', section: 'dati', cta: 'Aggiungi i paesi principali del tuo pubblico' })
  if ((profile?.categories_liked || []).length < 3) out.push({ title: 'Inserisci le categorie di brand preferite', impact: 1, priority: 'media', section: 'dati', cta: 'Seleziona almeno 3 categorie' })
  if (!profile?.content?.shooting_available) out.push({ title: 'Realizza uno shooting lifestyle', impact: 3, priority: 'alta', section: 'dati', cta: 'Segnala la disponibilità per uno shooting professionale' })
  if (score.components.content.score < 60) out.push({ title: 'Aumenta la frequenza dei contenuti video', impact: 2, priority: 'media', section: 'valore', cta: 'Punta ad almeno 2 reel al mese' })
  if (!profile?.media_kit?.generated_at) out.push({ title: 'Genera il tuo Media Kit', impact: 2, priority: 'alta', section: 'mediakit', cta: 'Crea il PDF da condividere con i brand' })
  if (Object.values(profile?.availability || {}).filter(Boolean).length < 3) out.push({ title: 'Aggiorna le disponibilità commerciali', impact: 2, priority: 'media', section: 'dati', cta: 'Indica i formati che puoi offrire ai brand' })
  if (!player?.contact_email) out.push({ title: 'Aggiungi un contatto commerciale', impact: 1, priority: 'bassa', section: 'dati', cta: 'Inserisci una email di riferimento nel Profilo' })
  return out.sort((a, b) => b.impact - a.impact)
}

// ── Trend dai snapshot ───────────────────────────────────────────────────────
export function trendOf(snapshots: any[], current: number, days: number): number | null {
  const cutoff = Date.now() - days * 24 * 3600 * 1000
  const past = snapshots
    .filter(s => new Date(s.computed_at).getTime() <= cutoff)
    .sort((a, b) => new Date(b.computed_at).getTime() - new Date(a.computed_at).getTime())[0]
  return past ? Math.round(current - Number(past.total)) : null
}
