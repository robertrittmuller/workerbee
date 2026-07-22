export type TaskNotificationSettings = {
  desktopNotifications: boolean
}

const STORAGE_KEY = 'workerbee:task-notifications:v1'
export const TASK_NOTIFICATION_SETTINGS_EVENT = 'workerbee:task-notification-settings-changed'

export const DEFAULT_TASK_NOTIFICATION_SETTINGS: TaskNotificationSettings = {
  desktopNotifications: true,
}

export function loadTaskNotificationSettings(): TaskNotificationSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_TASK_NOTIFICATION_SETTINGS
    const parsed = JSON.parse(stored) as Partial<TaskNotificationSettings>
    return {
      desktopNotifications: typeof parsed.desktopNotifications === 'boolean'
        ? parsed.desktopNotifications
        : DEFAULT_TASK_NOTIFICATION_SETTINGS.desktopNotifications,
    }
  } catch {
    return DEFAULT_TASK_NOTIFICATION_SETTINGS
  }
}

export function saveTaskNotificationSettings(settings: TaskNotificationSettings): TaskNotificationSettings {
  const normalized = { desktopNotifications: Boolean(settings.desktopNotifications) }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(TASK_NOTIFICATION_SETTINGS_EVENT, { detail: normalized }))
  return normalized
}
