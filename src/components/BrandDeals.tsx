// Vetrina › Brand: convenzioni con i brand partner (es. CiaoGym).
// L'atleta tocca "Attiva il mio codice": il codice compare, si copia da solo e con
// "Vai allo shop" apre il sito del brand, dove lo incolla nel carrello.
// AUVI crea e modifica le convenzioni, imposta il codice generale o quello personale
// dell'atleta e vede chi l'ha attivato e quante volte ha aperto lo shop.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { Modal, Field, Input, Textarea, Spinner, Empty } from './ui'
import Icon from './Icon'
import { useGiftOffers, giftRoute, isExpired } from './BrandGifting'
import { goto } from '../lib/route'

type Deal = {
  id: string; brand_name: string; tagline: string | null; description: string | null
  discount_label: string | null; shop_url: string; logo_url: string | null; cover_url: string | null
  accent_color: string | null; terms: string | null; i18n: any; active: boolean; sort: number; has_code: boolean
}
type Act = { deal_id: string; player_id: number; activated_at: string; shop_opens: number }

const tx = (d: Deal, f: 'tagline' | 'description' | 'terms', lang: string): string | null =>
  (lang === 'en' && d.i18n?.en?.[f]) || d[f]

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

// compact: dentro "Tutti" della vetrina, solo titolo e card (niente se non ci sono brand)
export default function BrandDeals({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useLang()
  const { role, isAdmin } = useAuth()
  const { athleteId, athletes } = useAthlete()
  const [deals, setDeals] = useState<Deal[]>([])
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [acts, setActs] = useState<Act[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [edit, setEdit] = useState<Partial<Deal> | null>(null)
  // gifting dedicato: lo vedono solo i giocatori destinatari e AUVI (RLS)
  const gifts = useGiftOffers()
  const giftFor = (d: Deal) => gifts.find(g => g.deal_id === d.id && g.active)

  // chi può attivare per l'atleta: l'atleta stesso, AUVI, creator e procuratore
  const canActivate = !!athleteId && (role === 'player' || isAdmin || role === 'creator' || role === 'agente')

  async function load() {
    const [d, c, a, l] = await Promise.all([
      supabase.from('crm_brand_deals_public').select('*').order('sort'),
      athleteId ? supabase.rpc('crm_brand_deal_codes_for', { p_player: athleteId }) : Promise.resolve({ data: [] as any[] }),
      isAdmin ? supabase.from('crm_brand_deal_activations').select('deal_id, player_id, activated_at, shop_opens') : Promise.resolve({ data: [] as any[] }),
      athleteId ? supabase.rpc('crm_brand_deal_labels_for', { p_player: athleteId }) : Promise.resolve({ data: [] as any[] }),
    ])
    setDeals((d.data as Deal[]) || [])
    // sconto personale dell'atleta (es. -15%): solo nel badge, la convenzione resta quella generale
    const own: Record<string, string> = {}
    for (const r of ((l as any).data || []) as { deal_id: string; discount_label: string }[]) own[r.deal_id] = r.discount_label
    setLabels(own)
    const m: Record<string, string> = {}
    for (const r of ((c as any).data || []) as { deal_id: string; code: string }[]) if (r.code) m[r.deal_id] = r.code
    setCodes(m)
    setActs(((a as any).data as Act[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [athleteId, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function activate(d: Deal) {
    if (!athleteId) return
    setBusy(d.id)
    const { data, error } = await supabase.rpc('crm_activate_brand_deal', { p_deal: d.id, p_player: athleteId })
    setBusy('')
    if (error) { toast(t(error.message), 'err'); return }
    const code = String(data)
    setCodes(c => ({ ...c, [d.id]: code }))
    toast(await copy(code) ? t('Codice attivato e copiato!') : t('Codice attivato!'))
  }

  function openShop(d: Deal) {
    const code = codes[d.id]
    if (code) copy(code)   // niente await: su iPhone l'apertura deve restare legata al tocco
    window.open(d.shop_url, '_blank', 'noopener')
    if (athleteId && code) supabase.rpc('crm_brand_deal_opened', { p_deal: d.id, p_player: athleteId }).then(() => {})
  }

  if (loading) return compact ? null : <Spinner />
  if (compact && deals.length === 0) return null

  const nameOf = (pid: number) => athletes.find(a => a.api_player_id === pid)?.name || `#${pid}`

  return (
    <div className="grid" style={{ gap: 16 }}>
      <style>{BD_CSS}</style>
      {compact && <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 800 }}>Brand</div>}
      {!compact && <div className="bd-intro">
        <div className="bd-steps">
          <span><b>1</b> {t('Attiva il codice')}</span>
          <span><b>2</b> {t('Si copia da solo')}</span>
          <span><b>3</b> {t('Incollalo nel carrello dello shop')}</span>
        </div>
        {isAdmin && (
          <button className="btn btn-sm" onClick={() => setEdit({ active: true, sort: deals.length + 1, i18n: {} })}>
            <Icon name="plus" size={13} /> {t('Nuovo brand')}
          </button>
        )}
      </div>}

      {!compact && deals.length === 0 && (
        <div className="card"><Empty icon={<Icon name="tag" size={30} strokeWidth={1.4} />} title={t('Nessun brand per ora')}
          hint={t('Qui troverai le convenzioni con i brand partner di AUVI.')} /></div>
      )}

      <div className="grid g2" style={{ gap: 14 }}>
        {deals.map(d => {
          const code = codes[d.id]
          const dActs = acts.filter(a => a.deal_id === d.id)
          const gift = giftFor(d)
          return (
            <div key={d.id} className="bd-card" style={{ opacity: d.active ? 1 : 0.55 }}>
              <a className="bd-cover" href={d.shop_url} target="_blank" rel="noopener noreferrer"
                onClick={e => { e.preventDefault(); if (gift) goto(giftRoute(gift.id)); else openShop(d) }} style={{ background: d.accent_color || '#111' }}>
                {d.cover_url && <div className="bd-img" style={{ backgroundImage: `url(${d.cover_url})` }} />}
                <div className="bd-shade" />
                {(labels[d.id] || d.discount_label) && <div className="bd-badge">{labels[d.id] || d.discount_label}</div>}
                <div className="bd-head">
                  {d.logo_url
                    ? <img src={d.logo_url} alt={d.brand_name} className="bd-logo" />
                    : <div className="bd-name">{d.brand_name}</div>}
                  {tx(d, 'tagline', lang) && <div className="bd-tag">{tx(d, 'tagline', lang)}</div>}
                </div>
                <span className="bd-go">{gift ? t('Gifting dedicato') + ' →' : t('Vai allo shop') + ' ↗'}</span>
              </a>

              <div className="bd-body">
                {gift && (
                  <button className="bd-gift" onClick={() => goto(giftRoute(gift.id))}>
                    <span className="bd-gift-k">{isExpired(gift) ? t('Offerta scaduta') : isAdmin ? t('Riservato ai destinatari') : t('Riservato a te')}</span>
                    <span className="bd-gift-t">{t(gift.title)}</span>
                    <span className="bd-gift-s">{t('Scopri la selezione, scegli i capi e indica le taglie')} →</span>
                  </button>
                )}
                {tx(d, 'description', lang) && <div className="bd-desc">{tx(d, 'description', lang)}</div>}

                {code ? (
                  <>
                    <button className="bd-code" onClick={async () => { if (await copy(code)) toast(t('Codice copiato')) }}>
                      <span className="bd-code-l">{t('Il tuo codice sconto')}</span>
                      <span className="bd-code-v">{code}</span>
                      <span className="bd-code-c"><Icon name="copy" size={14} /> {t('Copia')}</span>
                    </button>
                    <button className="btn btn-primary bd-cta" onClick={() => openShop(d)}>
                      {t('Vai allo shop')} ↗
                    </button>
                  </>
                ) : canActivate ? (
                  <button className="btn btn-primary bd-cta" disabled={busy === d.id || !d.has_code} onClick={() => activate(d)}>
                    <Icon name="tag" size={15} /> {busy === d.id ? t('Attivo…') : d.has_code ? t('Attiva il mio codice') : t('Codice in arrivo')}
                  </button>
                ) : null}
                {!code && (
                  <a className="btn bd-cta" href={d.shop_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => { e.preventDefault(); openShop(d) }}>
                    {t('Vedi lo shop')} ↗ <span className="bd-url">{d.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                  </a>
                )}

                {tx(d, 'terms', lang) && <div className="bd-terms">{tx(d, 'terms', lang)}</div>}

                {isAdmin && (
                  <div className="bd-admin">
                    <span>
                      {d.has_code ? '' : t('Manca il codice') + ' · '}
                      {t('{n} attivazioni').replace('{n}', String(dActs.length))}
                      {dActs.length > 0 && ` · ${t('{n} aperture shop').replace('{n}', String(dActs.reduce((s, a) => s + a.shop_opens, 0)))}`}
                    </span>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEdit(d)}><Icon name="edit" size={13} /> {t('Gestisci')}</button>
                  </div>
                )}
                {isAdmin && dActs.length > 0 && (
                  <div className="bd-acts">
                    {dActs.map(a => <span key={a.player_id}>{nameOf(a.player_id)} · {a.shop_opens}×</span>)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {edit && <DealEditor deal={edit} athleteId={athleteId} athleteName={athleteId ? nameOf(athleteId) : null}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

// --- scheda di gestione (solo AUVI) ---
function DealEditor({ deal, athleteId, athleteName, onClose, onSaved }: {
  deal: Partial<Deal>; athleteId: number | null; athleteName: string | null; onClose: () => void; onSaved: () => void
}) {
  const { t } = useLang()
  const { session } = useAuth()
  const [f, setF] = useState<Record<string, any>>({
    brand_name: deal.brand_name || '', discount_label: deal.discount_label || '', shop_url: deal.shop_url || '',
    tagline: deal.tagline || '', description: deal.description || '', terms: deal.terms || '',
    logo_url: deal.logo_url || '', cover_url: deal.cover_url || '', accent_color: deal.accent_color || '',
    active: deal.active ?? true, sort: deal.sort ?? 0,
    en_tagline: deal.i18n?.en?.tagline || '', en_description: deal.i18n?.en?.description || '', en_terms: deal.i18n?.en?.terms || '',
    code: '',
  })
  const [personal, setPersonal] = useState('')
  const [saving, setSaving] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))

  // codice generale e personale attuali (solo AUVI li legge dalla tabella)
  useEffect(() => {
    if (!deal.id) return
    supabase.from('crm_brand_deals').select('code').eq('id', deal.id).maybeSingle()
      .then(({ data }) => set('code', (data as any)?.code || ''))
    if (athleteId) supabase.from('crm_brand_deal_codes').select('code').eq('deal_id', deal.id).eq('player_id', athleteId).maybeSingle()
      .then(({ data }) => setPersonal((data as any)?.code || ''))
  }, [deal.id, athleteId])

  async function upload(file: File, kind: 'logo' | 'cover') {
    const uid = session?.user.id
    if (!uid) return
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${uid}/brand-${kind}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('agent-profiles').upload(path, file, { upsert: true, contentType: file.type })
    if (up.error) { toast(up.error.message, 'err'); return }
    set(kind === 'logo' ? 'logo_url' : 'cover_url', supabase.storage.from('agent-profiles').getPublicUrl(path).data.publicUrl)
  }

  async function save() {
    if (!f.brand_name.trim() || !f.shop_url.trim()) { toast(t('Servono nome del brand e link dello shop'), 'err'); return }
    setSaving(true)
    const row: Record<string, any> = {
      brand_name: f.brand_name.trim(), discount_label: f.discount_label.trim() || null,
      shop_url: /^https?:\/\//i.test(f.shop_url.trim()) ? f.shop_url.trim() : 'https://' + f.shop_url.trim(),
      tagline: f.tagline.trim() || null, description: f.description.trim() || null, terms: f.terms.trim() || null,
      logo_url: f.logo_url.trim() || null, cover_url: f.cover_url.trim() || null, accent_color: f.accent_color.trim() || null,
      active: !!f.active, sort: Number(f.sort) || 0, code: f.code.trim() || null,
      i18n: { en: { tagline: f.en_tagline.trim() || undefined, description: f.en_description.trim() || undefined, terms: f.en_terms.trim() || undefined } },
    }
    const q = deal.id
      ? supabase.from('crm_brand_deals').update(row).eq('id', deal.id).select('id').single()
      : supabase.from('crm_brand_deals').insert(row).select('id').single()
    const { data, error } = await q
    if (error) { setSaving(false); toast(error.message, 'err'); return }
    const id = (data as any).id
    if (athleteId) {
      const r = personal.trim()
        ? await supabase.from('crm_brand_deal_codes').upsert({ deal_id: id, player_id: athleteId, code: personal.trim() })
        : await supabase.from('crm_brand_deal_codes').delete().eq('deal_id', id).eq('player_id', athleteId)
      if (r.error) { setSaving(false); toast(r.error.message, 'err'); return }
    }
    setSaving(false)
    toast(t('Salvato'))
    onSaved()
  }

  async function remove() {
    if (!deal.id || !confirm(t('Eliminare questo brand dalla vetrina?'))) return
    const { error } = await supabase.from('crm_brand_deals').delete().eq('id', deal.id)
    if (error) { toast(error.message, 'err'); return }
    onSaved()
  }

  return (
    <Modal title={deal.id ? deal.brand_name || t('Brand') : t('Nuovo brand')} onClose={onClose} wide
      footer={<>
        {deal.id && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={remove}>{t('Elimina')}</button>}
        <button className="btn" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? t('Salvo…') : t('Salva')}</button>
      </>}>
      <div className="grid g2" style={{ gap: 12 }}>
        <Field label={t('Brand')}><Input value={f.brand_name} onChange={e => set('brand_name', e.target.value)} placeholder="CiaoGym" /></Field>
        <Field label={t('Sconto (etichetta)')}><Input value={f.discount_label} onChange={e => set('discount_label', e.target.value)} placeholder="-20%" /></Field>
        <Field label={t('Codice sconto per tutti gli atleti')}><Input value={f.code} onChange={e => set('code', e.target.value)} placeholder="AUVI20" style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase' }} /></Field>
        <Field label={athleteName ? t('Codice personale di {name} (facoltativo)').replace('{name}', athleteName) : t('Codice personale (scegli un atleta)')}>
          <Input value={personal} disabled={!athleteId} onChange={e => setPersonal(e.target.value)} placeholder="BRIGNOLI15" style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase' }} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('Link dello shop')}><Input value={f.shop_url} onChange={e => set('shop_url', e.target.value)} placeholder="https://…" /></Field>
        </div>
        <Field label={t('Frase breve')}><Input value={f.tagline} onChange={e => set('tagline', e.target.value)} /></Field>
        <Field label={t('Frase breve (inglese)')}><Input value={f.en_tagline} onChange={e => set('en_tagline', e.target.value)} /></Field>
        <Field label={t('Descrizione')}><Textarea rows={3} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
        <Field label={t('Descrizione (inglese)')}><Textarea rows={3} value={f.en_description} onChange={e => set('en_description', e.target.value)} /></Field>
        <Field label={t('Condizioni')}><Input value={f.terms} onChange={e => set('terms', e.target.value)} placeholder={t('Es. valido fino al 31/12, escluso outlet')} /></Field>
        <Field label={t('Condizioni (inglese)')}><Input value={f.en_terms} onChange={e => set('en_terms', e.target.value)} /></Field>
        <Field label={t('Logo (chiaro, va sopra la foto)')}>
          <div className="flex gap" style={{ gap: 6 }}>
            <Input value={f.logo_url} onChange={e => set('logo_url', e.target.value)} placeholder="https://…" />
            <button className="btn btn-sm" onClick={() => logoRef.current?.click()}><Icon name="upload" size={13} /></button>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={e => { const x = e.target.files?.[0]; if (x) upload(x, 'logo'); e.target.value = '' }} />
          </div>
        </Field>
        <Field label={t('Foto di copertina')}>
          <div className="flex gap" style={{ gap: 6 }}>
            <Input value={f.cover_url} onChange={e => set('cover_url', e.target.value)} placeholder="https://…" />
            <button className="btn btn-sm" onClick={() => coverRef.current?.click()}><Icon name="upload" size={13} /></button>
            <input ref={coverRef} type="file" accept="image/*" hidden onChange={e => { const x = e.target.files?.[0]; if (x) upload(x, 'cover'); e.target.value = '' }} />
          </div>
        </Field>
        <Field label={t('Ordine')}><Input type="number" value={f.sort} onChange={e => set('sort', e.target.value)} /></Field>
        <label className="flex gap" style={{ alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, alignSelf: 'end', paddingBottom: 10 }}>
          <input type="checkbox" checked={!!f.active} onChange={e => set('active', e.target.checked)} /> {t('Visibile agli atleti')}
        </label>
      </div>
    </Modal>
  )
}

const BD_CSS = `
.bd-intro { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.bd-steps { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--text-dim); font-weight: 600; }
.bd-steps span { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
.bd-steps b { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: var(--text); color: var(--bg, #fff); font-size: 10.5px; }
.bd-card { border: 1px solid var(--border); border-radius: 20px; overflow: hidden; background: var(--surface); display: flex; flex-direction: column; }
.bd-cover { position: relative; height: 230px; display: block; cursor: pointer; text-decoration: none; }
.bd-cover:hover .bd-img { transform: scale(1.03); }
.bd-img { transition: transform .4s ease; }
.bd-go { position: absolute; top: 12px; left: 12px; background: rgba(0,0,0,.55); color: #fff; font-size: 12px; font-weight: 800; padding: 6px 11px; border-radius: 999px; backdrop-filter: blur(6px); }
.bd-url { font-weight: 600; opacity: .6; font-size: 12.5px; margin-left: 6px; }
a.bd-cta { text-decoration: none; display: inline-flex; align-items: center; }
.bd-img { position: absolute; inset: 0; background-size: cover; background-position: center 28%; }
.bd-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.05) 30%, rgba(0,0,0,.78) 100%); }
.bd-badge { position: absolute; top: 12px; right: 12px; background: var(--yellow, #F5D400); color: #111; font-weight: 900; font-size: 15px; padding: 6px 12px; border-radius: 999px; letter-spacing: -.2px; }
.bd-head { position: absolute; left: 16px; right: 16px; bottom: 14px; color: #fff; display: grid; gap: 6px; }
.bd-logo { height: 26px; max-width: 60%; object-fit: contain; object-position: left; }
.bd-name { font-size: 24px; font-weight: 900; letter-spacing: -.5px; }
.bd-tag { font-size: 13px; opacity: .9; }
.bd-body { padding: 14px 16px 16px; display: grid; gap: 12px; }
.bd-gift { display: grid; gap: 3px; text-align: left; cursor: pointer; padding: 14px; border-radius: 14px; border: 0; background: #111; color: #fff; }
.bd-gift-k { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; color: var(--yellow, #F5D400); }
.bd-gift-t { font-size: 17px; font-weight: 900; letter-spacing: -.3px; }
.bd-gift-s { font-size: 12.5px; opacity: .8; font-weight: 600; }
.bd-desc { font-size: 13.5px; line-height: 1.5; color: var(--text-dim); }
.bd-cta { width: 100%; justify-content: center; padding: 13px 16px; font-size: 15px; }
.bd-code { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 10px; text-align: left; cursor: pointer; padding: 12px 14px; border-radius: 14px; border: 2px dashed var(--text); background: var(--bg-2); color: var(--text); animation: bdIn .35s ease; }
.bd-code-l { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 800; color: var(--text-dim); grid-column: 1; }
.bd-code-v { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 22px; font-weight: 900; letter-spacing: 1.5px; grid-column: 1; overflow-wrap: anywhere; }
.bd-code-c { grid-column: 2; grid-row: 1 / span 2; display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 800; }
.bd-terms { font-size: 11.5px; color: var(--text-faint, var(--text-dim)); }
.bd-admin { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid var(--border); padding-top: 10px; font-size: 12px; color: var(--text-dim); }
.bd-acts { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11.5px; }
.bd-acts span { padding: 3px 8px; border-radius: 999px; background: var(--bg-2); border: 1px solid var(--border); }
@keyframes bdIn { from { transform: scale(.96); opacity: 0 } to { transform: none; opacity: 1 } }
`
