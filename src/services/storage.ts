import type { Store } from '../types'

const settingsKey = (userId: string) => `pem-dashboard-settings:${userId}`

export function emptyStore(): Store {
  return {
    projects: [],
    wbs: [],
    progress: [],
    activities: [],
    issues: [],
    materials: [],
    settings: { dark: false, defaultProject: '' },
  }
}

/** Only non-sensitive UI preferences are stored locally, isolated by auth user. */
export function loadPreferences(userId: string): Partial<Store['settings']> {
  try {
    const raw = localStorage.getItem(settingsKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return {
      dark: Boolean(parsed.dark),
      defaultProject: typeof parsed.defaultProject === 'string' ? parsed.defaultProject : '',
    }
  } catch {
    return {}
  }
}

export function savePreferences(userId: string, settings: Store['settings']) {
  try {
    localStorage.setItem(settingsKey(userId), JSON.stringify(settings))
  } catch (error) {
    console.error('PREFERENCE SAVE ERROR:', error)
  }
}
