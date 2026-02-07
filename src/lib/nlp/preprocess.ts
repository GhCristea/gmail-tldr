import { logger } from '../logger.js'

/**
 * Result of email pre-processing via Wink NLP.
 */
export interface PreprocessResult {
  email_text_filtered: string
  email_labels: string[]
  droppedSpans: Array<{ type: string; text: string }>
}

/**
 * Pre-process email text using Wink NLP patterns.
 * Strips low-value blocks (signatures, legal, unsubscribe).
 * Heuristically tags high-signal content (deadlines, requests).
 *
 * IMPORTANT: This assumes Wink NLP is available in the offscreen document context.
 * For now, returns a mock result to unblock integration.
 */
export async function preprocessEmailForLLM(rawEmailText: string): Promise<PreprocessResult> {
  logger.log('Pre-processing email for LLM (mock implementation)...')

  // TODO: Replace with actual Wink NLP calls once wink-nlp package is available.
  // The real implementation would:
  // 1. Parse the doc with nlp.readDoc(rawEmailText)
  // 2. Apply email pattern matching (signatureBlock, legalFooter, etc.)
  // 3. Mark tokens to drop based on matched entities
  // 4. Rebuild filtered text
  // 5. Infer labels from matched patterns

  // Mock: detect common patterns via regex for now
  const droppedSpans: Array<{ type: string; text: string }> = []
  let filtered = rawEmailText

  // Simple heuristic: detect signature blocks
  const signaturePatterns = [
    /best regards[\s\S]*/i,
    /kind regards[\s\S]*/i,
    /thanks[\s\S]*cheers/i,
  ]
  for (const pattern of signaturePatterns) {
    const match = filtered.match(pattern)
    if (match) {
      droppedSpans.push({ type: 'signatureBlock', text: match[0].substring(0, 50) })
      filtered = filtered.replace(pattern, '')
    }
  }

  // Simple heuristic: detect legal footers
  const legalPatterns = [/this email.*confidential/i, /if you are not the intended recipient/i]
  for (const pattern of legalPatterns) {
    const match = filtered.match(pattern)
    if (match) {
      droppedSpans.push({ type: 'legalFooter', text: match[0].substring(0, 50) })
      filtered = filtered.replace(pattern, '')
    }
  }

  // Clean up excess whitespace
  filtered = filtered.replace(/\s+/g, ' ').trim()

  // Infer labels
  const labels: string[] = []
  if (/by\s+\d{1,2}[\s\-\/]\d{1,2}|deadline|due\s+by/i.test(rawEmailText)) {
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

  return {
    email_text_filtered: filtered,
    email_labels: labels,
    droppedSpans,
  }
}
