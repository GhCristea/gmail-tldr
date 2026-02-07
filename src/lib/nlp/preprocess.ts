import { logger } from '../logger'
import { getNLP } from './wink'

export interface PreprocessResult {
  email_text_filtered: string
  email_labels: string[]
  droppedSpans: Array<{ type: string; text: string }>
}

export const preprocessEmailForLLM = (rawEmailText: string): PreprocessResult => {
  logger.log('Pre-processing email with Wink NLP...')

  const nlp = getNLP()
  const pos = (index: number, rdd: unknown) => nlp.its.pos(index, rdd)

  const droppedSpans: Array<{ type: string; text: string }> = []

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

  const doc = nlp.readDoc(cleanText)

  const sentences = doc.sentences().out()
  const keptSentences: string[] = []

  sentences.forEach(s => {
    if (keptSentences.length === 0 && /^(hi|hello|dear|hey|good morning|greetings)\b/i.test(s)) {
      droppedSpans.push({ type: 'greeting', text: s })
      return
    }

    if (/^(best|kind|warm)?\s*(regards|wishes|cheers|thanks|sincerely),?$/i.test(s)) {
      droppedSpans.push({ type: 'closing', text: s })
      return
    }

    if (/sent from my/i.test(s)) {
      droppedSpans.push({ type: 'device_signature', text: s })
      return
    }

    keptSentences.push(s)
  })

  const labels: Set<string> = new Set()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  doc.sentences().each((s, _i) => {
    if (s.out().trim().endsWith('?')) {
      const firstToken = s.tokens().itemAt(0)
      if (firstToken === null) {
        return
      }

      if (firstToken.out(pos) === 'AUX' || firstToken.out(pos) === 'VERB') {
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

  return { email_text_filtered: filteredText, email_labels: Array.from(labels), droppedSpans }
}
