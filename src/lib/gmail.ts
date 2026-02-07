import { GMAIL_API_BASE } from './constants.js'
import type { EmailSummary, GmailMessage, GmailHistory } from './types.js'

export async function getAuthToken(interactive: boolean = false) {
  return new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const lastError = chrome.runtime.lastError
      if (lastError || !token) {
        reject(new Error(lastError?.message || 'Failed to get auth token'))
      } else {
        resolve(token)
      }
    })
  })
}

async function fetchGmail<T>(endpoint: string, token: string, options: RequestInit = {}) {
  const url = `${GMAIL_API_BASE}/${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers }
  })

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as T
}

export async function getUserProfile(token: string): Promise<{ historyId: string; emailAddress: string }> {
  return fetchGmail('users/me/profile', token)
}

export async function getHistoryChanges(token: string, startHistoryId: string): Promise<GmailHistory> {
  const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded' })
  return fetchGmail(`users/me/history?${params.toString()}`, token)
}

export async function getFullMessage(token: string, messageId: string): Promise<GmailMessage> {
  return fetchGmail(`users/me/messages/${messageId}?format=full`, token)
}

export function extractEmailData(message: GmailMessage): EmailSummary {
  const headers = message.payload.headers || []
  const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)'
  const from = headers.find((h) => h.name === 'From')?.value || 'Unknown Sender'
  const to = headers.find((h) => h.name === 'To')?.value || 'Unknown Recipient'
  const date = headers.find((h) => h.name === 'Date')?.value || 'Unknown Date'

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    date,
    snippet: message.snippet,
    labels: message.labelIds
  }
}

export async function markAsRead(token: string, messageId: string) {
  await fetchGmail(`users/me/messages/${messageId}/modify`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
  })
}
