// Scheda del professionista (sola lettura) aperta da "Il mio team".
// Legge il profilo dalla tabella del suo ruolo: le RLS fanno vedere all'atleta i profili
// dei SUOI professionisti (e tutto ad AUVI). Le note interne non si mostrano.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { initials } from '../lib/format'
import { Modal, Spinner } from './ui'
import Icon from './Icon'

type Field = [col: string, label: string]
type Cfg = { table: string; idCol: string; title: string; about: Field[]; place: Field[]; links: Field[]; logo?: string }

const CFG: Record<string, Cfg> = {
  agente: {
    table: 'crm_agent_profile', idCol: 'agent_id', title: 'title', logo: 'agency_logo_url',
    about: [['licence', 'Licenza'], ['agency_founded', 'Agenzia fondata nel']],
    place: [['agency_name', 'Agenzia'], ['agency_address', 'Sede'], ['agency_email', 'Email agenzia'], ['agency_phone', 'Telefono agenzia']],
    links: [['agency_website', 'Sito web'], ['agency_transfermarkt', 'Transfermarkt'], ['agency_instagram', 'Instagram'], ['agency_linkedin', 'LinkedIn']],
  },
  assicuratore: {
    table: 'crm_insurer_profile', idCol: 'insurer_id', title: 'title', logo: 'agency_logo_url',
    about: [['licence', 'Iscrizione / Licenza']],
    place: [['agency_name', 'Agenzia'], ['agency_address', 'Sede'], ['agency_email', 'Email agenzia'], ['agency_phone', 'Telefono agenzia']],
    links: [['agency_website', 'Sito web']],
  },
  commercialista: {
    table: 'crm_tax_profile', idCol: 'advisor_id', title: 'title', logo: 'agency_logo_url',
    about: [['licence', 'Iscrizione / Licenza']],
    place: [['agency_name', 'Studio'], ['agency_address', 'Sede'], ['agency_email', 'Email studio'], ['agency_phone', 'Telefono studio']],
    links: [['agency_website', 'Sito web']],
  },
  preparatore: {
    table: 'fitness_coach_profile', idCol: 'trainer_id', title: 'headline', logo: 'logo_url',
    about: [['experience', 'Esperienza'], ['bio_method', 'Metodo'], ['bio_philosophy', 'Filosofia'], ['education', 'Formazione'],
      ['certifications', 'Certificazioni'], ['teams', 'Squadre'], ['specializations', 'Specializzazioni'], ['services', 'Servizi'], ['availability', 'Disponibilità']],
    place: [], links: [],
  },
  fisioterapista: {
    table: 'crm_physio_profile', idCol: 'physio_id', title: 'title', logo: 'logo_url',
    about: [['bio', 'Presentazione'], ['years_experience', 'Anni di esperienza'], ['experience_desc', 'Esperienza'], ['clubs', 'Club professionistici'],
      ['national_teams', 'Nazionali'], ['degree', 'Laurea'], ['masters', 'Master / Specializzazioni post-laurea'], ['certifications', 'Certificazioni'],
      ['sports', 'Sport'], ['body_areas', 'Aree del corpo'], ['pathologies', 'Patologie'], ['techniques', 'Tecniche'], ['methods', 'Metodi di trattamento'],
      ['licence', 'Albo / Iscrizione'], ['languages', 'Lingue']],
    place: [['clinic_name', 'Studio'], ['clinic_address', 'Indirizzo'], ['city', 'Città'], ['clinic_facilities', 'Strutture disponibili'],
      ['availability', 'Disponibilità'], ['working_days', 'Giorni lavorativi'], ['working_hours', 'Orari']],
    links: [['website', 'Sito web']],
  },
  nutrizionista: {
    table: 'crm_nutri_profile', idCol: 'nutri_id', title: 'title', logo: 'logo_url',
    about: [['bio', 'Presentazione'], ['specialties', 'Specializzazioni'], ['clubs', 'Club e atleti seguiti'], ['years_experience', 'Anni di esperienza'],
      ['licence', 'Albo / Iscrizione'], ['languages', 'Lingue']],
    place: [['city', 'Città']],
    links: [['website', 'Sito web']],
  },
}

// testo leggibile anche dai campi jsonb (elenchi del preparatore)
function text(v: any): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(x => (typeof x === 'object' ? x?.name || x?.label || x?.title || '' : String(x))).filter(Boolean).join(' · ')
  if (typeof v === 'object') return ''
  return String(v).trim()
}
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^@/, 'instagram.com/'))

export default function ProProfileModal({ role, proId, roleLabel, fallback, onClose }: {
  role: string; proId: string; roleLabel: string
  fallback: { name: string | null; title: string | null; photo_url: string | null; email: string | null; phone: string | null; whatsapp: string | null }
  onClose: () => void
}) {
  const { t } = useLang()
  const cfg = CFG[role]
  const [p, setP] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(!!cfg)

  useEffect(() => {
    if (!cfg) return
    supabase.from(cfg.table).select('*').eq(cfg.idCol, proId).maybeSingle()
      .then(({ data }) => { setP((data as any) || {}); setLoading(false) })
  }, [cfg, proId])

  const d: Record<string, any> = { ...fallback, ...(p || {}) }
  const contacts = role === 'preparatore' ? (p?.contacts || {}) : {}
  const email = d.email || contacts.email
  const phone = d.phone || contacts.phone
  const whatsapp = d.whatsapp || contacts.whatsapp
  const name = d.name || fallback.name
  const title = (cfg && text(d[cfg.title])) || fallback.title
  const logo = cfg?.logo ? d[cfg.logo] : null
  const rows = (fields: Field[]) => fields.map(([c, l]) => [l, text(d[c])] as const).filter(([, v]) => v)
  const about = cfg ? rows(cfg.about) : []
  const place = cfg ? rows(cfg.place) : []
  const links = [
    ...(cfg ? cfg.links.map(([c, l]) => [l, text(d[c])] as const).filter(([, v]) => v) : []),
    ...(['instagram', 'linkedin', 'website'] as const).map(k => [k === 'website' ? 'Sito web' : k === 'instagram' ? 'Instagram' : 'LinkedIn', text(contacts[k])] as const).filter(([, v]) => v),
  ]

  return (
    <Modal title={t(roleLabel)} onClose={onClose}>
      {loading ? <Spinner /> : (
        <div className="grid" style={{ gap: 16 }}>
          <div className="flex gap" style={{ alignItems: 'center', gap: 14 }}>
            {d.photo_url
              ? <img src={d.photo_url} alt={name || ''} style={{ width: 72, height: 72, borderRadius: 18, objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 72, height: 72, borderRadius: 18, flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 24, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>{initials(name)}</div>}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -.3 }}>{name || '—'}</div>
              {title && <div className="faint" style={{ fontSize: 13.5, marginTop: 2 }}>{title}</div>}
              {d.verified && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}><Icon name="check" size={12} /> {t('Profilo verificato')}</div>}
            </div>
            {logo && <img src={logo} alt="" style={{ height: 40, maxWidth: 90, objectFit: 'contain', flexShrink: 0 }} />}
          </div>

          {(email || phone || whatsapp) && (
            <div className="flex gap" style={{ gap: 8, flexWrap: 'wrap' }}>
              {email && <a className="btn btn-sm" href={`mailto:${email}`}><Icon name="mail" size={13} /> {email}</a>}
              {phone && <a className="btn btn-sm" href={`tel:${String(phone).replace(/\s/g, '')}`}><Icon name="smartphone" size={13} /> {phone}</a>}
              {whatsapp && <a className="btn btn-sm" href={`https://wa.me/${String(whatsapp).replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"><Icon name="message" size={13} /> WhatsApp</a>}
            </div>
          )}

          {about.length > 0 && <Section title={t('Profilo professionale')} rows={about} />}
          {place.length > 0 && <Section title={role === 'fisioterapista' ? t('Studio / Clinica') : role === 'nutrizionista' ? t('Dove lavora') : t('Agenzia')} rows={place} />}
          {links.length > 0 && (
            <div className="flex gap" style={{ gap: 8, flexWrap: 'wrap' }}>
              {links.map(([l, v]) => <a key={l} className="btn btn-sm btn-ghost" href={href(v)} target="_blank" rel="noreferrer">{t(l)} ↗</a>)}
            </div>
          )}
          {about.length === 0 && place.length === 0 && (
            <div className="faint" style={{ fontSize: 13 }}>{t('Il professionista non ha ancora completato il suo profilo.')}</div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Section({ title, rows }: { title: string; rows: (readonly [string, string])[] }) {
  const { t } = useLang()
  return (
    <div className="grid" style={{ gap: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-dim)' }}>{title}</div>
      {rows.map(([l, v]) => (
        <div key={l}>
          <div className="faint" style={{ fontSize: 11.5, fontWeight: 700 }}>{t(l)}</div>
          <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v}</div>
        </div>
      ))}
    </div>
  )
}
