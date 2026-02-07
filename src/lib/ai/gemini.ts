import { AIConfig, SummaryResult, EmailContext } from './types.js'
import { PROMPT } from '../constants.js'
import { logger } from '../logger.js'

/**
 * Updated Global Type Definitions for the new Prompt API
 * Matches your working console syntax: LanguageModel.create(...)
 */
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
    // Note: countTokens might not be in the global LanguageModel spec yet, 
    // keeping it simple by removing dependencies on it if not needed.
    countTokens?(text: string): Promise<number> 
  }
}

export class GeminiNanoService {
  private session: AILanguageModel | null = null
  
  // Default config with "expectedLanguage" as required by your browser
  private config: AIModelOptions = {
    expectedLanguage: 'en',
    temperature: 0.7,
    systemPrompt: 'Act as a digital assistant to quickly summarize and extract key information from the given email.'
  }

  constructor(config: Partial<AIModelOptions> = {}) {
    this.config = { ...this.config, ...config }
  }

  async initialize(): Promise<void> {
    if (this.session) return

    try {
      // Direct check for the global constructor
      if (typeof LanguageModel === 'undefined') {
        throw new Error('LanguageModel API is not available in this browser.')
      }

      const caps = await LanguageModel.capabilities()
      if (caps.available === 'no') {
        throw new Error('LanguageModel is available but model is not downloaded/ready.')
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
      
      // Sustainable DX: standardized usage tracking
      logger.log(`Prompting Gemini (${prompt.length} chars)...`)
      
      const response = await this.session.prompt(prompt)
      const cleanResponse = response.trim()
      
      return { 
        text: cleanResponse,
        // Fallback token count if countTokens() isn't available on the global instance
        tokensUsed: Math.ceil(cleanResponse.length / 4) 
      }
    } catch (error) {
      logger.error('Summarization failed:', error)
      // Separation of Concerns: Caller handles UI error states, we just return the error info
      return { text: `(Error: ${error instanceof Error ? error.message : 'Unknown'})` }
    }
  }

  /**
   * Application Security: Prompt Injection Mitigation
   * We wrap the untrusted input (email body) in XML tags so the model 
   * distinguishes instructions from data.
   */
  private buildPrompt(text: string, context?: EmailContext): string {
    const meta = [
      context?.subject ? `Subject: ${context.subject}` : '',
      context?.from ? `From: ${context.from}` : ''
    ].filter(Boolean).join('\n')

    // Truncate to avoid context window overflow (Simplicity)
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
