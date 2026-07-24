import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'

// Scheda servizio (design handoff): hero foto + identità partner, "il metodo",
// pilastri, questionario a 3 passi e conferma con timeline. Il questionario è
// costruito dallo schema salvato sul servizio: nessun form scritto a mano.

const T = {
  bg: '#0b0b0e', card: '#141419', cardDark: '#101015',
  border: '#26262e', text: '#f2f2f5', dim: '#c9c9d4', muted: '#8a8a96', faint: '#6e6e7a',
  green: '#4ade80',
}
const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', fontWeight: 800,
}

export type FieldDef = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'radio' | 'multiselect' | 'scale' | 'date' | 'number'
  options?: string[]
  required?: boolean
  help?: string
  section?: string
}

export type Service = {
  id: string
  category: string
  title: string
  description: string | null
  details: string | null
  icon: string
  verified: boolean
  partner_name: string | null
  partner_website: string | null
  logo_url: string | null
  cover_url: string | null
  accent_color: string | null
  hero_claim: string | null
  about: string | null
  highlights: { title: string; text: string }[] | null
  form_intro: string | null
  form_schema: FieldDef[] | null
  contact_email: string | null
  contact_phone: string | null
}

// divide lo schema in massimo 3 passi bilanciati (Passo N di 3)
function splitSteps(schema: FieldDef[]): FieldDef[][] {
  const n = schema.length
  if (n === 0) return []
  const g = Math.min(3, n)
  const base = Math.floor(n / g), rem = n % g
  const out: FieldDef[][] = []
  let i = 0
  for (let s = 0; s < g; s++) {
    const size = base + (s < rem ? 1 : 0)
    out.push(schema.slice(i, i + size))
    i += size
  }
  return out
}

export default function ServiceDetail({ service, playerId, canRequest, onBack, onSent }: {
  service: Service; playerId: number | null; canRequest: boolean
  onBack: () => void; onSent: () => void
}) {
  const accent = service.accent_color || '#7D6AE8'
  const schema = service.form_schema || []
  const steps = useMemo(() => splitSteps(schema), [schema])

  const [mode, setMode] = useState<'detail' | 'form' | 'sent'>('detail')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)

  const set = (k: string, v: any) => setAnswers(p => ({ ...p, [k]: v }))
  const toggle = (k: string, v: string) => setAnswers(p => {
    const cur: string[] = p[k] || []
    return { ...p, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }
  })

  const missingIn = (fields: FieldDef[]) => fields.filter(f => f.required &&
    (answers[f.key] == null || answers[f.key] === '' ||
      (Array.isArray(answers[f.key]) && answers[f.key].length === 0)))

  async function invia() {
    if (!playerId) return
    setBusy(true)
    const { error } = await supabase.from('crm_service_requests').insert({
      player_id: playerId, service_id: service.id, service_title: service.title,
      message: answers.note || null, answers,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    setMode('sent')
  }

  // ---------- VISTA CONFERMA ----------
  if (mode === 'sent') {
    const given = schema.filter(f => {
      const v = answers[f.key]
      return v != null && v !== '' && (!Array.isArray(v) || v.length > 0)
    })
    const fmt = (v: any) => Array.isArray(v) ? v.join(', ') : String(v)
    return (
      <div className="grid" style={{ gap: 18, color: T.text }}>
        <style>{sentAnim}</style>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, padding: '28px 22px', textAlign: 'center' }}>
          <div style={{
            width: 66, height: 66, borderRadius: '50%', margin: '0 auto', background: `${T.green}22`,
            border: `2px solid ${T.green}`, color: T.green, display: 'flex', alignItems: 'center',
            justifyContent: 'center', animation: 'auviPop .35s ease',
          }}>
            <Icon name="check" size={30} />
          </div>
          <div style={{ fontSize: 21, fontWeight: 900, marginTop: 16 }}>Richiesta inviata</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
            {service.partner_name ? `Ci occupiamo noi di attivare ${service.partner_name}.` : 'Ci pensiamo noi da qui.'}
          </div>
        </div>

        {/* timeline 3 step */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
          {[
            { t: 'Richiesta inviata', s: 'Le risposte sono arrivate al tuo advisor', done: true },
            { t: 'Il tuo advisor ti scrive', s: 'Entro 24 ore', done: false },
            { t: 'Attivazione partner', s: service.partner_name || 'Professionista selezionato da AUVI', done: false },
          ].map((r, i, arr) => (
            <div key={i} className="flex gap" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: r.done ? T.green : 'transparent', color: r.done ? '#0b0b0e' : T.muted,
                  border: `1.5px solid ${r.done ? T.green : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900,
                }}>{r.done ? '✓' : i + 1}</span>
                {i < arr.length - 1 && <span style={{ width: 2, height: 26, background: T.border }} />}
              </div>
              <div style={{ paddingBottom: i < arr.length - 1 ? 8 : 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.t}</div>
                <div style={{ fontSize: 12, color: T.dim }}>{r.s}</div>
              </div>
            </div>
          ))}
        </div>

        {/* riepilogo per il partner */}
        {given.length > 0 && (
          <div style={{ background: T.cardDark, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ ...kicker, fontSize: 10, color: accent, marginBottom: 12 }}>Riepilogo per il partner</div>
            <div className="grid" style={{ gap: 10 }}>
              {given.map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 11.5, color: T.muted }}>{f.label}</div>
                  <div style={{ fontSize: 13.5, marginTop: 1 }}>{fmt(answers[f.key])}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onSent}
          style={{ padding: '13px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: T.text, color: '#0b0b0e', fontWeight: 800, fontSize: 14 }}>
          Torna allo store
        </button>
      </div>
    )
  }

  // ---------- VISTA QUESTIONARIO ----------
  if (mode === 'form') {
    const cur = steps[step] || []
    const last = step === steps.length - 1
    const missing = missingIn(cur)
    const next = () => {
      if (missing.length) { toast('Completa le domande obbligatorie', 'err'); return }
      if (last) invia(); else setStep(s => s + 1)
    }
    return (
      <div className="grid" style={{ gap: 18, color: T.text }}>
        <button onClick={() => (step === 0 ? setMode('detail') : setStep(s => s - 1))}
          className="flex gap" style={{ alignItems: 'center', gap: 8, alignSelf: 'start', background: 'none',
            border: 'none', color: T.dim, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
          ← Indietro
        </button>

        <div>
          <div style={{ ...kicker, fontSize: 10, color: accent }}>Questionario · 3 minuti</div>
          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{service.title}</div>
        </div>

        {/* progress: Passo N di M */}
        <div>
          <div style={{ fontSize: 11.5, color: T.dim, marginBottom: 6 }}>Passo {step + 1} di {steps.length}</div>
          <div className="flex gap" style={{ gap: 5 }}>
            {steps.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2,
                background: i <= step ? T.text : T.border }} />
            ))}
          </div>
        </div>

        <div className="grid" style={{ gap: 18 }}>
          {cur.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 3 }}>
                {f.label}{f.required && <span style={{ color: accent }}> *</span>}
              </div>
              {f.help && <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 7 }}>{f.help}</div>}

              {f.type === 'textarea' && (
                <Textarea rows={3} value={answers[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
              )}
              {f.type === 'text' && (
                <Input value={answers[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
              )}
              {f.type === 'number' && (
                <Input type="number" value={answers[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
              )}
              {f.type === 'date' && (
                <Input type="date" value={answers[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
              )}
              {f.type === 'radio' && (
                <div className="flex gap" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {(f.options || []).map(o => {
                    const on = answers[f.key] === o
                    return <Chip key={o} on={on} accent={accent} onClick={() => set(f.key, o)}>{o}</Chip>
                  })}
                </div>
              )}
              {f.type === 'multiselect' && (
                <div className="flex gap" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {(f.options || []).map(o => {
                    const on = (answers[f.key] || []).includes(o)
                    return <Chip key={o} on={on} accent={accent} onClick={() => toggle(f.key, o)}>{o}</Chip>
                  })}
                </div>
              )}
              {f.type === 'scale' && (
                <div className="flex gap" style={{ gap: 8 }}>
                  {[1, 2, 3, 4, 5].map(n => {
                    const on = answers[f.key] === n
                    return <Chip key={n} on={on} accent={accent} onClick={() => set(f.key, n)} min={44}>{String(n)}</Chip>
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={next} disabled={busy}
          style={{ padding: '14px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: T.text, color: '#0b0b0e', fontWeight: 800, fontSize: 14 }}>
          {busy ? 'Invio…' : last ? 'Invia richiesta' : 'Continua'}
        </button>
        <div style={{ fontSize: 11.5, color: T.muted, textAlign: 'center' }}>
          Le risposte vanno solo al tuo advisor e al partner.
        </div>
      </div>
    )
  }

  // ---------- VISTA DETTAGLIO ----------
  const hasForm = canRequest && schema.length > 0
  return (
    <div className="grid" style={{ gap: 16, color: T.text }}>
      <button onClick={onBack}
        className="flex gap" style={{ alignItems: 'center', gap: 8, alignSelf: 'start', background: 'none',
          border: 'none', color: T.dim, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
        ← Tutti i servizi
      </button>

      {/* hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20,
        minHeight: service.cover_url ? 300 : 180, background: accent, padding: 22,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: '#fff' }}>
        {service.cover_url && (
          <>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${service.cover_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div style={{ position: 'absolute', inset: 0,
              background: `linear-gradient(180deg, ${accent}44 0%, ${accent}cc 62%, ${accent} 100%)` }} />
          </>
        )}
        <div style={{ position: 'relative' }}>
          <div style={{ ...kicker, fontSize: 10, opacity: .8 }}>
            Servizio AUVI · {service.verified ? 'Partner verificato' : 'Su richiesta'}
          </div>
          {service.logo_url && (
            <div style={{ marginTop: 12 }}>
              {service.cover_url ? (
                <img src={service.logo_url} alt={service.partner_name || ''}
                  style={{ height: 42, maxWidth: 210, objectFit: 'contain',
                    filter: 'drop-shadow(0 2px 10px rgba(0,0,0,.55))' }} />
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px',
                  display: 'inline-flex' }}>
                  <img src={service.logo_url} alt={service.partner_name || ''}
                    style={{ height: 32, objectFit: 'contain' }} />
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1, marginTop: 12 }}>
            {service.partner_name || service.title}
          </div>
          {service.hero_claim && (
            <div style={{ ...kicker, fontSize: 10.5, opacity: .85, marginTop: 6 }}>{service.hero_claim}</div>
          )}
        </div>
      </div>

      {service.description && (
        <div style={{ fontSize: 15, lineHeight: 1.55, color: T.dim }}>{service.description}</div>
      )}

      {service.about && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
          <div style={{ ...kicker, fontSize: 10.5, color: accent, marginBottom: 8 }}>Il metodo</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{service.about}</div>
        </div>
      )}

      {service.details && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderLeft: `3px solid ${accent}`,
          borderRadius: 16, padding: 18 }}>
          <div style={{ ...kicker, fontSize: 10.5, color: accent, marginBottom: 8 }}>Il percorso</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{service.details}</div>
        </div>
      )}

      {/* pilastri a scorrimento orizzontale */}
      {service.highlights && service.highlights.length > 0 && (
        <div className="flex gap" style={{ gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {service.highlights.map((h, i) => (
            <div key={i} style={{ flex: '0 0 75%', maxWidth: 300, background: T.card,
              border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ ...kicker, fontSize: 10, color: accent }}>{h.title}</div>
              <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>{h.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* contatti */}
      {(service.contact_email || service.contact_phone || service.partner_website) && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
          <div style={{ ...kicker, fontSize: 10.5, color: T.muted, marginBottom: 10 }}>Contatti</div>
          <div className="flex gap" style={{ flexWrap: 'wrap', gap: 10 }}>
            {service.partner_website && (
              <a className="btn btn-ghost btn-sm" href={service.partner_website} target="_blank" rel="noreferrer">
                <Icon name="star" size={13} /> Sito
              </a>
            )}
            {service.contact_email && (
              <a className="btn btn-ghost btn-sm" href={`mailto:${service.contact_email}`}>
                <Icon name="mail" size={13} /> {service.contact_email}
              </a>
            )}
            {service.contact_phone && (
              <a className="btn btn-ghost btn-sm" href={`tel:${service.contact_phone.replace(/\s/g, '')}`}>
                <Icon name="smartphone" size={13} /> {service.contact_phone}
              </a>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 10 }}>
            La richiesta passa comunque da AUVI: ti seguiamo noi fino all'avvio del percorso.
          </div>
        </div>
      )}

      {/* CTA sticky */}
      {hasForm && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 4, paddingTop: 10,
          background: `linear-gradient(180deg, transparent, ${T.bg} 40%)` }}>
          <button onClick={() => { setStep(0); setMode('form') }}
            style={{ width: '100%', padding: '15px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: T.text, color: '#0b0b0e', fontWeight: 800, fontSize: 15 }}>
            Compila il questionario
          </button>
          <div style={{ fontSize: 11.5, color: T.muted, textAlign: 'center', marginTop: 8 }}>
            ◷ circa 3 minuti · il partner costruisce il pacchetto su di te · nessun impegno
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ on, accent, onClick, children, min }: {
  on: boolean; accent: string; onClick: () => void; children: React.ReactNode; min?: number
}) {
  return (
    <button onClick={onClick}
      style={{
        padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
        minWidth: min, justifyContent: 'center', display: 'inline-flex', alignItems: 'center',
        border: `1px solid ${on ? accent : '#2e2e3a'}`,
        background: on ? accent : 'transparent', color: on ? '#fff' : '#c9c9d4',
      }}>
      {children}
    </button>
  )
}

const sentAnim = `
@keyframes auviPop {
  0% { transform: scale(.4); opacity: 0; }
  60% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); }
}
`
