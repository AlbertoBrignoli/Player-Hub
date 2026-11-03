import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAthlete } from '../../lib/athlete'
import { useLang } from '../../lib/i18n'
import Icon from '../../components/Icon'
import type { Service } from '../../components/ServiceDetail'

// Servizi AUVI in Home: prima le richieste in corso (con il loro stato), poi alcuni servizi
// in evidenza da aprire con un tocco. Tutto il resto è nella pagina Servizi AUVI.
type Req = { id: string; service_title: string | null; status: string; created_at: string }

const STATUS: Record<string, { l: string; c: string }> = {
  aperta: { l: 'Inviata', c: 'var(--gold)' },
  in_carico: { l: 'In lavorazione', c: 'var(--blue)' },
}

const svcField = (s: any, f: string, lang: string) => (lang === 'en' && s?.i18n?.en?.[f] != null) ? s.i18n.en[f] : s?.[f]

export default function HomeServices({ goto }: { goto: (r: string) => void }) {
  const { athleteId } = useAthlete()
  const { t, lang } = useLang()
  const [reqs, setReqs] = useState<Req[]>([])
  const [featured, setFeatured] = useState<Service[]>([])

  useEffect(() => {
    let ok = true
    ;(async () => {
      const [sv, rq] = await Promise.all([
        supabase.from('crm_services_public').select('*').eq('verified', true).order('sort').limit(12),
        athleteId
          ? supabase.from('crm_service_requests').select('id, service_title, status, created_at')
              .eq('player_id', athleteId).in('status', ['aperta', 'in_carico']).order('created_at', { ascending: false }).limit(3)
          : Promise.resolve({ data: [] as Req[] }),
      ])
      if (!ok) return
      // AUVI Studio ha già la sua vetrina nella pagina Servizi: qui i partner
      setFeatured(((sv.data as Service[]) || []).filter(s => s.category !== 'AUVI Studio').slice(0, 4))
      setReqs((rq.data as Req[]) || [])
    })()
    return () => { ok = false }
  }, [athleteId])

  if (!featured.length && !reqs.length) return null

  return (
    <section className="home-sec">
      <div className="home-h">
        {t('Servizi AUVI')}
        <button className="home-h-link" onClick={() => goto('services')}>{t('Vedi tutti')} →</button>
      </div>
      {reqs.length > 0 && (
        <div className="home-card" style={{ marginBottom: 10 }}>
          {reqs.map(r => {
            const s = STATUS[r.status] || STATUS.aperta
            return (
              <button key={r.id} className="home-svc-req" onClick={() => goto(`services?req=${r.id}`)}>
                <span className="home-svc-dot" style={{ background: s.c }} />
                <span className="home-trunc" style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{r.service_title || t('Richiesta')}</span>
                <span className="t-meta" style={{ flexShrink: 0 }}>{t(s.l)}</span>
                <Icon name="chevron-right" size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}
      {featured.length > 0 && (
        <div className="home-svc-grid">
          {featured.map(s => (
            <button key={s.id} className="home-svc" onClick={() => goto(`services?service=${s.id}`)}>
              <span className="home-svc-cover" style={{ background: s.cover_url ? undefined : `oklch(0.3 0.07 ${s.hue ?? 250})` }}>
                {s.cover_url && <img src={s.cover_url} alt="" className="home-svc-img" />}
                {s.logo_url
                  ? <span className="home-svc-logo"><img src={s.logo_url} alt="" /></span>
                  : <span className="home-svc-logo" style={{ color: 'var(--ink)' }}><Icon name={s.icon || 'star'} size={16} /></span>}
              </span>
              <span className="home-svc-body">
                <span className="home-trunc" style={{ fontWeight: 700 }}>{svcField(s, 'title', lang)}</span>
                <span className="t-meta home-trunc">{s.partner_name || t(s.category)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
