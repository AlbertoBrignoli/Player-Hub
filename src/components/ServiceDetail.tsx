import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'
import { useLang } from '../lib/i18n'

// Scheda servizio (design handoff): hero + identità partner, metodo, pilastri,
// cosa include, citazione, questionario a passi (per sezione) e conferma.
// Tutto guidato dai dati del servizio: nessun contenuto scritto a mano.

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
  placeholder?: string
}

export type Service = {
  i18n?: Record<string, Record<string, any>> | null
  id: string
  category: string
  title: string
  description: string | null
  desc_long: string | null
  details: string | null
  icon: string
  verified: boolean
  partner_name: string | null
  partner_website: string | null
  logo_url: string | null
  cover_url: string | null
  accent_color: string | null
  hue: number | null
  hero_claim: string | null
  about: string | null
  highlights: { title: string; text: string }[] | null
  includes: string[] | null
  partner_note: string | null
  sla: string | null
  quote: string | null
  quote_by: string | null
  form_intro: string | null
  form_schema: FieldDef[] | null
  contact_email: string | null
  contact_phone: string | null
}

// colore accent: esplicito, oppure derivato dalla tinta (oklch) come nel prototipo
function accentOf(s: Service) {
  return s.accent_color || `oklch(0.85 0.13 ${s.hue ?? 250})`
}
function tileBg(s: Service) { return `oklch(0.3 0.07 ${s.hue ?? 250})` }
function initials(s: string) {
  return s.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
}

// raggruppa lo schema per sezione (ogni sezione = un passo)
function toSteps(schema: FieldDef[]) {
  const map = new Map<string, FieldDef[]>()
  const order: string[] = []
  for (const f of schema) {
    const s = f.section || ' '
    if (!map.has(s)) { map.set(s, []); order.push(s) }
    map.get(s)!.push(f)
  }
  return order.map(s => ({ title: s, fields: map.get(s)! }))
}

export default function ServiceDetail({ service, playerId, canRequest, onBack, onSent }: {
  service: Service; playerId: number | null; canRequest: boolean
  onBack: () => void; onSent: () => void
}) {
  const { lang, t } = useLang()
  const L = (f: string) => (lang === 'en' && service.i18n?.en?.[f] != null) ? service.i18n.en[f] : (service as any)[f]
  const accent = accentOf(service)
  const schema = service.form_schema || []
  const steps = useMemo(() => toSteps(schema), [schema])

  const [mode, setMode] = useState<'detail' | 'form' | 'sent'>('detail')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)

  const set = (k: string, v: any) => setAnswers(p => ({ ...p, [k]: v }))
  const toggle = (k: string, v: string) => setAnswers(p => {
    const cur: string[] = p[k] || []
    return { ...p, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }
  })

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

  // ---------- CONFERMA ----------
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
          <div style={{ width: 66, height: 66, borderRadius: '50%', margin: '0 auto', background: `${T.green}22`,
            border: `2px solid ${T.green}`, color: T.green, display: 'flex', alignItems: 'center',
            justifyContent: 'center', animation: 'auviPop .35s ease' }}>
            <Icon name="check" size={30} />
          </div>
          <div style={{ fontSize: 21, fontWeight: 900, marginTop: 16 }}>{t("Richiesta inviata")}</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
            {service.partner_name ? `Ci occupiamo noi di attivare ${service.partner_name}.` : t('Ci pensiamo noi da qui.')}
          </div>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
          {[
            { t: 'Richiesta inviata', s: t('Le risposte sono arrivate al tuo advisor'), done: true },
            { t: t('Il tuo advisor ti scrive'), s: t('Entro 24 ore'), done: false },
            { t: t('Attivazione partner'), s: service.partner_name || t('Professionista selezionato da AUVI'), done: false },
          ].map((r, i, arr) => (
            <div key={i} className="flex gap" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: r.done ? T.green : 'transparent', color: r.done ? '#0b0b0e' : T.muted,
                  border: `1.5px solid ${r.done ? T.green : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>
                  {r.done ? '✓' : i + 1}</span>
                {i < arr.length - 1 && <span style={{ width: 2, height: 26, background: T.border }} />}
              </div>
              <div style={{ paddingBottom: i < arr.length - 1 ? 8 : 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.t}</div>
                <div style={{ fontSize: 12, color: T.dim }}>{r.s}</div>
              </div>
            </div>
          ))}
        </div>

        {given.length > 0 && (
          <div style={{ background: T.cardDark, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ ...kicker, fontSize: 10, color: accent, marginBottom: 12 }}>{t("Riepilogo per il partner")}</div>
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

  // ---------- QUESTIONARIO ----------
  if (mode === 'form') {
    const cur = steps[step]
    const last = step === steps.length - 1
    const next = () => { if (last) invia(); else setStep(s => s + 1) }
    return (
      <div className="grid" style={{ gap: 18, color: T.text }}>
        <button onClick={() => (step === 0 ? setMode('detail') : setStep(s => s - 1))}
          className="flex gap" style={{ alignItems: 'center', gap: 8, alignSelf: 'start', background: 'none',
            border: 'none', color: T.dim, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
          ← Indietro
        </button>

        <div>
          <div style={{ ...kicker, fontSize: 10, color: accent }}>{t("Questionario · 3 minuti")}</div>
          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{L('title')}</div>
        </div>

        <div>
          <div style={{ fontSize: 11.5, color: T.dim, marginBottom: 6 }}>Passo {step + 1} di {steps.length}</div>
          <div className="flex gap" style={{ gap: 5 }}>
            {steps.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? T.text : T.border }} />
            ))}
          </div>
        </div>

        {cur && (
          <>
            <div style={{ ...kicker, fontSize: 10, color: accent }}>{t(cur.title)}</div>
            <div className="grid" style={{ gap: 18 }}>
              {cur.fields.map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 3 }}>{t(f.label)}</div>
                  {f.help && <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 7 }}>{t(f.help)}</div>}

                  {f.type === 'textarea' && (
                    <Textarea rows={3} value={answers[f.key] || ''} placeholder={f.placeholder ? t(f.placeholder) : undefined}
                      onChange={e => set(f.key, e.target.value)} />
                  )}
                  {f.type === 'text' && (
                    <Input value={answers[f.key] || ''} placeholder={f.placeholder ? t(f.placeholder) : undefined}
                      onChange={e => set(f.key, e.target.value)} />
                  )}
                  {f.type === 'number' && (
                    <Input type="number" value={answers[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
                  )}
                  {f.type === 'date' && (
                    <Input type="date" value={answers[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                  )}
                  {f.type === 'radio' && (
                    <div className="flex gap" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {(f.options || []).map(o => (
                        <Chip key={o} on={answers[f.key] === o} accent={accent} onClick={() => set(f.key, o)}>{t(o)}</Chip>
                      ))}
                    </div>
                  )}
                  {f.type === 'multiselect' && (
                    <div className="flex gap" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {(f.options || []).map(o => (
                        <Chip key={o} on={(answers[f.key] || []).includes(o)} accent={accent} onClick={() => toggle(f.key, o)}>{t(o)}</Chip>
                      ))}
                    </div>
                  )}
                  {f.type === 'scale' && (
                    <div className="flex gap" style={{ gap: 8 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <Chip key={n} on={answers[f.key] === n} accent={accent} onClick={() => set(f.key, n)} min={44}>{String(n)}</Chip>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <button onClick={next} disabled={busy}
          style={{ padding: '14px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: T.text, color: '#0b0b0e', fontWeight: 800, fontSize: 14 }}>
          {busy ? t('Invio…') : last ? t('Invia richiesta') : t('Continua')}
        </button>
        <div style={{ fontSize: 11.5, color: T.muted, textAlign: 'center' }}>
          Le risposte vanno solo al tuo advisor e al partner.
        </div>
      </div>
    )
  }

  // ---------- DETTAGLIO ----------
  const hasForm = canRequest && schema.length > 0
  const longDesc = L('desc_long') || L('description')
  // Per i servizi AUVI il titolo grande è il nome del servizio; il partner (es. "AUVI Studio") resta come etichetta.
  const heroName = service.category === 'AUVI Studio' ? L('title') : (service.partner_name || L('title'))
  return (
    <div className="grid" style={{ gap: 16, color: T.text }}>
      <button onClick={onBack}
        className="flex gap" style={{ alignItems: 'center', gap: 8, alignSelf: 'start', background: 'none',
          border: 'none', color: T.dim, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
        ← Tutti i servizi
      </button>

      {/* hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20,
        minHeight: service.cover_url ? 300 : 190, background: service.cover_url ? T.cardDark : tileBg(service),
        padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: '#fff' }}>
        {service.cover_url && (
          <>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${service.cover_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div style={{ position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(11,11,14,.15) 0%, rgba(11,11,14,.62) 55%, #0b0b0e 100%)' }} />
          </>
        )}
        <div style={{ position: 'relative' }}>
          <div style={{ ...kicker, fontSize: 10, opacity: .85, color: accent }}>
            {t('Servizio AUVI')} · {service.verified ? t('Partner verificato') : t('Su richiesta')}
          </div>
          {service.logo_url ? (
            <div style={{ marginTop: 12 }}>
              {service.cover_url ? (
                <img src={service.logo_url} alt={service.partner_name || ''}
                  style={{ height: 42, maxWidth: 210, objectFit: 'contain', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,.55))' }} />
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', display: 'inline-flex' }}>
                  <img src={service.logo_url} alt={service.partner_name || ''} style={{ height: 32, objectFit: 'contain' }} />
                </div>
              )}
            </div>
          ) : (!service.cover_url && (
            <div style={{ marginTop: 12, width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900,
              color: '#fff' }}>{initials(heroName)}</div>
          ))}
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1, marginTop: 12 }}>
            {heroName}
          </div>
          {service.partner_name && service.partner_name !== heroName && (
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', fontWeight: 600, marginTop: 4 }}>
              con {service.partner_name}
            </div>
          )}
          {service.hero_claim && (
            <div style={{ ...kicker, fontSize: 10.5, marginTop: 6, color: accent }}>{L('hero_claim')}</div>
          )}
        </div>
      </div>

      {longDesc && <div style={{ fontSize: 15, lineHeight: 1.55, color: T.dim }}>{longDesc}</div>}

      {service.about && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
          <div style={{ ...kicker, fontSize: 10.5, color: accent, marginBottom: 8 }}>{t("Il metodo")}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{L('about')}</div>
        </div>
      )}

      {/* citazione */}
      {service.quote && (
        <div style={{ padding: '4px 4px 4px 16px', borderLeft: `3px solid ${accent}` }}>
          <div style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.5 }}>{L('quote')}</div>
          {service.quote_by && <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>— {service.quote_by}</div>}
        </div>
      )}

      {/* pilastri a scorrimento orizzontale */}
      {(L('highlights') || service.highlights) && (L('highlights') || service.highlights).length > 0 && (
        <div className="flex gap" style={{ gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {(L('highlights') || service.highlights).map((h: any, i: number) => (
            <div key={i} style={{ flex: '0 0 75%', maxWidth: 300, background: T.card,
              border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ ...kicker, fontSize: 10, color: accent }}>{h.title}</div>
              <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>{h.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* cosa include */}
      {(L('includes') || service.includes) && (L('includes') || service.includes).length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
          <div style={{ ...kicker, fontSize: 10.5, color: accent, marginBottom: 12 }}>{t("Cosa include")}</div>
          <div className="grid" style={{ gap: 10 }}>
            {(L('includes') || service.includes).map((it: string, i: number) => (
              <div key={i} className="flex gap" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  border: `1.5px solid ${accent}`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={12} />
                </span>
                <div style={{ fontSize: 13.5, lineHeight: 1.4 }}>{it}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* nota partner + SLA */}
      {(service.partner_note || service.sla) && (
        <div style={{ background: T.cardDark, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
          {service.sla && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800,
              color: T.green, background: `${T.green}1f`, border: `1px solid ${T.green}55`,
              padding: '4px 10px', borderRadius: 999 }}>
              <Icon name="clock" size={12} /> {L('sla')}
            </span>
          )}
          {service.partner_note && (
            <div style={{ fontSize: 12, color: T.dim, marginTop: service.sla ? 10 : 0, lineHeight: 1.5 }}>{L('partner_note')}</div>
          )}
        </div>
      )}

      {/* contatti */}
      {(service.contact_email || service.contact_phone || service.partner_website) && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
          <div style={{ ...kicker, fontSize: 10.5, color: T.muted, marginBottom: 10 }}>{t("Contatti")}</div>
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
              <span className="btn btn-ghost btn-sm">
                <Icon name="smartphone" size={13} /> {service.contact_phone}
              </span>
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
            {t('Compila il questionario')}
          </button>
          <div style={{ fontSize: 11.5, color: T.muted, textAlign: 'center', marginTop: 8 }}>
            ◷ {t('circa 3 minuti · il partner costruisce il pacchetto su di te · nessun impegno')}
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
      style={{ padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
        minWidth: min, justifyContent: 'center', display: 'inline-flex', alignItems: 'center',
        border: `1px solid ${on ? accent : '#2e2e3a'}`,
        background: on ? accent : 'transparent', color: on ? '#0b0b0e' : '#c9c9d4' }}>
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
