import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAthlete } from '../../lib/athlete'
import { useLang } from '../../lib/i18n'
import { initials } from '../../lib/format'

// Referenti dell'atleta in una riga scorrevole: un tocco apre la chat dedicata.
// Stessa fonte dati di ReferentiCard (procuratore, assicuratore, commercialista, preparatore).
type Ref = { key: string; label: string; name: string; photo?: string | null }

export default function HomeContacts({ goto, title }: { goto: (r: string) => void; title: string }) {
  const { athleteId } = useAthlete()
  const { t } = useLang()
  const [refs, setRefs] = useState<Ref[]>([])

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
      if (ag) out.push({ key: 'agente', label: 'Procuratore', name: ag.name || 'Procuratore', photo: ag.photo_url })
      if (ins) out.push({ key: 'assicuratore', label: 'Assicuratore', name: ins.name || 'Assicuratore', photo: ins.photo_url })
      if (tx) out.push({ key: 'commercialista', label: 'Commercialista', name: tx.name || 'Commercialista', photo: tx.photo_url })
      if (tr) out.push({ key: 'fitness', label: 'Preparatore', name: tr.name || 'Preparatore', photo: tr.photo_url })
      if (ok) setRefs(out)
    })()
    return () => { ok = false }
  }, [athleteId])

  if (refs.length === 0) return null

  const open = (key: string) => {
    try { sessionStorage.setItem('chat_channel', key) } catch { /* no-op */ }
    goto('messages')
  }

  return (
    <section className="home-sec">
      <div className="home-h">{title}</div>
      <div className="home-contacts">
        {refs.map(r => (
          <button key={r.key} className="home-contact" onClick={() => open(r.key)} aria-label={`${t('Scrivi a')} ${r.name}`}>
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
    </section>
  )
}
