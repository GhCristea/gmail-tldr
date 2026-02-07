import {
  OFFSCREEN,
  SERVICE_WORKER,
  PROCESS_EMAIL,
  PROCESSED_EMAIL_RESULT,
} from './lib/constants.js'
import { listenForMessages, sendMessage } from './lib/messaging.js'
import { logger } from './lib/logger.js'

// TODO: Import Wink NLP and model
// import winkNLP from 'wink-nlp';
// import model from 'wink-eng-lite-web-model';

logger.log('Offscreen document initialized')

// Initialize Wink NLP (Placeholder)
// const nlp = winkNLP(model);

listenForMessages<typeof SERVICE_WORKER, typeof OFFSCREEN>(async (message) => {
  if (message.type === PROCESS_EMAIL) {
    if (message.data) {
      await processEmail(message.data.id, message.data.text)
    }
  }
})

async function processEmail(id: string, text: string) {
  logger.log(`Processing email ${id} in offscreen document...`)

  try {
    // Placeholder for Wink NLP processing
    // const doc = nlp.readDoc(text);
    // const entities = doc.entities().out();
    // const pos = doc.tokens().out(nlp.its.pos);

    // Mock result for now
    const result = {
      id,
      tokens: text.split(' '),
      entities: [],
      pos: []
    }

    await sendMessage<typeof OFFSCREEN, typeof SERVICE_WORKER>({
      type: PROCESSED_EMAIL_RESULT,
      data: result
    })

    logger.log(`Email ${id} processed and result sent back`)
  } catch (error) {
    logger.error(`Error processing email ${id}:`, error)
  }
}
