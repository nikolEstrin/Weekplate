import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isNativePlatform } from './native.js'

function serializeJson(json) {
  return typeof json === 'string' ? json : JSON.stringify(json, null, 2)
}

function isCancelled(error) {
  const name = String(error?.name || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()
  return (
    name === 'aborterror' ||
    message.includes('cancel') ||
    message.includes('dismiss')
  )
}

function downloadJson(filename, contents) {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function shareJsonFile({ filename, json, title }) {
  const contents = serializeJson(json)

  try {
    if (isNativePlatform()) {
      const result = await Filesystem.writeFile({
        path: filename,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      await Share.share({ title, files: [result.uri] })
      return { ok: true }
    }

    const file = new File([contents], filename, {
      type: 'application/json',
    })
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' ||
        navigator.canShare({ files: [file] }))
    ) {
      await navigator.share({ title, files: [file] })
      return { ok: true }
    }

    downloadJson(filename, contents)
    return { ok: true }
  } catch (error) {
    if (isCancelled(error)) {
      return { ok: false, cancelled: true }
    }
    return { ok: false }
  }
}
