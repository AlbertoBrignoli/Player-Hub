// Finestra "Presentazione AUVI": scegli le foto dalla sezione Media dell'atleta, completa i due
// testi scritti a mano (carriera e momento storico) e scarica il PDF nel template AUVI.
// Le scelte restano salvate nel profilo commerciale (content.mk) per la volta successiva.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useLang } from '../lib/i18n'
import { renderMediaKitDeck, type DeckStory } from '../lib/mediaKitDeck'
import { Modal, Field, Input, Textarea, Spinner } from './ui'
import Icon from './Icon'

type Media = { id: string; storage_path: string; folder: string | null }
type Slot = 'hero' | 'profile' | 'social' | 'story' | 'final'
const SLOTS: { key: Slot; label: string; hint: string }[] = [
  { key: 'hero', label: 'Foto a tutta pagina', hint: 'Orizzontale, d\'impatto' },
  { key: 'profile', label: 'Foto del profilo', hint: 'Verticale, figura intera' },
  { key: 'social', label: 'Foto profilo social', hint: 'Diventa in bianco e nero' },
  { key: 'story', label: 'Foto del momento storico', hint: 'Facoltativa' },
  { key: 'final', label: 'Foto finale', hint: 'Orizzontale' },
]
const PAGE = 24

export default function MediaKitDeckDialog({ player, prof, saveProf, lang, teaser, onClose }: {
  player: any; prof: any; saveProf: (p: any) => Promise<any>; lang: 'it' | 'en'; teaser: boolean; onClose: () => void
}) {
  const { t } = useLang()
  const mk = prof?.content?.mk || {}
  const [media, setMedia] = useState<Media[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState<Record<Slot, string | null>>({ hero: null, profile: null, social: null, story: null, final: null, ...(mk.photos || {}) })
  const [picking, setPicking] = useState<Slot | null>(null)
  const [bio, setBio] = useState<string>(mk.bio ?? defaultBio(player, prof, lang))
  const [story, setStory] = useState<DeckStory>(mk.story || {})
  const [withStory, setWithStory] = useState<boolean>(mk.withStory ?? !!(mk.story?.text))
  const [busy, setBusy] = useState('')

  async function loadPage(from: number) {
    const { data } = await supabase.from('crm_media').select('id, storage_path, folder')
      .eq('player_id', player.api_player_id).eq('kind', 'foto').neq('status', 'rifiutata')
      .order('created_at', { ascending: false }).range(from, from + PAGE - 1)
    const list = (data as Media[]) || []
    setMore(list.length === PAGE)
    const paths = list.map(m => m.storage_path).filter(p => !urls[p])
    if (paths.length) {
      const { data: s } = await supabase.storage.from('crm-media').createSignedUrls(paths, 3600)
      const m: Record<string, string> = {}
      for (const r of s || []) if (r.path && r.signedUrl) m[r.path] = r.signedUrl
      setUrls(u => ({ ...u, ...m }))
    }
    setMedia(prev => from === 0 ? list : [...prev, ...list])
    return list
  }
  useEffect(() => {
    (async () => {
      const first = await loadPage(0)
      // proposta automatica per gli spazi vuoti: le foto più recenti, tutte diverse
      setPhotos(p => {
        const used = new Set(Object.values(p).filter(Boolean))
        const free = first.map(m => m.storage_path).filter(x => !used.has(x))
        const n = { ...p }
        for (const k of ['hero', 'profile', 'social', 'final', 'story'] as Slot[]) if (!n[k] && free.length) n[k] = free.shift()!
        return n
      })
      // firma anche le foto già scelte in passato (fuori dalla prima pagina)
      const saved = Object.values(mk.photos || {}).filter(Boolean) as string[]
      if (saved.length) {
        const { data: s } = await supabase.storage.from('crm-media').createSignedUrls(saved, 3600)
        const m: Record<string, string> = {}
        for (const r of s || []) if (r.path && r.signedUrl) m[r.path] = r.signedUrl
        setUrls(u => ({ ...u, ...m }))
      }
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(t('Preparo…'))
    try {
      await saveProf({ content: { ...(prof?.content || {}), mk: { photos, bio, story, withStory } } })
      // firme fresche per le foto scelte
      const chosen = Object.values(photos).filter(Boolean) as string[]
      const { data: s } = await supabase.storage.from('crm-media').createSignedUrls(chosen, 600)
      const u: Record<string, string> = {}
      for (const r of s || []) if (r.path && r.signedUrl) u[r.path] = r.signedUrl
      const pick = (k: Slot) => (photos[k] ? u[photos[k]!] || null : null) || (k === 'profile' ? player.photo_url : null)
      const ident = prof?.identity || {}
      await renderMediaKitDeck({
        lang, teaser, name: player.name, birthDate: player.birth_date, nationality: player.nationality, bio,
        instagram: player.instagram_url, values: ident.values, style: ident.style, interests: ident.interests,
        followers: player.instagram_followers, er: player.instagram_engagement, reach: player.instagram_reach,
        connected: !!player.instagram_connected, lastSync: prof?.audience?.last_synced_at || null,
        story: withStory ? story : null,
        photos: { hero: pick('hero'), profile: pick('profile'), social: pick('social'), story: pick('story'), final: pick('final') },
      }, `Presentazione_${(player.name || 'atleta').replace(/\s+/g, '_')}_AUVI${teaser ? '_teaser' : ''}_${lang}.pdf`,
      (n, tot) => setBusy(t('Slide {n} di {tot}…').replace('{n}', String(n)).replace('{tot}', String(tot))))
      toast(t('Presentazione scaricata'))
      onClose()
    } catch (e: any) {
      toast(e?.message || t('Generazione non riuscita'), 'err')
    } finally { setBusy('') }
  }

  if (picking) {
    return (
      <Modal title={t(SLOTS.find(s => s.key === picking)!.label)} onClose={() => setPicking(null)} wide>
        <div className="mkd-pick">
          {media.map(m => (
            <button key={m.id} className={photos[picking] === m.storage_path ? 'on' : ''}
              style={{ backgroundImage: urls[m.storage_path] ? `url(${urls[m.storage_path]})` : undefined }}
              onClick={() => { setPhotos(p => ({ ...p, [picking]: m.storage_path })); setPicking(null) }} title={m.folder || ''} />
          ))}
        </div>
        {more && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn" onClick={() => loadPage(media.length)}>{t('Mostra altre foto')}</button></div>}
        {picking === 'story' && <div style={{ textAlign: 'center', marginTop: 8 }}><button className="btn btn-ghost" onClick={() => { setPhotos(p => ({ ...p, story: null })); setPicking(null) }}>{t('Nessuna foto')}</button></div>}
        <style>{CSS}</style>
      </Modal>
    )
  }

  return (
    <Modal title={t('Presentazione AUVI')} onClose={onClose} wide
      footer={<>
        <button className="btn" onClick={onClose} disabled={!!busy}>{t('Annulla')}</button>
        <button className="btn btn-primary" onClick={generate} disabled={!!busy || loading}><Icon name="download" size={14} /> {busy || t('Scarica la presentazione')}</button>
      </>}>
      <style>{CSS}</style>
      {loading ? <Spinner /> : (
        <div className="grid" style={{ gap: 16 }}>
          <div className="faint" style={{ fontSize: 13 }}>{t('12 slide nel formato AUVI: le pagine dell\'agenzia restano fisse, quelle dell\'atleta si riempiono con dati e foto del Player Hub.')}</div>
          <div>
            <div className="mkd-h">{t('Foto (dalla sezione Media)')}</div>
            <div className="mkd-slots">
              {SLOTS.map(s => {
                const p = photos[s.key]
                return (
                  <button key={s.key} className="mkd-slot" onClick={() => setPicking(s.key)}>
                    <span className="mkd-img" style={{ backgroundImage: p && urls[p] ? `url(${urls[p]})` : undefined, filter: s.key === 'social' ? 'grayscale(1)' : undefined }}>
                      {!p && <Icon name="image" size={20} />}
                    </span>
                    <b>{t(s.label)}</b><span>{t(s.hint)}</span>
                  </button>
                )
              })}
            </div>
            {media.length === 0 && <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>{t('Nessuna foto nella sezione Media: verrà usata la foto del profilo.')}</div>}
          </div>
          <Field label={t('Profilo (carriera in poche righe)')}>
            <Textarea rows={6} value={bio} onChange={e => setBio(e.target.value)} />
          </Field>
          <div className="grid" style={{ gap: 10 }}>
            <label className="flex gap" style={{ alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
              <input type="checkbox" checked={withStory} onChange={e => setWithStory(e.target.checked)} /> {t('Includi la slide del momento storico')}
            </label>
            {withStory && (<>
              <div className="row2">
                <Field label={t('Titolo (prima riga)')}><Input value={story.title1 || ''} placeholder={t('Un gol')} onChange={e => setStory({ ...story, title1: e.target.value })} /></Field>
                <Field label={t('Titolo (seconda riga)')}><Input value={story.title2 || ''} placeholder={t('nella storia')} onChange={e => setStory({ ...story, title2: e.target.value })} /></Field>
              </div>
              <div className="row2">
                <Field label={t('Data')}><Input value={story.date || ''} placeholder="3 dicembre 2017" onChange={e => setStory({ ...story, date: e.target.value })} /></Field>
                <Field label={t('Partita / sottotitolo')}><Input value={story.subtitle || ''} placeholder="Benevento-Milan, 2-2." onChange={e => setStory({ ...story, subtitle: e.target.value })} /></Field>
              </div>
              <Field label={t('Racconto')}><Textarea rows={5} value={story.text || ''} onChange={e => setStory({ ...story, text: e.target.value })} /></Field>
              <Field label={t('Fonte')}><Input value={story.source || ''} placeholder="Fonte: ANSA, 3 dicembre 2017." onChange={e => setStory({ ...story, source: e.target.value })} /></Field>
            </>)}
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {teaser ? t('Versione teaser: fascia follower, senza engagement e reach.') : t('Versione completa: follower, engagement e reach di Instagram.')}
          </div>
        </div>
      )}
    </Modal>
  )
}

function defaultBio(player: any, prof: any, lang: string) {
  const it = lang !== 'en'
  const role = (player?.position || '').toLowerCase()
  const roleIt: Record<string, string> = { goalkeeper: 'portiere', defender: 'difensore', midfielder: 'centrocampista', attacker: 'attaccante' }
  const quote = prof?.identity?.desired_image
  const base = it
    ? `${player?.name || ''} è un ${roleIt[role] || role || 'calciatore'} del ${player?.team_name || ''}.`
    : `${player?.name || ''} is a ${role || 'footballer'} at ${player?.team_name || ''}.`
  return base + (quote ? (it ? `\n\nNel profilo commerciale si descrive così: «${quote}».` : `\n\nIn the commercial profile they describe themselves as: “${quote}”.`) : '')
}

const CSS = `
.mkd-h { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; color: var(--text-faint); margin-bottom: 8px; }
.mkd-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.mkd-slot { display: grid; gap: 4px; text-align: left; border: 1px solid var(--border); background: var(--surface); border-radius: 14px; padding: 8px; cursor: pointer; color: var(--text); }
.mkd-slot b { font-size: 12.5px; } .mkd-slot > span:last-child { font-size: 11px; color: var(--text-faint); }
.mkd-img { aspect-ratio: 16/10; border-radius: 10px; background: var(--bg-2) center/cover; display: grid; place-items: center; color: var(--text-faint); }
.mkd-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px; }
.mkd-pick button { aspect-ratio: 4/3; border: 3px solid transparent; border-radius: 10px; background: var(--bg-2) center/cover; cursor: pointer; }
.mkd-pick button.on { border-color: var(--yellow); }
`
