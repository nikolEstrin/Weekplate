import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

export function isNativePlatform() {
  return Capacitor.isNativePlatform()
}

export async function initPlatform() {
  if (!isNativePlatform()) {
    return
  }

  const root = document.documentElement
  root.classList.add('is-native')
  if (Capacitor.getPlatform() === 'ios') {
    root.classList.add('platform-ios')
  }

  await Promise.allSettled([
    StatusBar.setStyle({ style: Style.Dark }),
    StatusBar.setOverlaysWebView({ overlay: true }),
    Keyboard.setAccessoryBarVisible({ isVisible: true }),
  ])
}

export async function hideSplash() {
  if (!isNativePlatform()) {
    return
  }

  try {
    await SplashScreen.hide()
  } catch {
    // A missing/already hidden native splash must not block app startup.
  }
}
