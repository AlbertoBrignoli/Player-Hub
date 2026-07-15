export type Role = 'admin' | 'player' | 'creator' | 'brand' | 'preparatore'

export interface Brand {
  id: string
  owner_id: string | null
  name: string
  contact_name: string | null
  contact_role: string | null
  email: string | null
  phone: string | null
  website: string | null
  logo_url: string | null
  notes: string | null
  player_id?: number | null
  accent_color?: string | null
  tagline?: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: Role
  player_api_id?: number | null
}

export interface Player {
  id: string
  api_player_id: number | null
  name: string | null
  team_name: string | null
  team_country: string | null
  stadium_name: string | null
  stadium_capacity: number | null
  stadium_photo_url: string | null
  height: string | null
  weight: string | null
  preferred_foot: string | null
  position: string | null
  shirt_number: number | null
  photo_url: string | null
  nationality: string | null
  age: number | null
  birth_date: string | null
  instagram_url: string | null
  contact_email: string | null
  instagram_followers: number | null
  instagram_engagement: number | null
  instagram_reach: number | null
  audience_note: string | null
  instagram_connected: boolean | null
  transfermarkt_url?: string | null
  contract_expiry?: string | null
  sofascore_url?: string | null
  shipping?: ShippingInfo | null
  equipment?: EquipmentInfo | null
  club_contacts?: ClubContacts | null
}

export interface ShippingInfo {
  country?: string; city?: string; cap?: string; address?: string; phone?: string; email?: string
  ref_name?: string; ref_relation?: string; ref_phone?: string; ref_email?: string
}
export interface EquipmentInfo {
  shoe_brand?: string; shoe_size?: string; shoe_model?: string; shoe_sponsor?: string
  glove_brand?: string; glove_size?: string; glove_model?: string; glove_sponsor?: string
}
export interface ClubContacts {
  manager_name?: string; manager_phone?: string; manager_email?: string
  press_name?: string; press_phone?: string; press_email?: string
  media_name?: string; media_phone?: string; media_email?: string
  secretary_phone?: string; secretary_email?: string
  materials_link?: string; materials_username?: string; materials_password?: string
}

export interface Match {
  id: string
  match_date: string | null
  league: string | null
  round: string | null
  home_team: string | null
  away_team: string | null
  opponent: string | null
  venue: string | null
  status: string | null
  team_score: number | null
  opponent_score: number | null
  minutes: number | null
  rating: number | string | null
  goals: number | null
  assists: number | null
  yellow_cards: number | null
  red_cards: number | null
  tackles: number | null
  interceptions: number | null
  duels_total: number | null
  duels_won: number | null
  passes_total: number | null
  passes_accuracy: string | null
}

export interface SeasonStat {
  id: string
  season: number | null
  competition: string | null
  appearances: number | null
  minutes: number | null
  goals: number | null
  assists: number | null
  rating: number | null
  yellow_cards: number | null
  red_cards: number | null
}

export interface Contract {
  id: string
  title: string
  counterpart: string | null
  type: string
  start_date: string | null
  end_date: string | null
  salary_gross: number | null
  currency: string
  clauses: { label: string; value: string }[]
  status: string
  notes: string | null
  created_at: string
}

export interface Doc {
  id: string
  name: string
  category: string
  file_path: string | null
  file_url: string | null
  size: number | null
  mime: string | null
  uploaded_by: string | null
  created_at: string
}

export interface Payment {
  id: string
  direction: 'in' | 'out'
  category: string
  description: string | null
  amount: number
  currency: string
  counterpart: string | null
  due_date: string | null
  paid: boolean
  paid_date: string | null
  notes: string | null
  created_at: string
}

export interface Sponsor {
  id: string
  brand: string
  type: string
  value: number | null
  currency: string
  start_date: string | null
  end_date: string | null
  status: string
  deliverables: { title: string; due_date?: string; done?: boolean }[]
  contact: string | null
  notes: string | null
  created_at: string
}

export interface EventAttachment {
  name: string
  path: string
  size?: number | null
  mime?: string | null
}

export interface EventItem {
  id: string
  title: string
  type: string
  start_at: string
  end_at: string | null
  location: string | null
  notes: string | null
  created_at: string
  player_id?: number | null
  created_by?: string | null
  fitness_program_id?: string | null
  attachments?: EventAttachment[] | null
  assignee_role?: string | null
  request_status?: string | null
  resolved_at?: string | null
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'doing' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignee: 'auvi' | 'player'
  due_date: string | null
  created_by: string | null
  created_at: string
}

export interface Message {
  id: string
  sender_id: string | null
  sender_name: string | null
  sender_role: string | null
  body: string
  created_at: string
  player_id?: number | null
  channel?: string | null
}

export interface BrandLite {
  id: string
  name: string
  player_id?: number | null
  accent_color?: string | null
  logo_url?: string | null
}

export interface AllowedEmail {
  email: string
  role: Role
  note: string | null
  created_at: string
}

export interface EditorialAsset {
  path: string
  name: string
  uploaded_at: string
  by: string | null
}

export interface EditorialEntry {
  id: string
  entry_date: string
  type: 'partita' | 'post' | 'story' | 'carosello' | 'reel' | 'altro'
  title: string
  theme: string | null
  brief: string | null
  requested_by: string | null
  match_id: string | null
  match_info: {
    fixture_id?: number | string | null
    league?: string | null
    round?: string | null
    venue?: string | null
    stadium?: string | null
    home_team?: string | null
    away_team?: string | null
    opponent?: string | null
    kickoff?: string | null
    status?: string | null
    team_score?: number | null
    opponent_score?: number | null
  } | null
  copy_text: string | null
  hashtags: string | null
  brand_id: string | null
  player_id?: number | null
  assets: EditorialAsset[]
  status: 'da_preparare' | 'copy_pronto' | 'grafica_caricata' | 'pronto' | 'pubblicato'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MediaItem {
  id: string
  storage_path: string
  file_name: string | null
  kind: 'foto' | 'grafica' | 'carosello'
  status: 'da_approvare' | 'approvata' | 'da_pubblicare' | 'pubblicata' | 'scartata'
  source_ids: string[] | null
  folder: string | null
  editorial_id: string | null
  uploaded_by: string | null
  uploaded_role: string | null
  note: string | null
  created_at: string
}

export interface NotificationItem {
  id: string
  recipient_role: Role | 'team'
  title: string
  body: string | null
  route: string | null
  read_at: string | null
  created_at: string
  player_id?: number | null
}

export interface StatsMatch {
  id: string
  match_date: string
  competition: string
  match_name: string
  minutes: number | null
  goal: number | null
  assist: number | null
  xg: number | null
  tiri: number | null
  tiri_porta: number | null
  passaggi: number | null
  passaggi_accurati: number | null
  pass_pct: number | null
  passaggi_avanti: number | null
  passaggi_avanti_accurati: number | null
  passaggi_avanti_pct: number | null
  lanci_lunghi: number | null
  lanci_lunghi_accurati: number | null
  lanci_lunghi_pct: number | null
  duelli: number | null
  duelli_vinti: number | null
  duelli_pct: number | null
  duelli_aerei: number | null
  duelli_aerei_vinti: number | null
  duelli_aerei_pct: number | null
  duelli_difensivi: number | null
  duelli_dif_vinti: number | null
  duelli_dif_pct: number | null
  azioni_totali: number | null
  azioni_riuscite: number | null
  azioni_pct: number | null
  intercetti: number | null
  spazzate: number | null
  palle_recuperate: number | null
  palle_perse: number | null
  falli: number | null
  cartellini_gialli: number | null
  cartellini_rossi: number | null
}

export interface StatsSeason {
  competition: string
  partite: number
  minuti: number
  goal: number
  assist: number
  xg_medio: number | null
  passaggi_media: number | null
  pass_pct: number | null
  passaggi_avanti_media: number | null
  passaggi_avanti_pct: number | null
  lanci_lunghi_media: number | null
  lanci_lunghi_pct: number | null
  duelli_media: number | null
  duelli_pct: number | null
  duelli_aerei_media: number | null
  duelli_aerei_pct: number | null
  duelli_dif_pct: number | null
  azioni_pct: number | null
  intercetti_media: number | null
  spazzate_media: number | null
  palle_recuperate_media: number | null
  palle_perse_media: number | null
  cartellini_gialli: number
  cartellini_rossi: number
}


export interface FitnessProgram {
  id: string
  player_id: number
  trainer_id: string | null
  name: string
  program_date: string | null
  start_time: string | null
  duration_min: number | null
  focus: string | null
  objective: string | null
  intensity: string | null
  warmup: string | null
  recovery_between_sets: string | null
  recovery_between_exercises: string | null
  cooldown: string | null
  general_notes: string | null
  note_staff: string | null
  note_athlete: string | null
  status: 'draft' | 'published'
  pdf_path?: string | null
  recurring: boolean
  recurrence: string | null
  created_at?: string
  updated_at?: string
}

export interface FitnessExercise {
  id?: string
  program_id?: string
  name: string
  image_url?: string | null
  video_url?: string | null
  muscle_group?: string | null
  sets?: number | null
  reps?: string | null
  load?: string | null
  isometry_time?: string | null
  recovery?: string | null
  side?: string | null
  alternative?: string | null
  technical_notes?: string | null
  mistakes?: string | null
  priority?: string | null
  order_index?: number
}

export interface FitnessFeedback {
  id?: string
  program_id: string
  player_id: number
  status: 'programmato' | 'completato' | 'parziale' | 'non_completato' | 'saltato'
  completed: boolean
  difficulty?: number | null
  pain?: string | null
  feeling?: string | null
  discomfort?: string | null
  athlete_notes?: string | null
}

export interface FitnessLibraryItem {
  id: string
  name: string
  category?: string | null
  muscle_group?: string | null
  equipment?: string | null
  difficulty?: string | null
  image_url?: string | null
  description?: string | null
}

export interface CoachProfile {
  trainer_id: string
  name?: string | null
  photo_url?: string | null
  headline?: string | null
  experience?: string | null
  verified?: boolean
  bio_method?: string | null
  bio_philosophy?: string | null
  education?: string | null
  certifications?: string | null
  teams?: string | null
  specializations?: string[]
  services?: string[]
  availability?: string | null
  contacts?: { email?: string; phone?: string; whatsapp?: string; instagram?: string; linkedin?: string; website?: string }
}

export interface FitnessRequest {
  id?: string
  player_id: number
  trainer_id?: string | null
  type: 'programma' | 'allenamento' | 'messaggio'
  note?: string | null
  status?: 'aperta' | 'gestita'
  created_at?: string
}

/* ---------- Ufficio del preparatore (dati privati del coach) ---------- */
export interface CoachClient {
  id: string
  trainer_id: string
  name: string
  contact: string | null
  player_id: number | null
  rate: number | null
  notes: string | null
  archived: boolean
  created_at: string
}

export interface CoachSession {
  id: string
  trainer_id: string
  client_id: string | null
  title: string | null
  session_date: string
  start_time: string | null
  duration_min: number | null
  location: string | null
  status: string
  price: number | null
  paid: boolean
  notes: string | null
  created_at: string
}

export interface CoachLedger {
  id: string
  trainer_id: string
  kind: string
  amount: number
  category: string | null
  description: string | null
  entry_date: string
  session_id: string | null
  created_at: string
}
