import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAthlete } from '../../lib/athlete'
import { useLang } from '../../lib/i18n'
import Icon from '../../components/Icon'

// Servizi AUVI in Home: UN solo blocco, una copertina che invita ad aprire e scoprire.
// Non si sceglie un servizio da qui (se no gli altri non si vedono): un tocco apre la pagina
// Servizi AUVI con tutto il catalogo. Sulla copertina solo un assaggio: i loghi dei partner,
// quanti servizi ci sono e, se c'è, la richiesta già in corso.

export default function HomeServices({ goto }: { goto: (r: string) => void }) {
  const { athleteId } = useAthlete()
  const { t } = useLang()
  const [count, setCount] = useState(0)
  const [logos, setLogos] = useState<string[]>([])
  const [open, setOpen] = useState(0)
  // sfondo: foto in bianco e nero sotto il velo nero, come gli altri blocchi scuri della Home (CSS)

  useEffect(() => {
    let ok = true
    ;(async () => {
      const [sv, rq] = await Promise.all([
        supabase.from('crm_services_public').select('id, logo_url, verified').order('sort'),
        athleteId
          ? supabase.from('crm_service_requests').select('id', { count: 'exact', head: true })
              .eq('player_id', athleteId).in('status', ['aperta', 'in_carico'])
          : Promise.resolve({ count: 0 }),
      ])
      if (!ok) return
      const list = (sv.data as { id: string; logo_url: string | null; verified: boolean }[]) || []
      setCount(list.length)
      setLogos([...new Set(list.filter(s => s.verified && s.logo_url).map(s => s.logo_url!))].slice(0, 4))
      setOpen((rq as { count: number | null }).count || 0)
    })()
    return () => { ok = false }
  }, [athleteId])

  return (
    <section className="home-sec">
      <button className="home-svc-hero" onClick={() => goto('services')} aria-label={t('Scopri i Servizi AUVI')}>
        <span className="home-svc-in">
          <span className="home-svc-top">
            <span className="home-svc-k">{t('Servizi AUVI')}</span>
            {open > 0 && (
              <span className="home-svc-live">
                <span className="home-svc-dot" />
                {(open === 1 ? t('1 richiesta in corso') : t('{n} richieste in corso')).replace('{n}', String(open))}
              </span>
            )}
          </span>
          <span className="home-svc-t">{t('Dentro e fuori dal campo')}</span>
          <span className="home-svc-s">{t('Preparazione, recupero, consulenze, viaggi, famiglia: scopri cosa possiamo fare per te.')}</span>
          <span className="home-svc-foot">
            {logos.length > 0 && (
              <span className="home-svc-logos" aria-hidden="true">
                {logos.map(l => <span key={l} className="home-svc-lg"><img src={l} alt="" /></span>)}
              </span>
            )}
            <span className="home-svc-cta">
              {t('Scopri i servizi')}
              <Icon name="chevron-right" size={16} strokeWidth={2.2} />
            </span>
          </span>
        </span>
      </button>
    </section>
  )
}
