// Foto di rappresentanza (obbligatoria) e logo personale (facoltativo) dei professionisti.
// Usato nelle pagine "Il mio profilo" di ogni figura e nella richiesta all'accesso (ProPhotoGate).
// La foto viene ritagliata quadrata e alleggerita; il logo mantiene proporzioni e trasparenza.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { toast } from '../lib/toast'
import { Modal } from './ui'
import Icon from './Icon'

export const PRO_ROLES_WITH_PROFILE = ['agente', 'assicuratore', 'commercialista', 'preparatore', 'fisioterapista', 'nutrizionista', 'wealth']
// tabella del profilo, colonna id e colonna logo per ruolo
export const PRO_PROFILE: Record<string, { table: string; idCol: string; logoCol: string }> = {
  agente: { table: 'crm_agent_profile', idCol: 'agent_id', logoCol: 'agency_logo_url' },
  assicuratore: { table: 'crm_insurer_profile', idCol: 'insurer_id', logoCol: 'agency_logo_url' },
  commercialista: { table: 'crm_tax_profile', idCol: 'advisor_id', logoCol: 'agency_logo_url' },
  preparatore: { table: 'fitness_coach_profile', idCol: 'trainer_id', logoCol: 'logo_url' },
  fisioterapista: { table: 'crm_physio_profile', idCol: 'physio_id', logoCol: 'logo_url' },
  nutrizionista: { table: 'crm_nutri_profile', idCol: 'nutri_id', logoCol: 'logo_url' },
  wealth: { table: 'crm_wealth_profile', idCol: 'advisor_id', logoCol: 'agency_logo_url' },
}

// foto: quadrata al centro, 800 px, JPEG · logo: lato lungo max 600 px, PNG (trasparenza)
async function prepare(file: File, kind: 'photo' | 'logo'): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  if (kind === 'photo') {
    const s = Math.min(bmp.width, bmp.height)
    const out = Math.min(800, s)
    c.width = out; c.height = out
    c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, out, out)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('img')), 'image/jpeg', 0.88))
  }
  const k = Math.min(1, 600 / Math.max(bmp.width, bmp.height))
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('img')), 'image/png'))
}

export async function uploadProImage(uid: string, file: File, kind: 'photo' | 'logo'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Scegli un\'immagine (JPG o PNG)')
  const blob = await prepare(file, kind).catch(() => file)
  const ext = kind === 'photo' ? 'jpg' : 'png'
  const path = `${uid}/${kind === 'photo' ? 'foto' : 'logo'}-${Date.now()}.${ext}`
  const up = await supabase.storage.from('agent-profiles').upload(path, blob, { upsert: true, contentType: kind === 'photo' ? 'image/jpeg' : 'image/png' })
  if (up.error) throw up.error
  return supabase.storage.from('agent-profiles').getPublicUrl(path).data.publicUrl
}

// Riquadro "Foto e logo" da mettere nel profilo
export function ProImages({ uid, photo, logo, onPhoto, onLogo, logoHint }: {
  uid: string; photo?: string | null; logo?: string | null
  onPhoto: (url: string) => void; onLogo: (url: string | null) => void; logoHint?: string
}) {
  const { t } = useLang()
  const pRef = useRef<HTMLInputElement>(null)
  const lRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'' | 'photo' | 'logo'>('')
  async function pick(file: File, kind: 'photo' | 'logo') {
    setBusy(kind)
    try {
      const url = await uploadProImage(uid, file, kind)
      kind === 'photo' ? onPhoto(url) : onLogo(url)
    } catch (e: any) { toast(t(e?.message || 'Caricamento non riuscito'), 'err') }
    setBusy('')
  }
  return (
    <div className="pi">
      <style>{PI_CSS}</style>
      <div className="pi-box">
        <div className="pi-ph" onClick={() => pRef.current?.click()} role="button" tabIndex={0}>
          {photo ? <img src={photo} alt="" /> : <span><Icon name="user" size={30} /></span>}
        </div>
        <div className="pi-tx">
          <div className="pi-h">{t('Foto profilo')} <span className="pi-req">{t('obbligatoria')}</span></div>
          <div className="pi-s">{t('Foto di rappresentanza: primo piano, viso ben visibile, sfondo neutro e buona luce. Niente selfie, occhiali da sole o foto di gruppo. È quella che vedono gli atleti e AUVI.')}</div>
          <button className="btn btn-sm btn-primary" disabled={busy === 'photo'} onClick={() => pRef.current?.click()}>
            <Icon name="upload" size={13} /> {busy === 'photo' ? t('Carico…') : photo ? t('Cambia foto') : t('Carica foto')}
          </button>
          <input ref={pRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f, 'photo'); e.target.value = '' }} />
        </div>
      </div>
      <div className="pi-box">
        <div className="pi-lg" onClick={() => lRef.current?.click()} role="button" tabIndex={0}>
          {logo ? <img src={logo} alt="" /> : <span><Icon name="image" size={24} /></span>}
        </div>
        <div className="pi-tx">
          <div className="pi-h">{t('Logo personale')} <span className="pi-opt">{t('facoltativo')}</span></div>
          <div className="pi-s">{t(logoHint || 'Se hai un tuo logo (studio, brand personale), caricalo: comparirà accanto al tuo nome. Meglio PNG con sfondo trasparente.')}</div>
          <div className="flex gap" style={{ gap: 6 }}>
            <button className="btn btn-sm" disabled={busy === 'logo'} onClick={() => lRef.current?.click()}>
              <Icon name="upload" size={13} /> {busy === 'logo' ? t('Carico…') : logo ? t('Cambia logo') : t('Carica logo')}
            </button>
            {logo && <button className="btn btn-sm btn-ghost" onClick={() => onLogo(null)}>{t('Togli')}</button>}
          </div>
          <input ref={lRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f, 'logo'); e.target.value = '' }} />
        </div>
      </div>
    </div>
  )
}

// All'accesso: un professionista senza foto non entra finché non la carica (AUVI/admin esclusi)
export function ProPhotoGate() {
  const { role, session, signOut } = useAuth()
  const { t } = useLang()
  const uid = session?.user.id
  const cfg = role ? PRO_PROFILE[role] : undefined
  const [need, setNeed] = useState(false)
  const [logo, setLogo] = useState<string | null>(null)

  useEffect(() => {
    if (!uid || !cfg) { setNeed(false); return }
    let ok = true
    ;(async () => {
      // chi è anche AUVI (account con più profili di prova) non viene bloccato
      const { data: roles } = await supabase.from('crm_user_roles').select('role').eq('user_id', uid)
      if ((roles || []).some((r: any) => r.role === 'admin')) return
      const { data } = await supabase.from(cfg.table).select('*').eq(cfg.idCol, uid).maybeSingle()
      if (!ok) return
      setLogo((data as any)?.[cfg.logoCol] || null)
      setNeed(!(data as any)?.photo_url)
    })()
    return () => { ok = false }
  }, [uid, cfg])

  if (!need || !uid || !cfg) return null
  async function saveField(col: string, url: string | null) {
    const { error } = await (supabase.from(cfg!.table) as any).upsert({ [cfg!.idCol]: uid, [col]: url }, { onConflict: cfg!.idCol })
    if (error) { toast(error.message, 'err'); return false }
    return true
  }
  return (
    <Modal title={t('Completa il tuo profilo')} noClose onClose={() => { /* obbligatoria: non si chiude finché manca la foto */ }}
      footer={<button className="btn btn-ghost" onClick={() => signOut()}>{t('Esci')}</button>}>
      <div className="grid" style={{ gap: 14 }}>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          {t('Per lavorare con gli atleti AUVI serve una foto profilo di rappresentanza: è come ti presenti a loro e al loro team.')}
        </div>
        <ProImages uid={uid} logo={logo}
          onPhoto={async url => { if (await saveField('photo_url', url)) { toast(t('Foto salvata: benvenuto!')); setNeed(false) } }}
          onLogo={async url => { if (await saveField(cfg.logoCol, url)) setLogo(url) }} />
      </div>
    </Modal>
  )
}

const PI_CSS = `
.pi { display: grid; gap: 12px; }
.pi-box { display: flex; gap: 14px; align-items: flex-start; padding: 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--bg-2); }
.pi-ph, .pi-lg { flex-shrink: 0; width: 84px; height: 84px; border-radius: 18px; overflow: hidden; display: grid; place-items: center; cursor: pointer; background: var(--card); border: 2px dashed var(--border); color: var(--text-dim); }
.pi-ph img { width: 100%; height: 100%; object-fit: cover; }
.pi-lg img { width: 100%; height: 100%; object-fit: contain; padding: 8px; background: #fff; }
.pi-ph:has(img), .pi-lg:has(img) { border-style: solid; }
.pi-tx { display: grid; gap: 7px; min-width: 0; justify-items: start; }
.pi-h { font-weight: 800; font-size: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pi-req { font-size: 10.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: #fff; background: var(--red, #E53F00); padding: 2px 7px; border-radius: 999px; }
.pi-opt { font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--text-dim); border: 1px solid var(--border); padding: 1px 7px; border-radius: 999px; }
.pi-s { font-size: 12.5px; color: var(--text-dim); line-height: 1.45; }
`
