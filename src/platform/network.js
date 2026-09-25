import { Network } from '@capacitor/network'
import { isNativePlatform } from './native.js'

export async function getIsOnline() {
  if (!isNativePlatform()) {
    return typeof navigator === 'undefined' ? true : navigator.onLine
  }

  try {
    const status = await Network.getStatus()
    return status.connected
  } catch {
    return true
  }
}

export function onNetworkChange(callback) {
  if (!isNativePlatform()) {
    if (typeof window === 'undefined') {
      return () => {}
    }
    const notify = () => callback(navigator.onLine)
    window.addEventListener('online', notify)
    window.addEventListener('offline', notify)
    return () => {
      window.removeEventListener('online', notify)
      window.removeEventListener('offline', notify)
    }
  }

  let disposed = false
  let listener
  Network.addListener('networkStatusChange', (status) => {
    if (!disposed) {
      callback(status.connected)
    }
  }).then((handle) => {
    if (disposed) {
      handle.remove()
    } else {
      listener = handle
    }
  })

  return () => {
    disposed = true
    listener?.remove()
  }
}
