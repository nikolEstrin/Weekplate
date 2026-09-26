import { Capacitor } from '@capacitor/core'
import { getAuthErrorCode } from './authErrors'
import { getSupabase } from './supabaseClient'

function unavailable() {
  return { ok: false, errorCode: 'cloud_unconfigured' }
}

function failure(error) {
  return { ok: false, errorCode: getAuthErrorCode(error) }
}

export function getAuthRedirectUrl() {
  if (Capacitor.isNativePlatform()) return 'weekplate://auth/callback'
  return `${window.location.origin}/`
}

export async function signUp({ email, password }) {
  const supabase = getSupabase()
  if (!supabase) return unavailable()
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    })
    if (error) return failure(error)
    return {
      ok: true,
      needsEmailConfirmation: !data.session,
    }
  } catch (error) {
    return failure(error)
  }
}

export async function signIn({ email, password }) {
  const supabase = getSupabase()
  if (!supabase) return unavailable()
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    return error ? failure(error) : { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function signOut() {
  const supabase = getSupabase()
  if (!supabase) return unavailable()
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    return error ? failure(error) : { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function requestPasswordReset(email) {
  const supabase = getSupabase()
  if (!supabase) return unavailable()
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthRedirectUrl(),
    })
    return error ? failure(error) : { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function updatePassword(newPassword) {
  const supabase = getSupabase()
  if (!supabase) return unavailable()
  if (newPassword.length < 8) {
    return { ok: false, errorCode: 'password_too_short' }
  }
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return error ? failure(error) : { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteAccount() {
  const supabase = getSupabase()
  if (!supabase) return unavailable()
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    })
    if (error || data?.ok !== true) {
      return { ok: false, errorCode: 'delete_failed' }
    }
    // The caller signs out after removing this user's data from the device.
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function handleAuthCallbackUrl(url) {
  const supabase = getSupabase()
  if (!supabase) return unavailable()

  try {
    const parsed = new URL(url)
    const params = new URLSearchParams(parsed.search)
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''))
    const value = (name) => params.get(name) ?? hash.get(name)
    if (value('error') || value('error_code')) {
      return { ok: false, errorCode: 'invalid_callback' }
    }

    const callbackType = value('type')
    const type =
      callbackType === 'recovery'
        ? 'recovery'
        : callbackType === 'signup' || callbackType === 'email'
          ? 'signup'
          : 'unknown'
    // Only PKCE codes are accepted: exchanging one needs the verifier stored on
    // this device, so a link crafted from someone else's token can't sign in here.
    const code = value('code')
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      return error ? failure(error) : { ok: true, type }
    }
    return { ok: false, errorCode: 'invalid_callback' }
  } catch {
    return { ok: false, errorCode: 'invalid_callback' }
  }
}
