import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { Spinner, Field, Input, Select, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'
import type { Player, ShippingInfo, EquipmentInfo, ClubContacts } from '../lib/types'

type Tab = 'spedizioni' | 'equipment' | 'contatti'

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }
const section: React.CSSProperties = { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--text-dim)', margin: '20px 0 12px', fontWeight: 700 }

export default function Profile() {
  const { athleteId } = useAthlete()
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('spedizioni')
  const [shipping, setShipping] = useState<ShippingInfo>({})
  const [equipment, setEquipment] = useState<EquipmentInfo>({})
  const [contacts, setContacts] = useState<ClubContacts>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    if (!athleteId) return
    setLoading(true)
    supabase.from('player').select('*').eq('api_player_id', athleteId).maybeSingle().then(({ data }) => {
      const p = data as Player | null
      setPlayer(p)
      setShipping(p?.shipping || {})
      setEquipment(p?.equipment || {})
      setContacts(p?.club_contacts || {})
      setLoading(false)
    })
  }, [athleteId])

  async function save() {
    if (!player || !athleteId) return
    setSaving(true)
    const { error } = await supabase.rpc('update_player_profile', {
      p_api: athleteId,
      p_shipping: shipping,
      p_equipment: equipment,
      p_club_contacts: contacts,
    })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2200) }
  }

  if (loading) return <Spinner />
  if (!player) return <Empty title="Nessun atleta selezionato" hint="Seleziona un atleta dal menù in alto." />

  const s = (k: keyof ShippingInfo) => shipping[k] || ''
  const e = (k: keyof EquipmentInfo) => equipment[k] || ''
  const c = (k: keyof ClubContacts) => contacts[k] || ''
  const setS = (k: keyof ShippingInfo, v: string) => setShipping({ ...shipping, [k]: v })
  const setE = (k: keyof EquipmentInfo, v: string) => setEquipment({ ...equipment, [k]: v })
  const setC = (k: keyof ClubContacts, v: string) => setContacts({ ...contacts, [k]: v })

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'spedizioni', label: 'Spedizioni', icon: 'inbox' },
    { key: 'equipment', label: 'Equipment', icon: 'ball' },
    { key: 'contatti', label: 'Contatti', icon: 'smartphone' },
  ]

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Intestazione atleta */}
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 18, marginBottom: 18 }}>
        {player.photo_url
          ? <img src={player.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} />
          : <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--border)' }} />}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{player.name}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            {[player.position, player.team_name, player.nationality].filter(Boolean).join(' · ') || 'Profilo atleta'}
          </div>
        </div>
      </div>

      {/* Contratto + link esterni */}
      {(player.contract_expiry || player.transfermarkt_url || player.instagram_url) && (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          {player.contract_expiry && (
            <div style={{ marginBottom: (player.transfermarkt_url || player.instagram_url) ? 14 : 0 }}>
              <div style={section}>Scadenza contratto</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtDate(player.contract_expiry)}</div>
            </div>
          )}
          {(player.transfermarkt_url || player.instagram_url) && (
            <>
              <div style={section}>Link esterni</div>
              <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                {player.transfermarkt_url && (
                  <a className="btn btn-sm" href={player.transfermarkt_url} target="_blank" rel="noreferrer">Transfermarkt ↗</a>
                )}
                {player.instagram_url && (
                  <a className="btn btn-sm" href={player.instagram_url} target="_blank" rel="noreferrer">Instagram ↗</a>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        {tab === 'spedizioni' && (
          <>
            <div style={section}>Indirizzo principale</div>
            <div style={grid}>
              <Field label="Paese"><Input value={s('country')} onChange={ev => setS('country', ev.target.value)} placeholder="Italia" /></Field>
              <Field label="Città"><Input value={s('city')} onChange={ev => setS('city', ev.target.value)} /></Field>
              <Field label="CAP"><Input value={s('cap')} onChange={ev => setS('cap', ev.target.value)} /></Field>
              <Field label="Indirizzo"><Input value={s('address')} onChange={ev => setS('address', ev.target.value)} /></Field>
              <Field label="Telefono"><Input value={s('phone')} onChange={ev => setS('phone', ev.target.value)} placeholder="+39…" /></Field>
              <Field label="Email"><Input value={s('email')} onChange={ev => setS('email', ev.target.value)} placeholder="email@…" /></Field>
            </div>
            <div style={section}>Persona di riferimento</div>
            <div style={grid}>
              <Field label="Nome"><Input value={s('ref_name')} onChange={ev => setS('ref_name', ev.target.value)} /></Field>
              <Field label="Relazione">
                <Select value={s('ref_relation')} onChange={ev => setS('ref_relation', ev.target.value)}>
                  <option value="">—</option>
                  <option>Moglie/Compagna</option>
                  <option>Genitore</option>
                  <option>Fratello/Sorella</option>
                  <option>Procuratore</option>
                  <option>Altro</option>
                </Select>
              </Field>
              <Field label="Telefono rif."><Input value={s('ref_phone')} onChange={ev => setS('ref_phone', ev.target.value)} placeholder="+39…" /></Field>
              <Field label="Email rif."><Input value={s('ref_email')} onChange={ev => setS('ref_email', ev.target.value)} placeholder="email@…" /></Field>
            </div>
          </>
        )}

        {tab === 'equipment' && (
          <>
            <div style={section}>Scarpe</div>
            <div style={grid}>
              <Field label="Brand"><Input value={e('shoe_brand')} onChange={ev => setE('shoe_brand', ev.target.value)} placeholder="Adidas, Nike…" /></Field>
              <Field label="Numero"><Input value={e('shoe_size')} onChange={ev => setE('shoe_size', ev.target.value)} placeholder="42 ⅔" /></Field>
              <Field label="Modello"><Input value={e('shoe_model')} onChange={ev => setE('shoe_model', ev.target.value)} /></Field>
              <Field label="Sponsor attuale"><Input value={e('shoe_sponsor')} onChange={ev => setE('shoe_sponsor', ev.target.value)} placeholder="Nome sponsor o No" /></Field>
            </div>
            <div style={section}>Guanti (portieri)</div>
            <div style={grid}>
              <Field label="Brand"><Input value={e('glove_brand')} onChange={ev => setE('glove_brand', ev.target.value)} /></Field>
              <Field label="Taglia"><Input value={e('glove_size')} onChange={ev => setE('glove_size', ev.target.value)} /></Field>
              <Field label="Modello"><Input value={e('glove_model')} onChange={ev => setE('glove_model', ev.target.value)} /></Field>
              <Field label="Sponsor"><Input value={e('glove_sponsor')} onChange={ev => setE('glove_sponsor', ev.target.value)} placeholder="Nome sponsor o No" /></Field>
            </div>
          </>
        )}

        {tab === 'contatti' && (
          <>
            <div style={section}>Team Manager</div>
            <div style={grid}>
              <Field label="Nome"><Input value={c('manager_name')} onChange={ev => setC('manager_name', ev.target.value)} /></Field>
              <Field label="Telefono"><Input value={c('manager_phone')} onChange={ev => setC('manager_phone', ev.target.value)} placeholder="+39…" /></Field>
              <Field label="Email"><Input value={c('manager_email')} onChange={ev => setC('manager_email', ev.target.value)} placeholder="email@…" /></Field>
            </div>
            <div style={section}>Addetto stampa</div>
            <div style={grid}>
              <Field label="Nome"><Input value={c('press_name')} onChange={ev => setC('press_name', ev.target.value)} /></Field>
              <Field label="Telefono"><Input value={c('press_phone')} onChange={ev => setC('press_phone', ev.target.value)} placeholder="+39…" /></Field>
              <Field label="Email"><Input value={c('press_email')} onChange={ev => setC('press_email', ev.target.value)} placeholder="email@…" /></Field>
            </div>
            <div style={section}>Media Officer</div>
            <div style={grid}>
              <Field label="Nome"><Input value={c('media_name')} onChange={ev => setC('media_name', ev.target.value)} /></Field>
              <Field label="Telefono"><Input value={c('media_phone')} onChange={ev => setC('media_phone', ev.target.value)} placeholder="+39…" /></Field>
              <Field label="Email"><Input value={c('media_email')} onChange={ev => setC('media_email', ev.target.value)} placeholder="email@…" /></Field>
            </div>
            <div style={section}>Segreteria club</div>
            <div style={grid}>
              <Field label="Telefono"><Input value={c('secretary_phone')} onChange={ev => setC('secretary_phone', ev.target.value)} placeholder="+39…" /></Field>
              <Field label="Email"><Input value={c('secretary_email')} onChange={ev => setC('secretary_email', ev.target.value)} placeholder="email@…" /></Field>
            </div>
            <div style={section}>Link materiali club</div>
            <div style={grid}>
              <Field label="Link accesso materiali"><Input value={c('materials_link')} onChange={ev => setC('materials_link', ev.target.value)} placeholder="https://drive.google.com/…" /></Field>
              <Field label="Username"><Input value={c('materials_username')} onChange={ev => setC('materials_username', ev.target.value)} /></Field>
              <Field label="Password">
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input type={showPw ? 'text' : 'password'} value={c('materials_password')} onChange={ev => setC('materials_password', ev.target.value)} autoComplete="off" style={{ flex: 1 }} />
                  <button type="button" className="btn btn-sm" onClick={() => setShowPw(v => !v)}>{showPw ? 'Nascondi' : 'Mostra'}</button>
                </div>
              </Field>
            </div>
          </>
        )}

        <div className="flex gap" style={{ marginTop: 22, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Salvo…' : 'Salva'}
          </button>
          {saved && <span className="faint" style={{ color: 'var(--green, #35c26b)', fontSize: 13 }}>Salvato ✓</span>}
        </div>
      </div>
    </div>
  )
}
