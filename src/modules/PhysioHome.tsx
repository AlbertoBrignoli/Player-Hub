import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'

// Home del fisioterapista: la sua scheda e gli atleti seguiti.
// Stessi componenti/pattern degli altri ruoli professionali.
const ACCENT = '#3E8E9E'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

export default function PhysioHome({ goto }: { goto?: (r: string) => void }) {
  const { session } = useAuth()
  const { athletes, setAthleteId } = useAthlete()
  const [me, setMe] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const uid = session?.user.id

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      const { data } = await supabase.from('crm_physio_profile').select('*').eq('physio_id', uid).maybeSingle()
      if (!ok) return
      setMe(data || {})
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid])

  if (loading) return <Spinner />

  const complete = !!(me?.name && me?.title)

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* --- scheda personale --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div className="flex gap" style={{ alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
          {me?.photo_url
            ? <img src={me.photo_url} alt="" style={{ width: 58, height: 58, borderRadius: 15, objectFit: 'cover' }} />
            : <div style={{ width: 58, height: 58, borderRadius: 15, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#111' }}>
                {(me?.name || 'F').slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...kicker, color: ACCENT }}>Fisioterapista</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.3, marginTop: 2 }}>
              {me?.name || 'Benvenuto'}
            </div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              {me?.title || 'Completa il tuo profilo per iniziare'}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => goto?.('physio-profile')}>
            <Icon name="user" size={13} /> {complete ? 'Il mio profilo' : 'Completa il profilo'}
          </button>
        </div>
      </div>

      {/* --- atleti seguiti --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Atleti seguiti</div></div>
        {athletes.length === 0 ? (
          <Empty icon={<Icon name="users" size={30} strokeWidth={1.4} />}
            title="Nessun atleta collegato"
            hint="Chiedi ad AUVI di collegarti agli atleti che segui." />
        ) : (
          <div className="grid g2" style={{ gap: 10 }}>
            {athletes.map(a => (
              <button key={a.api_player_id} className="card" style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => { setAthleteId(a.api_player_id); goto?.('performance') }}>
                <div style={{ fontWeight: 700 }}>{a.name || 'Atleta'}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
