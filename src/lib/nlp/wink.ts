import winkNLP, { WinkMethods } from 'wink-nlp'
import model from 'wink-eng-lite-web-model'
import { logger } from '../logger'

let nlp: WinkMethods | null = null

export function getNLP(): WinkMethods {
  if (nlp) return nlp

  logger.log('Initializing Wink NLP...')
  nlp = winkNLP(model)

  nlp.learnCustomEntities([
    { name: 'deadline', patterns: ['[by|due|on] [DATE|DURATION]'] },
    { name: 'financial', patterns: ['[|price|cost|budget] [of] [MONEY]'] },
    { name: 'action_verb', patterns: ['[please|kindly] [check|review|approve|submit|send]'] },
    { name: 'job_offer', patterns: ['[job|offer] [for] [POSITION]'] }
  ])

  return nlp
}
