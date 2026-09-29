import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAthlete } from '../../lib/athlete'
import { useLang } from '../../lib/i18n'
import { initials } from '../../lib/format'
import { telUrl, whatsappUrl, mailUrl } from '../../lib/ics'
import { Modal } from '../../components/ui'
import Icon from '../../components/Icon'

// Referenti dell'atleta in una riga scorrevole: un tocco apre il PROFILO del
// referente (chi è, studio/agenzia, contatti diretti); la chat è un'azione dentro il profilo.
// Stessa fonte dati di ReferentiCard (procuratore, assicuratore, commercialista, preparatore).
type Ref = {
  key: string; label: string; name: string; photo?: string | null
  title?: string | null; org?: string | null; orgLogo?: string | null; website?: string | null
  email?: string | null; phone?: string | null; whatsapp?: string | null
  facts: { k: string; v: string }[]; bio?: string | null
}

// Profili diversi per ruolo → una forma unica da mostrare
function normalize(key: string, label: string, p: any): Ref {
  if (key === 'fitness') {
    const c = p.contacts || {}
    const facts = [
      p.experience && { k: 'Esperienza', v: p.experience },
      p.teams && { k: 'Squadre', v: p.teams },
      p.certifications && { k: 'Certificazioni', v: p.certifications },
      p.education && { k: 'Formazione', v: p.education },
    ].filter(Boolean) as { k: string; v: string }[]
    return {
      key, label, name: p.name || label, photo: p.photo_url, title: p.headline,
      website: c.website, email: c.email, phone: c.phone, whatsapp: c.whatsapp,
      facts, bio: [p.bio_method, p.bio_philosophy].filter(Boolean).join('\n\n') || null,
    }
  }
  const facts = [
    p.licence && { k: 'Licenza / albo', v: p.licence },
    p.agency_address && { k: 'Sede', v: p.agency_address },
    p.agency_founded && { k: 'Fondata', v: p.agency_founded },
  ].filter(Boolean) as { k: string; v: string }[]
  return {
    key, label, name: p.name || label, photo: p.photo_url, title: p.title,
    org: p.agency_name, orgLogo: p.agency_logo_url, website: p.agency_website,
    email: p.email || p.agency_email, phone: p.phone || p.agency_phone, whatsapp: p.whatsapp,
    facts, bio: null,
  }
}

export default function HomeContacts({ goto, title }: { goto: (r: string) => void; title: string }) {
  const { athleteId } = useAthlete()
  const { t } = useLang()
  const [refs, setRefs] = useState<Ref[]>([])
  const [openRef, setOpenRef] = useState<Ref | null>(null)

  useEffect(() => {
    if (!athleteId) { setRefs([]); return }
    let ok = true
    ;(async () => {
      const pick = async (link: string, idCol: string, profile: string, profCol: string) => {
        const { data: l } = await supabase.from(link).select(idCol).eq('player_id', athleteId).limit(1).maybeSingle()
        const id = (l as any)?.[idCol]
        if (!id) return null
        const { data: p } = await supabase.from(profile).select('*').eq(profCol, id).maybeSingle()
        return p as any
      }
      const [ag, ins, tx, tr] = await Promise.all([
        pick('crm_agent_athletes', 'agent_id', 'crm_agent_profile', 'agent_id'),
        pick('crm_insurer_athletes', 'insurer_id', 'crm_insurer_profile', 'insurer_id'),
        pick('crm_tax_athletes', 'advisor_id', 'crm_tax_profile', 'advisor_id'),
        pick('fitness_trainer_athletes', 'trainer_id', 'fitness_coach_profile', 'trainer_id'),
      ])
      const out: Ref[] = []
      if (ag) out.push(normalize('agente', 'Procuratore', ag))
      if (ins) out.push(normalize('assicuratore', 'Assicuratore', ins))
      if (tx) out.push(normalize('commercialista', 'Commercialista', tx))
      if (tr) out.push(normalize('fitness', 'Preparatore', tr))
      if (ok) setRefs(out)
    })()
    return () => { ok = false }
  }, [athleteId])

  if (refs.length === 0) return null

  const chat = (key: string) => {
    try { sessionStorage.setItem('chat_channel', key) } catch { /* no-op */ }
    goto('messages')
  }

  return (
    <section className="home-sec">
      <div className="home-h">{title}</div>
      <div className="home-contacts">
        {refs.map(r => (
          <button key={r.key} className="home-contact" onClick={() => setOpenRef(r)} aria-label={`${t('Profilo di')} ${r.name}`}>
            {r.photo
              ? <img src={r.photo} alt="" className="home-contact-av" />
              : <span className="home-contact-av home-contact-ini">{initials(r.name)}</span>}
            <span style={{ minWidth: 0 }}>
              <span className="home-contact-n home-trunc">{r.name}</span>
              <span className="home-contact-r home-trunc">{t(r.label)}</span>
            </span>
          </button>
        ))}
      </div>
      {openRef && <RefProfile r={openRef} onClose={() => setOpenRef(null)} onChat={() => { setOpenRef(null); chat(openRef.key) }} />}
    </section>
  )
}

function RefProfile({ r, onClose, onChat }: { r: Ref; onClose: () => void; onChat: () => void }) {
  const { t } = useLang()
  const wa = r.whatsapp ? (/^https?:/i.test(r.whatsapp) ? r.whatsapp : whatsappUrl(r.whatsapp)) : r.phone ? whatsappUrl(r.phone) : null
  const site = r.website ? (/^https?:/i.test(r.website) ? r.website : `https://${r.website}`) : null
  return (
    <Modal title={t('Profilo')} onClose={onClose} dismissable
      footer={<button className="btn btn-primary" style={{ width: '100%' }} onClick={onChat}><Icon name="message" size={15} /> {t('Scrivi in chat')}</button>}>
      <div className="ref-prof">
        <div className="ref-prof-head">
          {r.photo
            ? <img src={r.photo} alt="" className="ref-prof-av" />
            : <span className="ref-prof-av ref-prof-ini">{initials(r.name)}</span>}
          <div style={{ minWidth: 0 }}>
            <div className="ref-prof-name">{r.name}</div>
            <div className="ref-prof-role">{[t(r.label), r.title].filter(Boolean).join(' · ')}</div>
            {r.org && (
              <div className="ref-prof-org">
                {r.orgLogo && <img src={r.orgLogo} alt="" />}
                <span>{r.org}</span>
              </div>
            )}
          </div>
        </div>

        {(r.phone || wa || r.email || site) && (
          <div className="quick-actions" style={{ marginTop: 16 }}>
            {r.phone && <a className="qa" href={telUrl(r.phone)}><span className="qa-ico"><Icon name="smartphone" size={15} /></span>{t('Chiama')}</a>}
            {wa && <a className="qa" href={wa} target="_blank" rel="noreferrer"><span className="qa-ico"><Icon name="message" size={15} /></span>WhatsApp</a>}
            {r.email && <a className="qa" href={mailUrl(r.email)}><span className="qa-ico"><Icon name="mail" size={15} /></span>Email</a>}
            {site && <a className="qa" href={site} target="_blank" rel="noreferrer"><span className="qa-ico"><Icon name="layers" size={15} /></span>{t('Sito')}</a>}
          </div>
        )}

        {r.facts.length > 0 && (
          <dl className="ref-prof-facts">
            {r.facts.map(f => <div key={f.k}><dt>{t(f.k)}</dt><dd>{f.v}</dd></div>)}
          </dl>
        )}
        {r.bio && <p className="ref-prof-bio">{r.bio}</p>}
      </div>
    </Modal>
  )
}
