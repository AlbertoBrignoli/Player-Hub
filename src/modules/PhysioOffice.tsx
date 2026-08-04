import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'

// Il mio ufficio del fisioterapista: gli atleti collegati e lo spazio di lavoro clinico.
// Sezione privata del fisio (atleti da crm_physio_athletes).
const ACCENT = '#3E8E9E'
const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800 }

type Ath = { player_id: number; name: string }

export default function PhysioOffice({ goto }: { goto?: (r: string) => void }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [athletes, setAthletes] = useState<Ath[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      const { data: links } = await supabase.from('crm_physio_athletes').select('player_id').eq('physio_id', uid)
      const ids = (links || []).map((l: any) => l.player_id)
      let list: Ath[] = []
      if (ids.length) {
        const { data: pl } = await supabase.from('player').select('api_player_id, name').in('api_player_id', ids)
        list = (pl || []).map((p: any) => ({ player_id: p.api_player_id, name: p.name || `Atleta ${p.api_player_id}` }))
      }
      if (!ok) return
      setAthletes(list)
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid])

  if (loading) return <Spinner />

  const tools = [
    { icon: 'clipboard', t: 'Valutazione iniziale', s: 'Anamnesi, dolore, ROM, forza, test funzionali' },
    { icon: 'activity', t: 'Trattamenti', s: 'Sedute, tecniche, feedback e progressi' },
    { icon: 'dumbbell', t: 'Esercizi', s: 'Programmi assegnati con serie, ripetizioni, video' },
    { icon: 'check', t: 'Return to Play', s: 'Checklist di rientro e approvazioni' },
  ]

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* --- intestazione --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>Il mio ufficio</div>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.3, marginTop: 2 }}>Spazio clinico</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>Gli atleti che segui e i loro percorsi.</div>
      </div>

      {/* --- atleti seguiti --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Atleti seguiti</div></div>
        {athletes.length === 0 ? (
          <Empty icon={<Icon name="users" size={30} strokeWidth={1.4} />}
            title="Nessun atleta collegato"
            hint="Vai in Collegamenti e inserisci il codice fornito da AUVI per collegarti a un atleta." />
        ) : (
          <div className="grid g2" style={{ gap: 10 }}>
            {athletes.map(a => (
              <div key={a.player_id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#111' }}>
                  {(a.name || 'A').slice(0, 1)}
                </div>
                <div style={{ fontWeight: 700 }}>{a.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- spazio di lavoro clinico --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Spazio di lavoro clinico</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {tools.map(x => (
            <div key={x.t} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(62,142,158,.15)', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <Icon name={x.icon} size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{x.t}</div>
                <div className="faint" style={{ fontSize: 12 }}>{x.s}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          Gli strumenti clinici (valutazioni, trattamenti, esercizi, return to play) vengono attivati per ogni atleta collegato.
        </div>
      </div>
    </div>
  )
}
