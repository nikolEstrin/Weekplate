const HEBREW_ERRORS = {
  cloud_unconfigured: 'החיבור לענן עדיין לא הוגדר.',
  invalid_credentials: 'כתובת האימייל או הסיסמה אינם נכונים.',
  email_not_confirmed: 'צריך לאשר את כתובת האימייל לפני ההתחברות.',
  user_already_exists: 'כבר קיים חשבון עם כתובת האימייל הזו.',
  weak_password: 'הסיסמה חלשה מדי. יש לבחור לפחות 8 תווים.',
  over_email_send_rate_limit: 'נשלחו יותר מדי הודעות. כדאי להמתין מעט ולנסות שוב.',
  network_error: 'אין כרגע חיבור לרשת. כדאי לבדוק את החיבור ולנסות שוב.',
  session_expired: 'פג תוקף ההתחברות. יש להתחבר מחדש.',
  invalid_callback: 'קישור האימות אינו תקין או שפג תוקפו.',
  passwords_do_not_match: 'הסיסמאות אינן תואמות.',
  password_too_short: 'הסיסמה חייבת להכיל לפחות 8 תווים.',
  delete_failed: 'לא הצלחנו למחוק את החשבון. כדאי לנסות שוב.',
  unknown_error: 'משהו השתבש. כדאי לנסות שוב.',
}

export function getAuthErrorCode(error) {
  const code = String(error?.code ?? '').toLowerCase()
  const status = Number(error?.status)

  if (
    code === 'invalid_credentials' ||
    code === 'email_not_confirmed' ||
    code === 'user_already_exists' ||
    code === 'weak_password' ||
    code === 'over_email_send_rate_limit'
  ) {
    return code
  }
  if (
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    code === 'session_not_found' ||
    status === 401
  ) {
    return 'session_expired'
  }
  if (
    error instanceof TypeError ||
    code === 'network_error' ||
    code === 'fetch_error' ||
    /network|fetch|offline/i.test(String(error?.message ?? ''))
  ) {
    return 'network_error'
  }
  return 'unknown_error'
}

export function getAuthErrorMessage(errorOrCode) {
  const code =
    typeof errorOrCode === 'string' ? errorOrCode : getAuthErrorCode(errorOrCode)
  return HEBREW_ERRORS[code] ?? HEBREW_ERRORS.unknown_error
}
