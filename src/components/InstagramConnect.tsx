// "Collega Instagram": l'atleta tocca, accede a Instagram, autorizza ed è fatto.
// I numeri (follower, engagement, reach, pubblico) si aggiornano da soli ogni notte.
// IgAppSetup: AUVI inserisce una volta l'app Instagram (App ID e Secret) e copia il Redirect URI.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { useRouteParam } from '../lib/route'
import { fmtDateTime } from '../lib/format'
import { Field, Input } from './ui'
import Icon from './Icon'

export const IG_REDIRECT = 'https://irdphiphumxsymttvfzq.supabase.co/functions/v1/ig-oauth-callback'
const IG_SCOPES = 'instagram_business_basic,instagram_business_manage_insights'

type Status = {
  connected: boolean; auth_type: string | null; username: string | null
  last_sync_at: string | null; last_sync_status: string | null; last_sync_error: string | null
  token_expires_at: string | null; followers: number | null; engagement: number | null; reach: number | null
}

export function InstagramConnect({ athleteId, onSynced }: { athleteId: number; onSynced?: () => void }) {
  const { t, lang } = useLang()
  const { role, isAdmin } = useAuth()
  const [st, setSt] = useState<Status | null>(null)
  const [busy, setBusy] = useState<'' | 'connect' | 'sync' | 'off'>('')
  const igParam = useRouteParam('ig')
  const msgParam = useRouteParam('msg')
  const canManage = role === 'player' || isAdmin || role === 'creator' || role === 'agente'
  const num = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString(lang === 'en' ? 'en-GB' : 'it-IT')

  async function load() {
    const { data } = await supabase.rpc('crm_ig_status', { p_player: athleteId })
    setSt((data as Status) || null)
  }
  useEffect(() => { load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ritorno da Instagram: #/commercial?tab=profilo&ig=ok|error&msg=…
  useEffect(() => {
    if (igParam === 'ok') { toast(t('Instagram collegato!')); load(); onSynced?.() }
    else if (igParam === 'error') toast(`${t('Collegamento non riuscito')}: ${t(msgParam || '')}`, 'err')
    if (igParam) history.replaceState(null, '', location.pathname + '#/commercial?tab=profilo')
  }, [igParam]) // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setBusy('connect')
    const { data, error } = await supabase.rpc('crm_ig_oauth_start', { p_player: athleteId })
    if (error) { setBusy(''); toast(t(error.message), 'err'); return }
    const { state, app_id } = data as { state: string; app_id: string }
    const q = new URLSearchParams({
      enable_fb_login: '0', force_authentication: '1', client_id: app_id, redirect_uri: IG_REDIRECT,
      response_type: 'code', scope: IG_SCOPES, state,
    })
    window.location.href = `https://www.instagram.com/oauth/authorize?${q}`
  }
  async function syncNow() {
    setBusy('sync')
    const { data, error } = await supabase.functions.invoke('sync-instagram', { body: { player_id: athleteId } })
    setBusy('')
    const r = data?.results?.[0]
    if (error || !r?.ok) { toast(t('Aggiornamento non riuscito') + (r?.error ? `: ${r.error}` : ''), 'err'); load(); return }
    toast(t('Numeri Instagram aggiornati')); load(); onSynced?.()
  }
  async function disconnect() {
    if (!confirm(t('Scollegare Instagram? I numeri restano, ma non si aggiornano più da soli.'))) return
    setBusy('off')
    const { error } = await supabase.rpc('crm_ig_disconnect', { p_player: athleteId })
    setBusy('')
    if (error) { toast(t(error.message), 'err'); return }
    load()
  }

  if (!st) return null
  const live = st.connected

  return (
    <div className="card ig-card">
      <style>{IG_CSS}</style>
      <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
        <span className="ig-logo"><Icon name="instagram" size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {live ? <>Instagram {st.username && <span className="ig-user">@{st.username}</span>}</> : t('Collega il tuo Instagram')}
          </div>
          <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            {live
              ? (st.last_sync_at
                  ? <>{st.last_sync_status === 'error' ? <span style={{ color: 'var(--red)' }}>{t('Ultimo aggiornamento non riuscito')}</span> : <span className="ig-live">● {t('Collegato e attivo')}</span>} · {t('aggiornato {date}').replace('{date}', fmtDateTime(st.last_sync_at))}</>
                  : t('Collegato: il primo aggiornamento è in corso.'))
              : t('Un tocco e i tuoi numeri (follower, engagement, pubblico) restano sempre aggiornati nel profilo commerciale e nel Media Kit.')}
          </div>
        </div>
      </div>

      {live && (
        <div className="ig-stats">
          <div><b>{num(st.followers)}</b><span>{t('Follower')}</span></div>
          <div><b>{st.engagement != null ? `${st.engagement}%` : '—'}</b><span>{t('Engagement')}</span></div>
          <div><b>{num(st.reach)}</b><span>{t('Reach media/post')}</span></div>
        </div>
      )}
      {live && st.last_sync_status === 'error' && st.last_sync_error && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>{st.last_sync_error}</div>
      )}

      {canManage && (
        live ? (
          <div className="flex gap" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={!!busy} onClick={syncNow}>
              <Icon name="rotate-ccw" size={13} /> {busy === 'sync' ? t('Aggiorno…') : t('Aggiorna ora')}
            </button>
            {st.auth_type === 'instagram_login' && (
              <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={connect}>{t('Ricollega')}</button>
            )}
            <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={disconnect} style={{ marginLeft: 'auto' }}>{t('Scollega')}</button>
          </div>
        ) : (
          <>
            <button className="ig-btn" disabled={!!busy} onClick={connect}>
              <Icon name="instagram" size={18} /> {busy === 'connect' ? t('Apro Instagram…') : t('Collega Instagram')}
            </button>
            <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
              {t('Serve un profilo professionale (Business o Creator): su Instagram vai in Impostazioni › Tipo di account e strumenti › Passa a un account professionale. È gratis e non cambia nulla per chi ti segue.')}
            </div>
          </>
        )
      )}
    </div>
  )
}

// AUVI: configurazione una tantum dell'app Instagram
export function IgAppSetup() {
  const { t } = useLang()
  const [st, setSt] = useState<{ app_id: string | null; has_secret: boolean } | null>(null)
  const [appId, setAppId] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [guide, setGuide] = useState(false)
  async function load() {
    const { data } = await supabase.rpc('crm_ig_app_status')
    setSt(data as any); setAppId((data as any)?.app_id || '')
  }
  useEffect(() => { load() }, [])
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('crm_set_ig_app', { p_app_id: appId, p_secret: secret })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    setSecret(''); toast(t('App Instagram salvata')); load()
  }
  if (!st) return null
  const ready = !!st.app_id && st.has_secret
  return (
    <div className="card">
      <div className="flex between" style={{ alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>{t('App Instagram di AUVI')}</div>
        <span style={{ fontSize: 12, fontWeight: 800, color: ready ? 'var(--green)' : 'var(--gold)' }}>
          {ready ? t('Pronta: gli atleti possono collegarsi') : t('Da configurare')}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        {t('Si fa una volta sola: poi ogni atleta collega il suo Instagram con il pulsante "Collega Instagram", senza Pagina Facebook.')}
      </div>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => setGuide(!guide)}>
        {guide ? t('Nascondi la guida') : t('Come creo l\'app Instagram?')}
      </button>
      {guide && (
        <ol className="muted" style={{ fontSize: 12.5, lineHeight: 1.8, margin: '0 0 14px', paddingLeft: 18 }}>
          <li>{t('Vai su developers.facebook.com › Le mie app › Crea app, tipo "Business".')}</li>
          <li>{t('Aggiungi il prodotto "Instagram" e scegli "API setup with Instagram login".')}</li>
          <li>{t('In "Set up Instagram business login" › Business login settings, incolla questo Redirect URI:')}<br />
            <code style={{ userSelect: 'all', fontSize: 11.5 }}>{IG_REDIRECT}</code></li>
          <li>{t('Copia "Instagram app ID" e "Instagram app secret" (non quelli dell\'app Facebook) e incollali qui sotto.')}</li>
          <li>{t('In App roles › Roles › Instagram Testers aggiungi l\'Instagram di ogni atleta: l\'atleta accetta l\'invito da Instagram (Impostazioni › App e siti web › Inviti). Così non serve la revisione di Meta.')}</li>
        </ol>
      )}
      <div className="row2">
        <Field label={t('Instagram app ID')}><Input value={appId} onChange={e => setAppId(e.target.value.trim())} placeholder="1234567890" /></Field>
        <Field label={st.has_secret ? t('Instagram app secret (salvato: lascia vuoto per non cambiarlo)') : t('Instagram app secret')}>
          <Input type="password" value={secret} onChange={e => setSecret(e.target.value.trim())} autoComplete="off" /></Field>
      </div>
      <button className="btn btn-primary" disabled={busy || (!appId && !secret)} onClick={save}>{busy ? t('Salvo…') : t('Salva')}</button>
    </div>
  )
}

const IG_CSS = `
.ig-card { display: grid; gap: 12px; }
.ig-logo { width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; color: #fff;
  background: radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%); }
.ig-user { font-weight: 700; color: var(--text-dim); margin-left: 4px; }
.ig-live { color: var(--green); font-weight: 700; }
.ig-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px 16px; border: 0; border-radius: 14px; cursor: pointer;
  font-weight: 800; font-size: 15px; color: #fff; background: linear-gradient(90deg, #f58529, #dd2a7b 45%, #8134af 75%, #515bd4); }
.ig-btn:disabled { opacity: .6; cursor: default; }
.ig-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ig-stats div { background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; display: grid; gap: 2px; }
.ig-stats b { font-size: 18px; font-weight: 900; }
.ig-stats span { font-size: 11.5px; color: var(--text-dim); }
`
