/**
 * Email-specific NLP patterns for Wink.
 * Inspired by winkjs showcase writing assistant wordinessList.
 * Patterns mix literals and Universal POS tags (NOUN, VERB, ADJ, etc.).
 * Used to pre-filter email bodies before LLM calls.
 */

export interface PatternGroup {
  name: string
  patterns: string[]
}

export const emailPatterns: PatternGroup[] = [
  {
    name: 'signatureBlock',
    patterns: [
      '[best] [regards]',
      '[kind] [regards]',
      '[warm] [regards]',
      '[sincerely]',
      '[cheers]',
      '[thanks] [again]',
      '[thank] [you] [in] [advance]',
      '[sent] [from] [my] [NOUN]'
    ]
  },
  {
    name: 'legalFooter',
    patterns: [
      '[this] [email] [and] [any] [attachments]',
      '[this] [message] [and] [any] [attachments]',
      '[may] [contain] [confidential] [information]',
      '[intended] [solely] [for] [the] [use] [of]',
      '[if] [you] [are] [not] [the] [intended] [recipient]',
      '[do] [not] [disclose] [copy] [or] [distribute]',
      '[please] [delete] [it] [and] [notify]',
      '[no] [liability] [for] [any] [loss]'
    ]
  },
  {
    name: 'unsubscribeBlock',
    patterns: [
      '[unsubscribe]',
      '[manage] [your] [preferences]',
      '[update] [your] [preferences]',
      '[view] [this] [email] [in] [your] [browser]',
      '[you] [are] [receiving] [this] [email] [because]',
      '[if] [you] [no] [longer] [wish] [to] [receive]',
      '[click] [here] [to] [unsubscribe]',
      '[marketing] [communications]'
    ]
  },
  {
    name: 'deadlinePhrase',
    patterns: [
      '[by] DATE',
      '[before] DATE',
      '[due] [by] DATE',
      '[deadline] [is] DATE',
      '[please] [respond] [by] DATE',
      '[can] [we] [meet] [on] DATE'
    ]
  },
  {
    name: 'requestPhrase',
    patterns: [
      '[can] [you] [please] [VERB]',
      '[could] [you] [VERB]',
      '[please] [review]',
      '[please] [approve]',
      '[please] [confirm]',
      '[please] [let] [me] [know]',
      '[we] [need] [to] [VERB]',
      '[action] [required]',
      '[requires] [your] [attention]'
    ]
  },
  {
    name: 'chatter',
    patterns: [
      '[hope] [you] [are] [doing] [well]',
      '[hope] [this] [email] [finds] [you] [well]',
      '[happy] [to] [help]',
      '[just] [wanted] [to] [check] [in]',
      '[just] [following] [up]',
      '[touching] [base]'
    ]
  },
  {
    name: 'transactional',
    patterns: [
      '[order] [confirmation]',
      '[your] [order] [has] [been] [VERB]',
      '[invoice] CARDINAL',
      '[payment] [receipt]',
      '[your] [subscription] [has] [been] [VERB]',
      '[your] [password] [has] [been] [reset]',
      '[security] [alert]'
    ]
  }
]
