import { GMAIL_API_BASE } from "./constants.js";
import type { EmailSummary, GmailMessage, GmailHistory } from "./types.js";

/**
 * Gmail API utilities
 * Handles authentication, fetching, and email parsing
 */

/**
 * Get OAuth 2.0 access token from Chrome identity API
 */
export async function getAuthToken(interactive: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error("Failed to get auth token"));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Fetch from Gmail API with auth header
 */
async function fetchGmail<T = any>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${GMAIL_API_BASE}/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as T;
}

/**
 * Get Gmail user profile to retrieve current historyId
 */
export async function getUserProfile(
  token: string
): Promise<{ historyId: string; emailAddress: string }> {
  return fetchGmail("users/me/profile", token);
}

/**
 * Get history changes since a given historyId
 * Returns messages that were added
 */
export async function getHistoryChanges(
  token: string,
  startHistoryId: string
): Promise<GmailHistory> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
  });
  return fetchGmail(`users/me/history?${params.toString()}`, token);
}

/**
 * Get full message details by ID
 */
export async function getFullMessage(
  token: string,
  messageId: string
): Promise<GmailMessage> {
  return fetchGmail(`users/me/messages/${messageId}?format=full`, token);
}

/**
 * Extract email data from Gmail message
 */
export function extractEmailData(message: GmailMessage): EmailSummary {
  const headers = message.payload.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
  const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";
  const to = headers.find((h) => h.name === "To")?.value || "Unknown Recipient";
  const date = headers.find((h) => h.name === "Date")?.value || "Unknown Date";

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    date,
    snippet: message.snippet,
    labels: message.labelIds,
  };
}

/**
 * Recursively extract plain text from email payload
 */
export function extractBody(payload: any): string {
  try {
    // If there's body data at this level
    if (payload.body?.data) {
      return decodeBase64(payload.body.data);
    }

    // If there are parts, search for text/plain or text/html
    if (payload.parts) {
      for (const part of payload.parts) {
        if (
          (part.mimeType === "text/plain" || part.mimeType === "text/html") &&
          part.body?.data
        ) {
          return decodeBase64(part.body.data);
        }
        // Recursively search nested parts
        if (part.parts) {
          const nested = extractBody(part);
          if (nested && nested !== "No body content") {
            return nested;
          }
        }
      }
    }

    return "(No body content)";
  } catch (error) {
    console.error("Error extracting body:", error);
    return "(Error extracting content)";
  }
}

/**
 * Decode base64-encoded email content
 * Gmail uses URL-safe base64 (- and _ instead of + and /)
 */
function decodeBase64(data: string): string {
  try {
    // Convert URL-safe base64 to standard base64
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64);
    return decoded;
  } catch (error) {
    console.error("Error decoding base64:", error);
    return "(Error decoding content)";
  }
}

/**
 * Mark message as read
 */
export async function markAsRead(token: string, messageId: string): Promise<void> {
  await fetchGmail(`users/me/messages/${messageId}/modify`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}
