import { logger } from '../logger.js'
import { getNLP } from './wink.js'

export interface PreprocessResult {
  email_text_filtered: string
  email_labels: string[]
  droppedSpans: Array<{ type: string; text: string }>
}

export function preprocessEmailForLLM(rawEmailText: string): PreprocessResult {
  logger.log('Pre-processing email with Wink NLP...')

  const nlp = getNLP()
  const droppedSpans: Array<{ type: string; text: string }> = []
  
  // 0. Clean HTML artifacts first (Wink works best on clean text)
  let cleanText = rawEmailText
  if (/<[a-z][\s\S]*>/i.test(cleanText) || /&[a-z]+;/i.test(cleanText)) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(cleanText, 'text/html')
      cleanText = doc.body.textContent || cleanText
    } catch (e) {
      logger.warn('Failed to parse HTML:', e)
    }
  }
  cleanText = cleanText.replace(/\s+/g, ' ').trim()

  // 1. Ingest text into Wink
  const doc = nlp.readDoc(cleanText)

  // 2. Identify and drop noise entities
  // Signatures often happen at the end and contain names/titles
  // We'll use a heuristic: last few sentences if they look like contact info
  // For now, we rely on Custom Entities if we defined them for signatures
  // But regex is still faster for block-level removal, so we mix both.
  
  // Let's use Wink's sentence segmentation to drop "Chatter"
  // e.g. "Hope you are well", "Sent from my iPhone"
  const sentences = doc.sentences().out()
  const keptSentences: string[] = []
  
  sentences.forEach((s) => {
    const sentDoc = nlp.readDoc(s)
    
    // Drop "Greeting" chatter: "Hi John," "Dear Team,"
    if (keptSentences.length === 0 && /^(hi|hello|dear|hey|good morning|greetings)\b/i.test(s)) {
      droppedSpans.push({ type: 'greeting', text: s })
      return
    }

    // Drop "Closing" chatter: "Best," "Regards," "Thanks,"
    if (/^(best|kind|warm)?\s*(regards|wishes|cheers|thanks|sincerely),?$/i.test(s)) {
      droppedSpans.push({ type: 'closing', text: s })
      return
    }

    // Drop "Device" chatter
    if (/sent from my/i.test(s)) {
      droppedSpans.push({ type: 'device_signature', text: s })
      return
    }

    keptSentences.push(s)
  })

  // 3. Extract Signals using Custom Entities & Logic
  const labels: Set<string> = new Set()
  const entities = doc.customEntities().out()
  
  // Check our "Learned" entities
  entities.forEach((e) => {
    if (doc.customEntities().item(0).type() === 'deadline') labels.add('possible_deadline')
    if (doc.customEntities().item(0).type() === 'action_verb') labels.add('actionable')
  })

  // Additional heuristic: Questions are often actionable
  doc.sentences().each((s) => {
    if (s.out().trim().endsWith('?')) {
      // Check if it starts with a verb or auxiliary
      // Wink POS: AUX = auxiliary verb
      const firstToken = s.tokens().item(0)
      if (firstToken.pos() === 'AUX' || firstToken.pos() === 'VERB') {
        labels.add('actionable')
      }
    }
  })

  const filteredText = keptSentences.join(' ')

  logger.log('Wink analysis complete', { 
    originalSentences: sentences.length,
    keptSentences: keptSentences.length,
    labels: Array.from(labels) 
  })

  return { 
    email_text_filtered: filteredText, 
    email_labels: Array.from(labels), 
    droppedSpans 
  }
}
