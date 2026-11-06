import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { goto } from '../lib/route'
import Icon from '../components/Icon'
import { fmtMoney } from '../lib/format'
import { dealMoney } from './Sponsors'
import type { Sponsor } from '../lib/types'

/* In cima a Business › Valore: quanto rendono gli accordi, con un tocco verso Accordi. */

export type VetrinaData = { earned: number; incoming: number; active: number }

export function VetrinaCard({ v, onDeals }: { v: VetrinaData; onDeals: () => void }) {
  const { t } = useLang()
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <style>{V_CSS}</style>
      <button className="vt-money" onClick={onDeals}>
        <div>
          <div className="vt-l">{t('Incassato {y}').replace('{y}', String(new Date().getFullYear()))}</div>
          <div className="vt-m">{fmtMoney(v.earned)}</div>
        </div>
        <div>
          <div className="vt-l">{t('In arrivo')}</div>
          <div className="vt-m">{fmtMoney(v.incoming)}</div>
        </div>
        <div className="vt-go">{t('{n} accordi attivi').replace('{n}', String(v.active))} <Icon name="chevron-right" size={14} /></div>
      </button>
    </div>
  )
}

export default function Vetrina({ athleteId }: { athleteId: number }) {
  const [v, setV] = useState<VetrinaData | null>(null)
  useEffect(() => {
    let off = false
    supabase.from('crm_sponsors').select('*').eq('player_id', athleteId).then(({ data }) => {
      if (off) return
      const deals = (data as Sponsor[]) || []
      const m = dealMoney(deals)
      setV({ earned: m.earned, incoming: m.incoming, active: deals.filter(d => d.status === 'active').length })
    })
    return () => { off = true }
  }, [athleteId])
  if (!v) return null
  return <VetrinaCard v={v} onDeals={() => goto('sponsors')} />
}

const V_CSS = `
.vt-l{font-size:11.5px;color:var(--text-faint);display:flex;align-items:center;gap:5px}
.vt-money{display:flex;align-items:center;gap:22px;width:100%;padding:14px 18px;border:0;background:var(--surface);font:inherit;color:inherit;text-align:left;cursor:pointer}
.vt-m{font-family:var(--font-display);font-size:18px;font-weight:800;margin-top:2px}
.vt-go{margin-left:auto;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:4px}
@media (max-width:600px){.vt-money{flex-wrap:wrap;gap:14px}.vt-go{width:100%;margin-left:0}}
`
