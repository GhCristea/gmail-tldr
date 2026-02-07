import { OFFSCREEN, SERVICE_WORKER, PROCESS_EMAIL, PROCESSED_EMAIL_RESULT } from './lib/constants.js'
import { listenForMessages, sendMessage } from './lib/messaging.js'
import { logger } from './lib/logger.js'
import { preprocessEmailForLLM } from './lib/nlp/preprocess.js'

logger.log('Offscreen document initialized')

listenForMessages<typeof SERVICE_WORKER, typeof OFFSCREEN>((message) => {
  if (message.type === PROCESS_EMAIL) {
    if (message.data) {
      void processEmail(message.data.id, message.data.text)
    }
  }
})

async function processEmail(id: string, text: string) {
  logger.log(`[OFFSCREEN] Processing email ${id}...`)

  try {
    // Pre-process: Wink-based filtering to remove noise, tag high-signal content
    const { email_text_filtered, email_labels, droppedSpans } = preprocessEmailForLLM(text)

    logger.log(`[OFFSCREEN] Email ${id} filtered`, {
      originalLength: text.length,
      filteredLength: email_text_filtered.length,
      reduction: Math.round(((text.length - email_text_filtered.length) / text.length) * 100),
      labelsCount: email_labels.length,
      droppedSpansCount: droppedSpans.length
    })

    // Return filtered text + labels to service worker
    const result = {
      id,
      tokens: email_text_filtered.split(/\s+/),
      entities: email_labels,
      pos: droppedSpans.map((s) => s.type)
    }

    await sendMessage<typeof OFFSCREEN, typeof SERVICE_WORKER>({ type: PROCESSED_EMAIL_RESULT, data: result })

    logger.log(`[OFFSCREEN] Email ${id} processed and result sent back`)
  } catch (error) {
    logger.error(`[OFFSCREEN] Error processing email ${id}:`, error)
    // Send error result back
    await sendMessage<typeof OFFSCREEN, typeof SERVICE_WORKER>({
      type: PROCESSED_EMAIL_RESULT,
      data: null,
      error: String(error)
    })
  }
}
