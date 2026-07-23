import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'

// Home del commercialista: la sua scheda, poi gli atleti seguiti.
// Cliccando l'atleta si apre la sua area legale e fiscale.
const ACCENT = '#B0663F'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

type Ath = {
  api_player_id: number
  name: string | null
  photo_url: string | null
  team_name: string | null
  position: string | null
  contract_expiry: string | null
}

export default function TaxAdvisorHome({ goto }: { goto?: (r: string) => void }) {
  const { session } = useAuth()
  const { setAthleteId } = useAthlete()
  const [me, setMe] = useState<any>({})
  const [rows, setRows] = useState<Ath[]>([])
  const [nextMatch, setNextMatch] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const uid = session?.user.id

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      const [prof, players, matches] = await Promise.all([
        supabase.from('crm_tax_profile').select('*').eq('advisor_id', uid).maybeSingle(),
        // RLS: l'agente vede solo i propri assistiti
        supabase.from('player')
          .select('api_player_id, name, photo_url, team_name, position, contract_expiry')
          .not('api_player_id', 'is', null).order('name'),
        supabase.from('matches')
          .select('player_id, match_date, opponent, venue')
          .gte('match_date', new Date().toISOString()).order('match_date'),
      ])
      if (!ok) return
      const nm: Record<number, string> = {}
      ;((matches.data as any[]) || []).forEach(m => {
        if (m.player_id && !nm[m.player_id]) {
          nm[m.player_id] = `${fmtDate(m.match_date)} · ${m.opponent || ''}${m.venue === 'away' ? ' (T)' : ''}`.trim()
        }
      })
      setMe(prof.data || {})
      setRows((players.data as Ath[]) || [])
      setNextMatch(nm)
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid])

  function openAthlete(id: number, route = 'legaltax') {
    setAthleteId(id)
    goto?.(route)
  }

  if (loading) return <Spinner />

  const nome = me.name || 'Il mio profilo'

  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* --- La mia scheda --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '24px 22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div className="flex gap" style={{ alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
          {me.photo_url
            ? <img src={me.photo_url} alt="" style={{ width: 60, height: 60, borderRadius: 15, objectFit: 'cover' }} />
            : <div style={{ width: 60, height: 60, borderRadius: 15, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 23, color: '#111' }}>
                {nome.slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...kicker, color: ACCENT }}>Commercialista</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.4, marginTop: 2 }}>{nome}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              {[me.title, me.agency_name].filter(Boolean).join(' · ') || 'Completa il tuo profilo'}
            </div>
          </div>
          {me.agency_logo_url && (
            <div style={{ background: '#fff', borderRadius: 12, padding: 8, display: 'flex' }}>
              <img src={me.agency_logo_url} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
            </div>
          )}
          {goto && (
            <button className="btn btn-sm" onClick={() => goto('tax-profile')}>
              <Icon name="edit" size={13} /> Il mio profilo
            </button>
          )}
        </div>

        <div className="flex gap" style={{ gap: 26, marginTop: 20, flexWrap: 'wrap' }}>
          <Metric label="Atleti" value={String(rows.length)} />
          {me.email && <Metric label="Email" value={me.email} small />}
          {me.phone && <Metric label="Telefono" value={me.phone} small />}
        </div>
      </div>

      {/* --- I miei assistiti --- */}
      <div>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
          <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
            <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
            <span style={{ ...kicker, color: 'var(--text)' }}>Atleti seguiti</span>
          </div>
          <span className="faint" style={{ fontSize: 12 }}>
            {rows.length} {rows.length === 1 ? 'atleta' : 'atleti'}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="card">
            <Empty icon={<Icon name="user" size={30} strokeWidth={1.4} />} title="Nessun assistito"
              hint="Chiedi ad AUVI di collegarti agli atleti." />
          </div>
        ) : (
          <div className="grid g3" style={{ gap: 12 }}>
            {rows.map(a => (
              <div key={a.api_player_id} className="card"
                style={{ padding: 0, cursor: 'pointer', overflow: 'hidden' }}
                onClick={() => openAthlete(a.api_player_id)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') openAthlete(a.api_player_id) }}>
                <div style={{ height: 3, background: ACCENT }} />
                <div style={{ padding: 16 }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
                    {a.photo_url
                      ? <img src={a.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} />
                      : <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                          {(a.name || '?').slice(0, 1)}
                        </div>}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                      <div className="faint" style={{ fontSize: 12 }}>
                        {[a.position, a.team_name].filter(Boolean).join(' · ') || 'Atleta'}
                      </div>
                      {nextMatch[a.api_player_id] && (
                        <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                          <Icon name="calendar" size={10} /> {nextMatch[a.api_player_id]}
                        </div>
                      )}

                    </div>
                  </div>

                  <div style={{ marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', background: ACCENT, color: '#111', fontWeight: 800, border: 'none' }}
                      onClick={e => { e.stopPropagation(); openAthlete(a.api_player_id) }}>
                      Apri area fiscale →
                    </button>
                    <div className="flex gap" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openAthlete(a.api_player_id, 'agenda') }}>
                        <Icon name="clock" size={12} /> Scadenze
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openAthlete(a.api_player_id, 'messages') }}>
                        <Icon name="message" size={12} /> Scrivi
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: small ? 13.5 : 22, fontWeight: small ? 600 : 900, marginTop: 2,
                    borderBottom: `2px solid ${ACCENT}`, display: 'inline-block', paddingBottom: 2 }}>
        {value}
      </div>
    </div>
  )
}
