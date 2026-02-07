export interface SummaryResult {
  text: string
  tokensUsed?: number
}

export interface EmailContext {
  subject?: string
  from?: string
  to?: string
  labels?: string[]
}
