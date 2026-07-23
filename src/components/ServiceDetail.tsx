import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Field, Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'

// Pagina di un servizio: identità del partner + form di onboarding costruito
// dallo schema salvato sul servizio. Nessun form scritto a mano per ogni partner.
const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
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
  accent_color: string | null
  hero_claim: string | null
  about: string | null
  highlights: { title: string; text: string }[] | null
  form_intro: string | null
  form_schema: FieldDef[] | null
  contact_email: string | null
  contact_phone: string | null
}

export default function ServiceDetail({ service, playerId, canRequest, onBack, onSent }: {
  service: Service; playerId: number | null; canRequest: boolean
  onBack: () => void; onSent: () => void
}) {
  const accent = service.accent_color || '#7D6AE8'
  const schema = service.form_schema || []
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const set = (k: string, v: any) => setAnswers(p => ({ ...p, [k]: v }))
  const toggle = (k: string, v: string) => setAnswers(p => {
    const cur: string[] = p[k] || []
    return { ...p, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }
  })

  const risposte = schema.filter(f => {
    const v = answers[f.key]
    return v != null && v !== '' && (!Array.isArray(v) || v.length > 0)
  }).length

  const mancanti = schema.filter(f => f.required &&
    (answers[f.key] == null || (Array.isArray(answers[f.key]) && answers[f.key].length === 0)))

  async function invia() {
    if (!playerId) return
    if (mancanti.length) { toast('Completa le domande obbligatorie', 'err'); return }
    setBusy(true)
    const { error } = await supabase.from('crm_service_requests').insert({
      player_id: playerId, service_id: service.id, service_title: service.title,
      message: answers.note || null, answers,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast('Richiesta inviata')
    onSent()
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'start' }} onClick={onBack}>
        ← Tutti i servizi
      </button>

      {/* --- hero con l'identità del partner --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: accent, padding: '30px 26px', color: '#fff' }}>
        <div style={{ position: 'absolute', right: -60, top: -60, width: 220, height: 220,
                      borderRadius: '50%', background: '#fff', opacity: .06, pointerEvents: 'none' }} />
        <div style={{ ...kicker, fontSize: 10, opacity: .7 }}>
          Servizio offerto da AUVI{service.verified ? ' · Partner verificato' : ''}
        </div>

        <div className="flex gap" style={{ alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          {service.logo_url && (
            <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', display: 'flex' }}>
              <img src={service.logo_url} alt={service.partner_name || ''}
                style={{ height: 34, objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
              {service.partner_name || service.title}
            </div>
            <div style={{ ...kicker, fontSize: 11, opacity: .85, marginTop: 5 }}>
              {service.hero_claim || service.title}
            </div>
          </div>
        </div>

        {service.description && (
          <div style={{ fontSize: 14, marginTop: 18, maxWidth: 640, opacity: .92, lineHeight: 1.55 }}>
            {service.description}
          </div>
        )}
      </div>

      {/* --- chi sono --- */}
      {service.about && (
        <div className="card">
          <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 8 }}>Il metodo</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{service.about}</div>
        </div>
      )}

      {/* --- come funziona --- */}
      {service.details && (
        <div className="card" style={{ borderLeft: `3px solid ${accent}` }}>
          <div style={{ ...kicker, color: accent, marginBottom: 8 }}>Il percorso</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{service.details}</div>
        </div>
      )}

      {/* --- pilastri --- */}
      {service.highlights && service.highlights.length > 0 && (
        <div className="grid g3" style={{ gap: 12 }}>
          {service.highlights.map((h, i) => (
            <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 3, background: accent }} />
              <div style={{ padding: 16 }}>
                <div style={{ ...kicker, fontSize: 10.5, color: accent }}>{h.title}</div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>{h.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- form di onboarding --- */}
      {canRequest && schema.length > 0 && (
        <div className="card">
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ ...kicker, color: accent }}>Iniziamo</div>
            <span className="faint" style={{ fontSize: 11.5 }}>
              <Icon name="clock" size={11} /> circa 3 minuti · {schema.length} domande
            </span>
          </div>
          {service.form_intro && (
            <div className="faint" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.55 }}>
              {service.form_intro}
            </div>
          )}

          {!open ? (
            <button className="btn" style={{ background: accent, color: '#fff', fontWeight: 800, border: 'none' }}
              onClick={() => setOpen(true)}>
              Compila il questionario
            </button>
          ) : (
            <div className="grid" style={{ gap: 16 }}>
              {/* avanzamento: un form lungo deve dire quanto manca */}
              <div>
                <div className="flex between" style={{ fontSize: 11.5, marginBottom: 5 }}>
                  <span className="faint">{risposte} di {schema.length} risposte</span>
                  <span className="faint">{Math.round((risposte / schema.length) * 100)}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${(risposte / schema.length) * 100}%`, height: '100%',
                                background: accent, transition: 'width .2s ease' }} />
                </div>
              </div>

              {schema.map((f, i) => (
                <div key={f.key}>
                  {f.section && f.section !== schema[i - 1]?.section && (
                    <div style={{ ...kicker, fontSize: 10, color: accent,
                                  marginTop: i === 0 ? 0 : 10, marginBottom: 12,
                                  paddingBottom: 7, borderBottom: '1px solid var(--border)' }}>
                      {f.section}
                    </div>
                  )}
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 3 }}>
                    {f.label}{f.required && <span style={{ color: accent }}> *</span>}
                  </div>
                  {f.help && <div className="faint" style={{ fontSize: 11.5, marginBottom: 7 }}>{f.help}</div>}

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
                        return (
                          <button key={o} className="btn btn-sm"
                            style={on ? { background: accent, color: '#fff', border: 'none', fontWeight: 700 } : undefined}
                            onClick={() => set(f.key, o)}>{o}</button>
                        )
                      })}
                    </div>
                  )}

                  {f.type === 'multiselect' && (
                    <div className="flex gap" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {(f.options || []).map(o => {
                        const on = (answers[f.key] || []).includes(o)
                        return (
                          <button key={o} className="btn btn-sm"
                            style={on ? { background: accent, color: '#fff', border: 'none', fontWeight: 700 } : undefined}
                            onClick={() => toggle(f.key, o)}>{o}</button>
                        )
                      })}
                    </div>
                  )}

                  {f.type === 'scale' && (
                    <div className="flex gap" style={{ gap: 8 }}>
                      {[1, 2, 3, 4, 5].map(n => {
                        const on = answers[f.key] === n
                        return (
                          <button key={n} className="btn btn-sm"
                            style={{ minWidth: 44, justifyContent: 'center',
                                     ...(on ? { background: accent, color: '#fff', border: 'none', fontWeight: 800 } : {}) }}
                            onClick={() => set(f.key, n)}>{n}</button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn" style={{ background: accent, color: '#fff', fontWeight: 800, border: 'none' }}
                  disabled={busy} onClick={invia}>
                  {busy ? 'Invio…' : 'Invia richiesta'}
                </button>
                {mancanti.length > 0 && (
                  <span className="faint" style={{ fontSize: 12 }}>
                    Mancano {mancanti.length} risposte obbligatorie
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- contatti del partner --- */}
      {(service.contact_email || service.contact_phone || service.partner_website) && (
        <div className="card">
          <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 10 }}>Contatti</div>
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
          <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
            La richiesta passa comunque da AUVI: ti seguiamo noi fino all'avvio del percorso.
          </div>
        </div>
      )}
    </div>
  )
}
