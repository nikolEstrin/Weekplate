import { createClient } from '@supabase/supabase-js'
import { secureStorage } from './secureStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.hostname === 'localhost'
  } catch {
    return false
  }
}

export const isCloudConfigured = Boolean(
  supabaseAnonKey && supabaseUrl && isValidUrl(supabaseUrl),
)

let client = null

export function getSupabase() {
  if (!isCloudConfigured) return null
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: secureStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  }
  return client
}
