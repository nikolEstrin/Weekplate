import {
  Haptics,
  ImpactStyle,
  NotificationType,
} from '@capacitor/haptics'
import { isNativePlatform } from './native.js'

export async function lightImpact() {
  if (!isNativePlatform()) {
    return
  }
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Haptics are optional and must never interrupt an interaction.
  }
}

export async function successNotification() {
  if (!isNativePlatform()) {
    return
  }
  try {
    await Haptics.notification({ type: NotificationType.Success })
  } catch {
    // Haptics are optional and must never interrupt an interaction.
  }
}
