import { Capacitor } from '@capacitor/core'
import {
  KeychainAccess,
  SecureStorage,
} from '@aparajita/capacitor-secure-storage'

const KEY_PREFIX = 'weekplate_auth_'
let nativeSetup

function setupNativeStorage() {
  if (!nativeSetup) {
    nativeSetup = (async () => {
      await SecureStorage.setKeyPrefix(KEY_PREFIX)
      await SecureStorage.setSynchronize(false)
      await SecureStorage.setDefaultKeychainAccess(
        KeychainAccess.afterFirstUnlockThisDeviceOnly,
      )
    })()
  }
  return nativeSetup
}

export const secureStorage = {
  async getItem(key) {
    if (Capacitor.isNativePlatform()) {
      await setupNativeStorage()
      return SecureStorage.getItem(key)
    }
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
  },

  async setItem(key, value) {
    if (Capacitor.isNativePlatform()) {
      await setupNativeStorage()
      await SecureStorage.setItem(key, value)
      return
    }
    window.localStorage.setItem(key, value)
  },

  async removeItem(key) {
    if (Capacitor.isNativePlatform()) {
      await setupNativeStorage()
      await SecureStorage.removeItem(key)
      return
    }
    window.localStorage.removeItem(key)
  },
}
