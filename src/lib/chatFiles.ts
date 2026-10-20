// Allegati della chat e dell'archivio "I miei file" (bucket privato chat-files).
// Ogni file si carica nella cartella di chi lo manda; gli altri lo aprono con un link firmato.
import { supabase } from './supabase'

export const MAX_FILE_MB = 25
export type Attachment = { file_path: string; file_name: string; file_mime: string; file_size: number }

// le foto grandi si alleggeriscono (lato lungo 2000 px), i documenti restano come sono
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 1.5e6) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('img')), 'image/jpeg', 0.86))
  } catch { return file }
}

export async function uploadChatFile(uid: string, file: File, folder = 'chat'): Promise<Attachment> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`File troppo grande (max ${MAX_FILE_MB} MB)`)
  const blob = await shrink(file)
  const shrunk = blob !== file
  const name = shrunk ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name
  const safe = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  const path = `${uid}/${folder}/${Date.now()}-${safe}`
  const mime = shrunk ? 'image/jpeg' : (file.type || 'application/octet-stream')
  const up = await supabase.storage.from('chat-files').upload(path, blob, { contentType: mime })
  if (up.error) throw up.error
  return { file_path: path, file_name: name, file_mime: mime, file_size: blob.size }
}

const cache = new Map<string, { url: string; exp: number }>()
export async function fileUrl(path: string, download?: string): Promise<string | null> {
  const key = path + (download ? '|d' : '')
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data } = await supabase.storage.from('chat-files').createSignedUrl(path, 3600, download ? { download } : undefined)
  if (!data?.signedUrl) return null
  cache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

export function fmtSize(n: number | null | undefined) {
  if (!n) return ''
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}
export const isImage = (mime?: string | null) => !!mime && mime.startsWith('image/')
