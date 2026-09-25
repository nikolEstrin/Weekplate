import { App } from '@capacitor/app'
import { isNativePlatform } from './native.js'

function onAppState(active, callback) {
  if (!isNativePlatform()) {
    return () => {}
  }

  let disposed = false
  let listener
  App.addListener('appStateChange', ({ isActive }) => {
    if (!disposed && isActive === active) {
      callback()
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

export function onAppResume(callback) {
  return onAppState(true, callback)
}

export function onAppPause(callback) {
  return onAppState(false, callback)
}

export function onDeepLink(callback) {
  if (!isNativePlatform()) {
    return () => {}
  }

  let disposed = false
  let listener

  App.addListener('appUrlOpen', ({ url }) => {
    if (!disposed && url) {
      callback(url)
    }
  }).then((handle) => {
    if (disposed) {
      handle.remove()
    } else {
      listener = handle
    }
  })

  App.getLaunchUrl()
    .then((result) => {
      if (!disposed && result?.url) {
        callback(result.url)
      }
    })
    .catch(() => {})

  return () => {
    disposed = true
    listener?.remove()
  }
}
