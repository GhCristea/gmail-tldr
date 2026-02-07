import { logger } from '../logger.js'

export interface PreprocessResult {
  email_text_filtered: string
  email_labels: string[]
  droppedSpans: Array<{ type: string; text: string }>
}

export function preprocessEmailForLLM(rawEmailText: string): PreprocessResult {
  logger.log('Pre-processing email for LLM (mock implementation)...')

  const droppedSpans: Array<{ type: string; text: string }> = []
  let filtered = rawEmailText

  if (/<[a-z][\s\S]*>/i.test(filtered) || /&[a-z]+;/i.test(filtered)) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(filtered, 'text/html')
      filtered = doc.body.textContent || filtered
    } catch (e) {
      logger.warn('Failed to parse HTML in offscreen:', e)
    }
  }

  const signaturePatterns = [/best regards[\s\S]*/i, /kind regards[\s\S]*/i, /thanks[\s\S]*cheers/i]
  for (const pattern of signaturePatterns) {
    const match = filtered.match(pattern)
    if (match) {
      droppedSpans.push({ type: 'signatureBlock', text: match[0].substring(0, 50) })
      filtered = filtered.replace(pattern, '')
    }
  }

  const legalPatterns = [/this email.*confidential/i, /if you are not the intended recipient/i]
  for (const pattern of legalPatterns) {
    const match = filtered.match(pattern)
    if (match) {
      droppedSpans.push({ type: 'legalFooter', text: match[0].substring(0, 50) })
      filtered = filtered.replace(pattern, '')
    }
  }

  filtered = filtered.replace(/\s+/g, ' ').trim()

  const labels: string[] = []
  if (/by\s+\d{1,2}[\s\-/]\d{1,2}|deadline|due\s+by/i.test(rawEmailText)) {
    labels.push('possible_deadline')
  }
  if (/unsubscribe|manage.*preferences|marketing.*email/i.test(rawEmailText)) {
    labels.push('newsletter')
  }
  if (/order.*confirmation|invoice|payment.*receipt|subscription/i.test(rawEmailText)) {
    labels.push('transactional')
  }
  if (/can you|could you|please review|please approve|action required/i.test(rawEmailText)) {
    labels.push('actionable')
  }

  logger.log('Email pre-processed', { labelsCount: labels.length, droppedCount: droppedSpans.length })

  return { email_text_filtered: filtered, email_labels: labels, droppedSpans }
}
