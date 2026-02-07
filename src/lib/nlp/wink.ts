import winkNLP, { WinkMethods } from 'wink-nlp'
import model from 'wink-eng-lite-web-model'
import { logger } from '../logger.js'

let nlp: WinkMethods | null = null

export function getNLP(): WinkMethods {
  if (nlp) return nlp

  logger.log('Initializing Wink NLP...')
  nlp = winkNLP(model)
  
  // 1. "Learn" Custom Entities (The "Learning" part)
  // We teach it that specific patterns should be treated as single entities
  nlp.learnCustomEntities([
    { name: 'deadline', patterns: ['[by|due|on] [DATE|DURATION]'] },
    { name: 'financial', patterns: ['[|price|cost|budget] [of] [MONEY]'] },
    { name: 'action_verb', patterns: ['[please|kindly] [check|review|approve|submit|send]'] }
  ])

  return nlp
}
