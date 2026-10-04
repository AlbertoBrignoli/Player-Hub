// Statistiche da API-Football: stagione (player_stats_api.raw), partita per partita (matches),
// carriera, trofei, trasferimenti, infortuni (player_api_extra).
// Regola: si mostra SOLO cio' che API-Football fornisce davvero. Una voce senza dato non
// compare (niente caselle "—"); una sezione senza voci non compare.
import { useState } from 'react'
import { Badge } from './ui'
import Icon from './Icon'
import { fmtDate } from '../lib/format'

type Raw = any
export interface ApiSeasonRow {
  id: string; season: number | null; competition: string | null; team_id?: number | null
  appearances: number | null; minutes: number | null; goals: number | null; assists: number | null
  rating: number | null; raw?: Raw
}
export interface ApiExtra {
  profile: Raw | null; seasons: number[] | null
  transfers: Raw[] | null; trophies: Raw[] | null; sidelined: Raw[] | null; updated_at: string
}

// ruolo dal testo API ("Attacker", "Goalkeeper"), dal profilo ("Centre Back") o dalla
// sigla partita ("F", "G"...)
export function roleOf(pos: string | null | undefined): 'G' | 'D' | 'M' | 'F' | '' {
  const t = String(pos || '').trim().toLowerCase()
  if (!t) return ''
  if (/goal|keeper|portier/.test(t)) return 'G'
  if (/back|defen|difens/.test(t)) return 'D'
  if (/mid|centrocamp/.test(t)) return 'M'
  if (/forw|attack|attacc|strik|wing|punta/.test(t)) return 'F'
  const c = t.charAt(0)
  return c === 'g' ? 'G' : c === 'd' ? 'D' : c === 'm' ? 'M' : c === 'f' ? 'F' : ''
}

// porta inviolata: portiere in campo almeno 60′ senza subire gol
export const isCleanSheet = (m: any) => (m.minutes || 0) >= 60 && m.goals_conceded != null && Number(m.goals_conceded) === 0

const n = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))
const pct = (a: number | null, b: number | null) => (a != null && b ? Math.round((a * 100) / b) : null)

function KV({ k, v, sub, tone }: { k: string; v: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="kv">
      <div className="kv-k">{k}</div>
      <div className="kv-v" style={tone ? { color: tone } : undefined}>{v}</div>
      {sub != null && <div className="kv-sub">{sub}</div>}
    </div>
  )
}
const pctTone = (p: number | null) => (p == null ? undefined : p >= 70 ? 'var(--green)' : p >= 50 ? undefined : 'var(--gold)')

// ── Stagione: somma delle competizioni della stagione scelta ─────────────────
// `matches` (partite giocate della stagione) serve ai portieri per le porte inviolate,
// che API-Football non da' nel riepilogo di stagione.
export function ApiSeason({ rows, matches = [], role: roleHint }: { rows: ApiSeasonRow[]; matches?: any[]; role?: string | null }) {
  const raws = rows.map(r => r.raw).filter(Boolean) as Raw[]
  // somma una voce su tutte le competizioni; null se API non la fornisce in nessuna
  const s = (f: (x: Raw) => any) => {
    let any = false, t = 0
    for (const x of raws) { const v = n(f(x)); if (v != null) { any = true; t += v } }
    return any ? t : null
  }
  const apps = s(x => x.games?.appearences) ?? rows.reduce((a, r) => a + (r.appearances || 0), 0)
  const lineups = s(x => x.games?.lineups)
  const subIn = s(x => x.substitutes?.in)
  const bench = s(x => x.substitutes?.bench)
  const mins = s(x => x.games?.minutes)
  const goals = s(x => x.goals?.total) ?? rows.reduce((a, r) => a + (r.goals || 0), 0)
  const assists = s(x => x.goals?.assists) ?? rows.reduce((a, r) => a + (r.assists || 0), 0)
  // voto medio pesato sulle presenze
  let rw = 0, ra = 0
  for (const x of raws) { const r = n(x.games?.rating), a = n(x.games?.appearences); if (r && a) { rw += r * a; ra += a } }
  const rating = ra ? rw / ra : null
  // precisione passaggi: in API e' una media per competizione, la peso sui passaggi
  let pw = 0, pt = 0
  for (const x of raws) { const acc = n(x.passes?.accuracy), tot = n(x.passes?.total); if (acc != null && tot) { pw += acc * tot; pt += tot } }
  const passAcc = pt ? Math.round(pw / pt) : null
  const role = roleOf(raws.find(x => x.games?.position)?.games?.position) || roleOf(roleHint)
  const isGK = role === 'G'

  const shots = s(x => x.shots?.total), shotsOn = s(x => x.shots?.on)
  const keyP = s(x => x.passes?.key), passes = s(x => x.passes?.total)
  const drA = s(x => x.dribbles?.attempts), drS = s(x => x.dribbles?.success), drPast = s(x => x.dribbles?.past)
  const duT = s(x => x.duels?.total), duW = s(x => x.duels?.won)
  const tk = s(x => x.tackles?.total), bl = s(x => x.tackles?.blocks), ic = s(x => x.tackles?.interceptions)
  const fD = s(x => x.fouls?.drawn), fC = s(x => x.fouls?.committed)
  const yc = s(x => x.cards?.yellow), yr = s(x => x.cards?.yellowred), rc = s(x => x.cards?.red)
  const pWon = s(x => x.penalty?.won), pCom = s(x => x.penalty?.commited), pSc = s(x => x.penalty?.scored)
  const pMis = s(x => x.penalty?.missed), pSav = s(x => x.penalty?.saved)
  const saves = s(x => x.goals?.saves), conc = s(x => x.goals?.conceded)
  const per90 = (v: number | null) => (v != null && mins ? (v * 90 / mins).toFixed(2) : null)

  type Item = [string, React.ReactNode, React.ReactNode?, string?] | null
  const sec = (title: string, items: Item[]) => ({ title, items: items.filter(Boolean) as Exclude<Item, null>[] })
  const attacco = sec('Attacco', [
    shots != null ? ['Tiri', shots, shotsOn != null ? `${shotsOn} in porta` : undefined] : null,
    shots ? ['Precisione tiro', `${pct(shotsOn, shots)}%`, undefined, pctTone(pct(shotsOn, shots))] : null,
    goals + assists > 0 && mins ? ['Gol + assist / 90′', per90(goals + assists)] : null,
    drA ? ['Dribbling riusciti', `${drS ?? 0}/${drA}`, `${pct(drS, drA)}%`] : null,
    (pSc ?? 0) + (pMis ?? 0) > 0 ? ['Rigori segnati', `${pSc ?? 0}/${(pSc ?? 0) + (pMis ?? 0)}`] : null,
    pWon ? ['Rigori procurati', pWon] : null,
  ])
  const gioco = sec('Gioco', [
    passes != null ? ['Passaggi', passes, mins ? `${per90(passes)} ogni 90′` : undefined] : null,
    passAcc != null ? ['Precisione passaggi', `${passAcc}%`, undefined, pctTone(passAcc)] : null,
    keyP != null ? ['Passaggi chiave', keyP] : null,
    fD != null ? ['Falli subiti', fD] : null,
  ])
  const difesa = sec('Duelli e difesa', [
    duT ? ['Duelli vinti', `${duW ?? 0}/${duT}`, `${pct(duW, duT)}%`, pctTone(pct(duW, duT))] : null,
    tk != null ? ['Contrasti', tk] : null,
    ic != null ? ['Intercetti', ic] : null,
    bl != null ? ['Tiri respinti', bl] : null,
    drPast != null ? ['Superato in dribbling', drPast] : null,
    pCom ? ['Rigori causati', pCom] : null,
  ])
  // PORTIERE: parate, % parate (parate / tiri in porta subiti = parate + gol), ogni 90′,
  // porte inviolate dalle partite, rigori parati
  const savePct = saves != null && conc != null && saves + conc > 0 ? Math.round(saves * 100 / (saves + conc)) : null
  const gkPlayed = matches.filter(m => (m.minutes || 0) > 0 && m.goals_conceded != null)
  const cleanSheets = gkPlayed.filter(isCleanSheet).length
  const portiere = sec('In porta', [
    saves != null ? ['Parate', saves, mins ? `${per90(saves)} ogni 90′` : undefined] : null,
    savePct != null ? ['Parate su tiri in porta', `${savePct}%`, `${saves}/${saves! + conc!}`, savePct >= 70 ? 'var(--green)' : savePct < 60 ? 'var(--gold)' : undefined] : null,
    gkPlayed.length ? ['Porta inviolata', cleanSheets, `su ${gkPlayed.length} partite giocate`, cleanSheets ? 'var(--green)' : undefined] : null,
    pSav != null ? ['Rigori parati', pSav] : null,
  ])
  const piedi = sec('Gioco con i piedi', [
    passes != null ? ['Passaggi', passes, mins ? `${per90(passes)} ogni 90′` : undefined] : null,
    passAcc != null ? ['Precisione passaggi', `${passAcc}%`, undefined, pctTone(passAcc)] : null,
    duT ? ['Duelli vinti', `${duW ?? 0}/${duT}`, `${pct(duW, duT)}%`] : null,
  ])
  // per un portiere conta anche la disponibilita': convocazioni, titolarita', panchina
  const convocazioni = apps != null || bench != null ? (apps || 0) + (bench || 0) : null
  const disponibilita = sec('Disponibilità', [
    convocazioni ? ['Convocazioni', convocazioni, 'in campo o in panchina'] : null,
    lineups != null && convocazioni ? ['Titolare', `${lineups}/${convocazioni}`, `${pct(lineups, convocazioni)}% delle convocazioni`] : null,
    bench != null ? ['In panchina', bench, 'senza entrare'] : null,
    subIn ? ['Entrato a gara in corso', subIn] : null,
  ])
  const disciplina = sec('Disciplina', [
    fC != null ? ['Falli commessi', fC] : null,
    yc != null ? ['Gialli', yc] : null,
    yr ? ['Doppi gialli', yr] : null,
    rc != null ? ['Rossi', rc] : null,
  ])
  const disciplinaGK = sec('Disciplina', [
    ...disciplina.items,
    pCom ? ['Rigori causati', pCom] as Item : null,
  ])
  const order = isGK ? [portiere, piedi, disponibilita, disciplinaGK]
    : role === 'D' ? [difesa, gioco, attacco, disciplina]
    : role === 'M' ? [gioco, attacco, difesa, disciplina]
    : [attacco, gioco, difesa, disciplina]
  const sections = order.filter(x => x.items.length)

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="kv-grid kv-grid-hero">
        <KV k="Presenze" v={apps}
          sub={lineups != null ? `${lineups} da titolare${subIn ? ` · ${subIn} da subentrato` : ''}` : undefined} />
        {mins != null && <KV k="Minuti" v={`${mins}′`} sub={apps ? `${Math.round(mins / apps)}′ a presenza` : undefined} />}
        {isGK
          ? conc != null && <KV k="Gol subiti" v={conc} sub={mins ? `${per90(conc)} ogni 90′` : undefined} />
          : <KV k="Gol · Assist" v={`${goals} · ${assists}`} />}
        {rating != null && <KV k="Voto medio" v={rating.toFixed(2)} tone={rating >= 7 ? 'var(--green)' : undefined} />}
        {!isGK && bench ? <KV k="In panchina" v={bench} sub="senza entrare" /> : null}
      </div>
      {sections.map(sc => (
        <div key={sc.title}>
          <div className="kv-title">{sc.title}</div>
          <div className="kv-grid">
            {sc.items.map(([k, v, sub, tone]) => <KV key={k} k={k} v={v} sub={sub} tone={tone} />)}
          </div>
        </div>
      ))}
      {rows.length > 1 && (
        <div>
          <div className="kv-title">Per competizione</div>
          <div className="list">
            {rows.map(r => {
              const m = n(r.raw?.games?.minutes)
              return (
                <div className="row" key={r.id} style={{ padding: '10px 2px' }}>
                  {r.raw?.league?.logo && <img src={r.raw.league.logo} alt="" className="api-logo" />}
                  <div className="row-main">
                    <div className="row-title">{r.competition}</div>
                    <div className="row-sub">
                      {r.appearances ?? 0} pres.{m ? ` · ${m}′` : ''} · {isGK
                        ? `${n(r.raw?.goals?.conceded) ?? '—'} subiti${n(r.raw?.goals?.saves) != null ? ` · ${r.raw.goals.saves} parate` : ''}`
                        : `${r.goals ?? 0} gol · ${r.assists ?? 0} assist`}
                    </div>
                  </div>
                  {r.rating ? <Badge tone={r.rating >= 7 ? 'green' : undefined}>{Number(r.rating).toFixed(2)}</Badge> : null}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Partita per partita (lista verticale, niente tabelle larghe) ─────────────
export function ApiMatchList({ matches }: { matches: any[] }) {
  const played = matches.filter(m => m.minutes != null && m.minutes > 0)
  const noData = matches.length - played.length
  if (!played.length) return <div className="faint" style={{ padding: '6px 0' }}>Nessuna partita con statistiche del giocatore in questa stagione.</div>
  return (
    <div>
      <div className="list">
        {played.map(m => {
          const role = roleOf(m.position)
          const bits: string[] = []
          const add = (label: string, v: any) => { if (v != null) bits.push(`${label} ${v}`) }
          if (role === 'G') {
            add('Parate', m.saves); add('Gol subiti', m.goals_conceded)
            const sv = n(m.saves), gc = n(m.goals_conceded)
            if (sv != null && gc != null && sv + gc > 0) bits.push(`${Math.round(sv * 100 / (sv + gc))}% parate`)
            if (m.penalty_saved) bits.push(`${m.penalty_saved} rigore parato`)
          } else {
            if (m.shots_total != null) bits.push(`Tiri ${m.shots_total}${m.shots_on != null ? ` (${m.shots_on})` : ''}`)
            add('Pass. chiave', m.passes_key)
            if (m.dribbles_attempts) bits.push(`Dribbling ${m.dribbles_success ?? 0}/${m.dribbles_attempts}`)
            if (role === 'D' || role === 'M') { add('Contrasti', m.tackles); add('Intercetti', m.interceptions) }
          }
          if (m.duels_total) bits.push(`Duelli ${m.duels_won ?? 0}/${m.duels_total}`)
          if (m.passes_total) bits.push(`Passaggi ${m.passes_total}${m.passes_accuracy ? ` (${pct(n(m.passes_accuracy), m.passes_total)}%)` : ''}`)
          const r = n(m.rating)
          const score = m.team_score != null ? `${m.team_score}-${m.opponent_score}` : ''
          const res = m.team_score == null ? '' : m.team_score > m.opponent_score ? 'V' : m.team_score < m.opponent_score ? 'S' : 'P'
          return (
            <div className="row" key={m.id} style={{ alignItems: 'flex-start', padding: '12px 2px' }}>
              <div className="row-main">
                <div className="row-title">
                  {(m.venue || '').toLowerCase() === 'home' ? 'vs' : '@'} {m.opponent}
                  {score && <span className={`api-res api-res-${res}`}>{score}</span>}
                  {role === 'G' && isCleanSheet(m) && <span className="api-res api-res-V">porta inviolata</span>}
                </div>
                <div className="row-sub">
                  {fmtDate(m.match_date)} · {m.league}{m.is_substitute ? ' · subentrato' : m.is_substitute === false ? ' · titolare' : ''}
                </div>
                <div className="row-sub" style={{ marginTop: 4 }}>
                  {m.goals ? <b>{m.goals} gol · </b> : null}
                  {m.assists ? <b>{m.assists} assist · </b> : null}
                  {m.yellow_cards ? <span className="api-card api-card-y" title="Ammonito" /> : null}
                  {m.red_cards ? <span className="api-card api-card-r" title="Espulso" /> : null}
                  {bits.join(' · ')}
                </div>
              </div>
              <div className="row-right">
                {r ? <div className="api-vote" style={{ color: r >= 7 ? 'var(--green)' : r < 6 ? 'var(--red)' : undefined }}>{r.toFixed(1)}</div> : null}
                <div className="faint" style={{ fontSize: 11.5 }}>{m.minutes}′</div>
              </div>
            </div>
          )
        })}
      </div>
      {noData > 0 && (
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
          {noData} {noData === 1 ? 'partita' : 'partite'} senza statistiche del giocatore (non entrato, oppure coppe e amichevoli che API-Football non copre).
        </div>
      )}
    </div>
  )
}

// ── Carriera: stagione per stagione, squadre e competizioni ──────────────────
export function ApiCareer({ rows, role: roleHint }: { rows: ApiSeasonRow[]; role?: string | null }) {
  const isGK = (roleOf(rows.find(r => r.raw?.games?.position)?.raw?.games?.position) || roleOf(roleHint)) === 'G'
  const [all, setAll] = useState(false)
  // fuori: amichevoli, competizioni senza presenze, e i doppioni di API-Football
  // (a volte ripete la stessa riga identica su due squadre della stessa stagione)
  const seenKey = new Set<string>()
  const clean = rows.filter(r => {
    if (r.season == null || !(r.appearances || r.goals)) return false
    if (/friendl/i.test(r.competition || '')) return false
    const k = [r.season, r.competition, r.appearances, r.goals, r.assists, r.minutes, r.rating].join('|')
    if (seenKey.has(k)) return false
    seenKey.add(k); return true
  })
  const bySeason = new Map<number, ApiSeasonRow[]>()
  for (const r of clean) bySeason.set(r.season!, [...(bySeason.get(r.season!) || []), r])
  const seasons = [...bySeason.keys()].sort((a, b) => b - a)
  if (!seasons.length) return null
  const totApps = clean.reduce((a, r) => a + (r.appearances || 0), 0)
  const totGoals = clean.reduce((a, r) => a + (r.goals || 0), 0)
  const totAssists = clean.reduce((a, r) => a + (r.assists || 0), 0)
  const teams = new Set(clean.map(r => r.raw?.team?.name).filter(Boolean))
  const shown = all ? seasons : seasons.slice(0, 5)
  const first = seasons[seasons.length - 1]
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="kv-grid kv-grid-hero">
        <KV k="Stagioni" v={seasons.length} sub={`dal ${first}/${String((first + 1) % 100).padStart(2, '0')}`} />
        <KV k="Presenze" v={totApps} sub="campionati e coppe" />
        {isGK
          ? <KV k="Gol subiti" v={clean.reduce((a, r) => a + (n(r.raw?.goals?.conceded) || 0), 0)} sub="dove API li riporta" />
          : <KV k="Gol · Assist" v={`${totGoals} · ${totAssists}`} />}
        <KV k="Squadre" v={teams.size} />
      </div>
      <div className="list">
        {shown.map(y => {
          // squadra per squadra, ognuna con le sue competizioni
          const byTeam = new Map<string, ApiSeasonRow[]>()
          for (const r of bySeason.get(y)!) {
            const t = r.raw?.team?.name || '—'
            byTeam.set(t, [...(byTeam.get(t) || []), r])
          }
          const teamsY = [...byTeam.entries()].sort((a, b) =>
            b[1].reduce((s, r) => s + (r.appearances || 0), 0) - a[1].reduce((s, r) => s + (r.appearances || 0), 0))
          return (
            <div className="row" key={y} style={{ alignItems: 'flex-start' }}>
              <div className="api-season">{y}/{String((y + 1) % 100).padStart(2, '0')}</div>
              <div className="row-main grid" style={{ gap: 8 }}>
                {teamsY.map(([t, list]) => (
                  <div key={t}>
                    <div className="row-title flex" style={{ gap: 6, alignItems: 'center' }}>
                      {list[0].raw?.team?.logo && <img src={list[0].raw.team.logo} alt="" className="api-logo" />}{t}
                    </div>
                    {list.sort((a, b) => (b.appearances || 0) - (a.appearances || 0)).map(r => (
                      <div className="row-sub" key={r.id}>
                        {r.competition}: {[
                          `${r.appearances ?? 0} pres.`,
                          ...(isGK
                            ? [n(r.raw?.goals?.conceded) != null ? `${r.raw.goals.conceded} subiti` : '',
                               n(r.raw?.goals?.saves) != null ? `${r.raw.goals.saves} parate` : '']
                            : [`${r.goals ?? 0} gol`, r.assists ? `${r.assists} assist` : '']),
                        ].filter(Boolean).join(' · ')}
                        {r.rating ? ` · voto ${Number(r.rating).toFixed(2)}` : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {seasons.length > 5 && (
        <button className="btn btn-ghost btn-sm" onClick={() => setAll(a => !a)} style={{ justifySelf: 'start' }}>
          {all ? 'Mostra solo le ultime stagioni' : `Mostra tutta la carriera (${seasons.length} stagioni)`}
        </button>
      )}
    </div>
  )
}

// paesi di API-Football in italiano
const COUNTRY: Record<string, string> = {
  England: 'Inghilterra', Italy: 'Italia', Greece: 'Grecia', Germany: 'Germania', Spain: 'Spagna',
  France: 'Francia', Turkey: 'Turchia', 'Türkiye': 'Turchia', Cyprus: 'Cipro', Portugal: 'Portogallo',
  Netherlands: 'Paesi Bassi', Belgium: 'Belgio', Scotland: 'Scozia', Switzerland: 'Svizzera',
  Austria: 'Austria', Europe: 'Europa', World: 'Mondo', Albania: 'Albania',
}
export const countryIt = (c?: string | null) => (c ? COUNTRY[c] || c : '')

// ── Trofei ───────────────────────────────────────────────────────────────────
const PLACE: Record<string, string> = { Winner: 'Vincitore', '2nd Place': '2° posto', '3rd Place': '3° posto' }
export function ApiTrophies({ list }: { list: Raw[] }) {
  // API ripete ogni trofeo anche senza stagione: tengo la versione con la stagione
  const withSeason = list.filter(t => t.season)
  const seen = new Set(withSeason.map(t => `${t.league}|${t.place}|${t.country}`))
  const items = [...withSeason, ...list.filter(t => !t.season && !seen.has(`${t.league}|${t.place}|${t.country}`))]
    .sort((a, b) => (a.place === 'Winner' ? 0 : 1) - (b.place === 'Winner' ? 0 : 1) || String(b.season || '').localeCompare(String(a.season || '')))
  const wins = items.filter(t => t.place === 'Winner').length
  return (
    <div>
      <div className="faint" style={{ fontSize: 12.5, marginBottom: 6 }}>{wins} vinti · {items.length - wins} finali/piazzamenti</div>
      <div className="list">
        {items.map((t, i) => (
          <div className="row" key={i} style={{ padding: '10px 2px' }}>
            <span style={{ color: t.place === 'Winner' ? 'var(--gold)' : 'var(--text-faint)' }}><Icon name="award" size={18} /></span>
            <div className="row-main">
              <div className="row-title">{t.league}</div>
              <div className="row-sub">{countryIt(t.country)}{t.season ? ` · ${t.season}` : ''}</div>
            </div>
            <Badge tone={t.place === 'Winner' ? 'gold' : undefined}>{PLACE[t.place] || t.place}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Trasferimenti ────────────────────────────────────────────────────────────
const TTYPE: Record<string, string> = { Loan: 'Prestito', Free: 'Parametro zero', 'Back from Loan': 'Rientro dal prestito', Transfer: 'Trasferimento' }
export function ApiTransfers({ list }: { list: Raw[] }) {
  const items = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return (
    <div className="list">
      {items.map((t, i) => {
        const type = t.type && t.type !== 'N/A' ? (TTYPE[t.type] || t.type) : null
        return (
          <div className="row" key={i} style={{ padding: '10px 2px' }}>
            <div className="row-main">
              <div className="row-title flex wrap" style={{ gap: '4px 8px', alignItems: 'center' }}>
                <span className="api-team muted">
                  {t.teams?.out?.logo && <img src={t.teams.out.logo} alt="" className="api-logo" />}{t.teams?.out?.name}
                </span>
                <span className="faint">→</span>
                <span className="api-team">
                  {t.teams?.in?.logo && <img src={t.teams.in.logo} alt="" className="api-logo" />}{t.teams?.in?.name}
                </span>
              </div>
              <div className="row-sub">{fmtDate(t.date)}</div>
            </div>
            {type && <Badge>{type}</Badge>}
          </div>
        )
      })}
    </div>
  )
}

// ── Infortuni (storico stop) ─────────────────────────────────────────────────
const INJ: Record<string, string> = {
  Hamstring: 'Bicipite femorale', 'Groin Injury': 'Inguine', 'Ankle/Foot Injury': 'Caviglia / piede',
  'Knee Injury': 'Ginocchio', 'Muscle Injury': 'Muscolare', 'Calf Injury': 'Polpaccio', 'Thigh Injury': 'Coscia',
  'Back Injury': 'Schiena', 'Hip Injury': 'Anca', 'Shoulder Injury': 'Spalla', Illness: 'Malattia',
  Suspended: 'Squalifica', 'Red Card': 'Squalifica (rosso)', 'Yellow Cards': 'Squalifica (gialli)',
}
export function ApiInjuries({ list }: { list: Raw[] }) {
  const items = [...list].sort((a, b) => String(b.start).localeCompare(String(a.start)))
  return (
    <div className="list">
      {items.map((t, i) => {
        const days = t.start && t.end ? Math.round((new Date(t.end).getTime() - new Date(t.start).getTime()) / 864e5) : null
        return (
          <div className="row" key={i} style={{ padding: '10px 2px' }}>
            <div className="row-main">
              <div className="row-title">{INJ[t.type] || t.type}</div>
              <div className="row-sub">{fmtDate(t.start)} → {t.end ? fmtDate(t.end) : 'in corso'}</div>
            </div>
            {days != null && <Badge>{days} giorni</Badge>}
          </div>
        )
      })}
    </div>
  )
}
