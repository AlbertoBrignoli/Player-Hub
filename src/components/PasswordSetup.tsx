import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Modal, Field, Input } from './ui'
import { useLang } from '../lib/i18n'

// Al primo accesso (via link email) il giocatore non ha ancora una password.
// Mostra un pop-up per impostarla subito. Non appare a chi ce l'ha già
// (metadato password_set = true, impostato al salvataggio e in backfill sul DB).
export default function PasswordSetup() {
  const { session } = useAuth()
  const { t } = useLang()
  const alreadySet = session?.user?.user_metadata?.password_set === true
  const [dismissed, setDismissed] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!session || alreadySet || dismissed) return null

  async function save() {
    setErr('')
    if (pw.length < 8) { setErr(t('La password deve avere almeno 8 caratteri.')); return }
    if (pw !== pw2) { setErr(t('Le due password non coincidono.')); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw, data: { password_set: true } })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDismissed(true)
  }

  return (
    <Modal
      title={t('Imposta la tua password')}
      onClose={() => setDismissed(true)}
      footer={
        <>
          <button className="btn" onClick={() => setDismissed(true)}>{t('Più tardi')}</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? t('Salvo…') : t('Salva password')}</button>
        </>
      }
    >
      <p className="faint" style={{ marginTop: 0 }}>
        {t('Benvenuto! Imposta una password: dal prossimo accesso entrerai con email e password, senza dover chiedere ogni volta il link via email.')}
      </p>
      <Field label={t('Nuova password')}>
        <Input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder={t('Minimo 8 caratteri')} autoComplete="new-password" />
      </Field>
      <Field label={t('Conferma password')}>
        <Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" />
      </Field>
      {err && <div className="msg-err" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}
