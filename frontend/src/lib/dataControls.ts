export type DataControls = {
  reviewBeforeSending: boolean
  externalProcessingAcknowledgedAt: string | null
}

const STORAGE_KEY = 'workerbee-data-controls-v1'

export const DEFAULT_DATA_CONTROLS: DataControls = {
  reviewBeforeSending: true,
  externalProcessingAcknowledgedAt: null,
}

export function loadDataControls(): DataControls {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      reviewBeforeSending:
        typeof parsed.reviewBeforeSending === 'boolean'
          ? parsed.reviewBeforeSending
          : DEFAULT_DATA_CONTROLS.reviewBeforeSending,
      externalProcessingAcknowledgedAt:
        typeof parsed.externalProcessingAcknowledgedAt === 'string'
          ? parsed.externalProcessingAcknowledgedAt
          : null,
    }
  } catch {
    return { ...DEFAULT_DATA_CONTROLS }
  }
}

export function saveDataControls(dataControls: DataControls): DataControls {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataControls))
  window.dispatchEvent(new CustomEvent('workerbee:data-controls-changed', { detail: dataControls }))
  return dataControls
}

export function shouldReviewBeforeSending(dataControls: DataControls): boolean {
  return dataControls.reviewBeforeSending || !dataControls.externalProcessingAcknowledgedAt
}
