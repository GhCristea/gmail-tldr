import { OFFSCREEN, SERVICE_WORKER, PROCESS_EMAIL, PROCESSED_EMAIL_RESULT } from './lib/constants'
import { listenForMessages } from './lib/messaging'
import { logger } from './lib/logger'
import { preprocessEmailForLLM } from './lib/nlp/preprocess'

logger.log('Offscreen document initialized')

listenForMessages<typeof SERVICE_WORKER, typeof OFFSCREEN>((message, _sender, sendResponse) => {
  if (message.type === PROCESS_EMAIL) {
    if (message.data) {
      void processEmail(message.data.id, message.data.text, sendResponse)
      return true
    }
  }
})

function processEmail(id: string, text: string, sendResponse: (response?: unknown) => void) {
  logger.log(`[OFFSCREEN] Processing email ${id}...`)
  try {
    // Note: preprocessEmailForLLM now initializes Wink NLP internally
    const { email_text_filtered, email_labels, droppedSpans } = preprocessEmailForLLM(text)

    logger.log(`[OFFSCREEN] Email ${id} filtered`, {
      originalLength: text.length,
      filteredLength: email_text_filtered.length,
      reduction: Math.round(((text.length - email_text_filtered.length) / text.length) * 100),
      labelsCount: email_labels.length,
      droppedSpansCount: droppedSpans.length
    })

    const result = {
      id,
      tokens: email_text_filtered.split(/\s+/),
      entities: email_labels,
      pos: droppedSpans.map(s => s.type)
    }

    sendResponse({ type: PROCESSED_EMAIL_RESULT, data: result })

    logger.log(`[OFFSCREEN] Email ${id} processed and result sent back`)
  } catch (error) {
    logger.error(`[OFFSCREEN] Error processing email ${id}:`, error)
    sendResponse({ type: PROCESSED_EMAIL_RESULT, data: null, error: String(error) })
  }
}
