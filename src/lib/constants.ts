export const SERVICE_WORKER = 'SERVICE_WORKER'
export const POPUP = 'POPUP'
export const OFFSCREEN = 'OFFSCREEN'

export const SYNC_STATUS = 'SYNC_STATUS'
export const NEW_EMAILS = 'NEW_EMAILS'
export const TRIGGER_SYNC_NOW = 'TRIGGER_SYNC_NOW'
export const CLEAR_HISTORY = 'CLEAR_HISTORY'

export const PROCESS_EMAIL = 'PROCESS_EMAIL' as const
export const PROCESSED_EMAIL_RESULT = 'PROCESSED_EMAIL_RESULT'

export const STORAGE_KEY_HISTORY_ID = 'gmailHistoryId'
export const STORAGE_KEY_LAST_SYNC = 'lastSyncTime'
export const STORAGE_KEY_SYNC_STATUS = 'syncStatus'

export const ALARM_GMAIL_CHECK = 'checkGmail'

export const POLLING_INTERVAL_MINUTES = 1

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

export const OFFSCREEN_DOCUMENT_PATH = './offscreen.html'
export const OFFSCREEN_REASON = 'DOM_PARSER'

export const PROMPT = `I will provide an email (headers and body). Extract information about it. Here's a breakdown of what I need you to look for:

**A. From the Headers:**

* **Sender:** Who sent the email (email address).
* **Recipient(s):** Who the email was sent to (email addresses).
* **Subject:** What the email is about (a brief description).
* **Date and Time:** When the email was sent.
* **Reply-To:** If different from the sender, where replies should be sent.
* **Message-ID:** A unique identifier for the email.
* **MIME Type:** The format of the email (e.g., plain text, HTML).
* **Received Headers:** This is a chain of servers the email passed through, which can give clues about its origin and path.

**B. From the Body:**

* **Content Type:** Whether it's plain text, HTML, or rich text.
* **Topic/Purpose:**  Analyze the text to determine the main subject of the email. For example, is it a job posting, an update, a request, a notification, etc.?\n* **Key Information:** Identify and extract specific details like:
    * **Job Titles:** (If it's a job posting)
    * **Company Names:**
    * **Requirements:** (e.g., skills, experience)
    * **Deadlines:**
    * **Contact Information:**
    * **Dates and Times:**
    * **Specific Tasks/Instructions:**
* **Sentiment:** The tone of the email (positive, negative, neutral) to get a sense of the sender's attitude.
* **Keywords:**  Identify important keywords related to the email's content.
* **Action Items:**  Identify tasks or actions that are requested or mentioned.
* **Format & Structure:**  Recognize different sections within the email (e.g., introduction, details, call to action).
`
