import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useAuth } from '../auth/AuthContext'
import { toast } from '../lib/toast'
import Icon from '../components/Icon'

// I referenti dell'atleta: procuratore, assicuratore, preparatore.
// Ognuno con la propria scheda e il canale di chat dedicato.
type Ref = {
  key: string          // canale chat
  role: string
  label: string        // etichetta figura
  name: string
  detail: string
  email?: string | null
  phone?: string | null
  photo?: string | null
  accent: string
}

const C_AGENTE = '#C9A227'
const C_ASSIC = '#2E9BD6'
const C_COACH = '#C8FF2E'
const C_TAX = '#B0663F'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

export default function ReferentiCard({ goto }: { goto?: (r: string) => void }) {
  const { athleteId } = useAthlete()
  const { role } = useAuth()
  const [refs, setRefs] = useState<Ref[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const isPlayer = role === 'player'

  useEffect(() => {
    if (!athleteId) { setRefs([]); return }
    let ok = true
    ;(async () => {
      const out: Ref[] = []

      // Procuratore
      const { data: ag } = await supabase.from('crm_agent_athletes')
        .select('agent_id').eq('player_id', athleteId).limit(1).maybeSingle()
      if (ag?.agent_id) {
        const { data: p } = await supabase.from('crm_agent_profile')
          .select('*').eq('agent_id', ag.agent_id).maybeSingle()
        if (p) out.push({
          key: 'agente', role: 'agente', label: 'Procuratore',
          name: p.name || 'Procuratore',
          detail: [p.title, p.agency_name].filter(Boolean).join(' · '),
          email: p.email, phone: p.phone, photo: p.photo_url, accent: C_AGENTE,
        })
      }

      // Assicuratore
      const { data: ins } = await supabase.from('crm_insurer_athletes')
        .select('insurer_id').eq('player_id', athleteId).limit(1).maybeSingle()
      if (ins?.insurer_id) {
        const { data: p } = await supabase.from('crm_insurer_profile')
          .select('*').eq('insurer_id', ins.insurer_id).maybeSingle()
        if (p) out.push({
          key: 'assicuratore', role: 'assicuratore', label: 'Assicuratore',
          name: p.name || 'Assicuratore',
          detail: [p.title, p.agency_name].filter(Boolean).join(' · '),
          email: p.email, phone: p.phone, photo: p.photo_url, accent: C_ASSIC,
        })
      }

      // Commercialista
      const { data: tx } = await supabase.from('crm_tax_athletes')
        .select('advisor_id').eq('player_id', athleteId).limit(1).maybeSingle()
      if (tx?.advisor_id) {
        const { data: p } = await supabase.from('crm_tax_profile')
          .select('*').eq('advisor_id', tx.advisor_id).maybeSingle()
        if (p) out.push({
          key: 'commercialista', role: 'commercialista', label: 'Commercialista',
          name: p.name || 'Commercialista',
          detail: [p.title, p.agency_name].filter(Boolean).join(' · '),
          email: p.email, phone: p.phone, photo: p.photo_url, accent: C_TAX,
        })
      }

      // Preparatore
      const { data: tr } = await supabase.from('fitness_trainer_athletes')
        .select('trainer_id').eq('player_id', athleteId).limit(1).maybeSingle()
      if (tr?.trainer_id) {
        const { data: p } = await supabase.from('fitness_coach_profile')
          .select('*').eq('trainer_id', tr.trainer_id).maybeSingle()
        if (p) out.push({
          key: 'fitness', role: 'preparatore', label: 'Preparatore atletico',
          name: p.name || 'Preparatore',
          detail: p.headline || '',
          email: p.contacts?.email, phone: p.contacts?.phone,
          photo: p.photo_url, accent: C_COACH,
        })
      }

      // il codice personale dell'atleta e le richieste da approvare
      if (isPlayer) {
        const [pl, rq] = await Promise.all([
          supabase.from('player').select('access_code').eq('api_player_id', athleteId).maybeSingle(),
          supabase.from('crm_access_requests').select('id').eq('player_id', athleteId).eq('status', 'pending'),
        ])
        if (ok) {
          setCode((pl.data as any)?.access_code || null)
          setPending(((rq.data as any[]) || []).length)
        }
      }

      if (ok) setRefs(out)
    })()
    return () => { ok = false }
  }, [athleteId, isPlayer])

  if (refs.length === 0 && !isPlayer) return null

  return (
    <div style={{ marginTop: 4 }}>
      {isPlayer && pending > 0 && (
        <div className="card" style={{ borderColor: '#8b7ff055', marginBottom: 14 }}>
          <div className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...kicker, fontSize: 10, color: '#8b7ff0' }}>Da approvare</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 2 }}>
                {pending} {pending === 1 ? 'professionista chiede' : 'professionisti chiedono'} accesso alla tua area
              </div>
            </div>
            <button className="btn btn-sm" style={{ background: '#8b7ff0', color: '#fff', fontWeight: 800, border: 'none' }}
              onClick={() => goto?.('access-requests')}>Vedi richieste</button>
          </div>
        </div>
      )}

      {isPlayer && code && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ ...kicker, color: 'var(--text-dim)' }}>Il tuo codice</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>
            Dallo al tuo procuratore, assicuratore o preparatore: gli serve per chiedere
            l'accesso alla tua area. Nessuno può entrare senza la tua approvazione.
          </div>
          <div className="flex gap" style={{ alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <code style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3, color: '#8b7ff0',
                           border: '1px dashed var(--border)', borderRadius: 10, padding: '9px 16px' }}>
              {code}
            </code>
            <button className="btn btn-sm"
              onClick={() => { navigator.clipboard.writeText(code); toast('Codice copiato') }}>
              <Icon name="copy" size={13} /> Copia
            </button>
          </div>
        </div>
      )}

      {refs.length > 0 && (
      <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
        <div style={{ ...kicker, color: 'var(--text-dim)' }}>I tuoi referenti</div>
        <span className="faint" style={{ fontSize: 11.5 }}>Scrivi direttamente dall'app</span>
      </div>
      )}

      <div className="grid g3" style={{ gap: 12 }}>
        {refs.map(r => (
          <div key={r.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ height: 3, background: r.accent }} />
            <div style={{ padding: 15 }}>
              <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
                {r.photo
                  ? <img src={r.photo} alt="" style={{ width: 48, height: 48, borderRadius: 13, objectFit: 'cover' }} />
                  : <div style={{ width: 48, height: 48, borderRadius: 13, background: r.accent,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 900, color: '#111', fontSize: 18 }}>
                      {r.name.slice(0, 1)}
                    </div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...kicker, fontSize: 9.5, color: r.accent }}>{r.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </div>
                  {r.detail && (
                    <div className="faint" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.detail}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" style={{ background: r.accent, color: '#111', fontWeight: 800, border: 'none' }}
                  onClick={() => { try { sessionStorage.setItem('chat_channel', r.key) } catch {} ; goto?.('messages') }}>
                  <Icon name="message" size={13} /> Scrivi
                </button>
                {r.email && (
                  <a className="btn btn-ghost btn-sm" href={`mailto:${r.email}`}>
                    <Icon name="mail" size={13} /> Email
                  </a>
                )}
                {r.phone && (
                  <a className="btn btn-ghost btn-sm" href={`tel:${r.phone}`}>
                    <Icon name="smartphone" size={13} /> Chiama
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
