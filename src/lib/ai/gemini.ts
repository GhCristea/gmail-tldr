import { SummaryResult, EmailContext } from './types'
import { PROMPT } from '../constants'
import { logger } from '../logger'

declare global {
  class LanguageModel {
    static create(options?: AIModelOptions): Promise<AILanguageModel>
    static capabilities(): Promise<AICapabilities>
  }

  interface AIModelOptions {
    systemPrompt?: string
    expectedLanguage?: string
    temperature?: number
    topK?: number
  }

  interface AICapabilities {
    available: 'readily' | 'after-download' | 'no'
    defaultTemperature?: number
    defaultTopK?: number
  }

  interface AILanguageModel {
    prompt(text: string, options?: { signal?: AbortSignal }): Promise<string>
    destroy(): void
    countTokens?(text: string): Promise<number>
  }
}

export class GeminiNanoService {
  private session: AILanguageModel | null = null

  private config: AIModelOptions = {
    expectedLanguage: 'en',
    temperature: 0.7,
    topK: 3,
    systemPrompt:
      'Act as a digital assistant to quickly summarize and extract key information from the given email.'
  }

  constructor(config: Partial<AIModelOptions> = {}) {
    this.config = { ...this.config, ...config }
  }

  async initialize(): Promise<void> {
    if (this.session) return

    try {
      if (typeof LanguageModel === 'undefined') {
        throw new Error('LanguageModel API is not available in this browser.')
      }

      logger.log('Creating Gemini session...')
      this.session = await LanguageModel.create(this.config)
      logger.log('Gemini session created.')
    } catch (error) {
      logger.error('Failed to initialize Gemini:', error)
      this.session = null
      throw error
    }
  }

  async summarize(text: string, context?: EmailContext): Promise<SummaryResult> {
    if (!text?.trim()) return { text: '(Empty email)' }

    try {
      if (!this.session) await this.initialize()
      if (!this.session) throw new Error('Session creation failed')

      const prompt = this.buildPrompt(text, context)

      logger.log(`Prompting Gemini (${prompt.length} chars)...`)

      const response = await this.session.prompt(prompt)
      const cleanResponse = response.trim()

      return {
        text: cleanResponse,

        tokensUsed: Math.ceil(cleanResponse.length / 4)
      }
    } catch (error) {
      logger.error('Summarization failed:', error)
      return { text: `(Error: ${error instanceof Error ? error.message : 'Unknown'})` }
    }
  }

  private buildPrompt(text: string, context?: EmailContext): string {
    const meta = [
      context?.subject ? `Subject: ${context.subject}` : '',
      context?.from ? `From: ${context.from}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    const cleanText = text.slice(0, 4000)

    return `
${meta}

Task: ${PROMPT}

<email_content>
${cleanText}
</email_content>
`.trim()
  }
}
