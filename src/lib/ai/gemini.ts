import { AIConfig, SummaryResult, EmailContext } from './types.js'
import { PROMPT } from '../constants.js'
import { logger } from '../logger.js'

/**
 * Chrome's built-in AI API types (experimental)
 * Available in Chrome 123+ with chrome.ai origin trial
 */
declare global {
  interface Window {
    ai?: {
      languageModel?: {
        capabilities(): Promise<{ available: 'readily' | 'after-download' | 'no' }>
        create(options?: { topK?: number; temperature?: number; systemPrompt?: string }): Promise<AILanguageModel>
      }
    }
  }
  interface AILanguageModel {
    prompt(text: string, options?: { signal?: AbortSignal }): Promise<string>
    countTokens(text: string): Promise<number>
    destroy(): Promise<void>
  }
}

/**
 * Gemini Nano Service - Direct implementation
 * Chrome 123+ built-in LLM
 */
export class GeminiNanoService {
  private session: AILanguageModel | null = null
  private config: AIConfig
  private initPromise: Promise<void> | null = null

  constructor(config: AIConfig = {}) {
    this.config = {
      systemPrompt:
        'Act as a digital assistant to quickly summarize and extract key information from the given email.',
      temperature: 0.7,
      ...config
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!self.ai?.languageModel) {
      logger.warn('Gemini: chrome.ai.languageModel not available')
      return false
    }

    try {
      const caps = await self.ai.languageModel.capabilities()
      const available = caps.available !== 'no'
      logger.log(`Gemini capabilities: ${caps.available} (${available ? 'available' : 'unavailable'})`)
      return available
    } catch (error) {
      logger.error('Gemini capabilities check failed:', error)
      return false
    }
  }

  async initialize(): Promise<void> {
    // Prevent multiple concurrent initialization attempts
    if (this.initPromise) {
      return this.initPromise
    }

    if (this.session) {
      logger.log('Gemini session already initialized')
      return
    }

    this.initPromise = this._performInitialization()
    return this.initPromise
  }

  private async _performInitialization(): Promise<void> {
    logger.log('Initializing Gemini Nano service...')

    const available = await this.isAvailable()
    if (!available) {
      const error =
        'Gemini Nano not available. Check: (1) Chrome 123+, (2) chrome://flags/#optimization-guide-on-device-model enabled, (3) Origin Trial enabled'
      logger.error(error)
      throw new Error(error)
    }

    try {
      logger.log('Creating Gemini session with config:', this.config)
      this.session = await self.ai!.languageModel!.create({
        systemPrompt: this.config.systemPrompt,
        temperature: this.config.temperature,
        topK: this.config.topK
      })
      logger.log('Gemini session created successfully')
    } catch (error) {
      logger.error('Failed to create Gemini session:', error)
      this.session = null
      throw error
    }
  }

  async summarize(text: string, context?: EmailContext): Promise<SummaryResult> {
    logger.log(`Summarizing text (${text.length} chars) for email from: ${context?.from || '(unknown)'}`)

    if (!text || text.trim().length === 0) {
      logger.warn('Empty text provided to summarize')
      return { text: '(Empty email)', tokensUsed: 0 }
    }

    try {
      if (!this.session) {
        await this.initialize()
      }

      if (!this.session) {
        throw new Error('Failed to initialize Gemini session')
      }

      const prompt = this.buildPrompt(text, context)
      logger.log(`Built prompt (${prompt.length} chars), calling Gemini...`)

      // 30s timeout
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      try {
        const summary = await this.session.prompt(prompt, { signal: controller.signal })
        const tokensUsed = Math.ceil(summary.length / 0.75) // Rough estimate

        logger.log(`Gemini summary received (${summary.length} chars, ~${tokensUsed} tokens)`)
        return { text: summary.trim(), tokensUsed }
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      logger.error('Gemini summarization failed:', error)
      // Return a fallback so popup doesn't show "(No summary)"
      return { text: `(Summary failed: ${error instanceof Error ? error.message : 'Unknown error'})`, tokensUsed: 0 }
    }
  }

  private buildPrompt(text: string, context?: EmailContext): string {
    const parts = []
    if (context?.subject) parts.push(`Subject: ${context.subject}`)
    if (context?.from) parts.push(`From: ${context.from}`)

    const contextStr = parts.length ? parts.join('\n') + '\n\n' : ''
    const cleanText = text.slice(0, 4000) // Simple truncation

    return `${contextStr}Task: ${PROMPT}\n\nEmail:\n${cleanText}`
  }

  async destroy(): Promise<void> {
    if (this.session) {
      try {
        await this.session.destroy()
        logger.log('Gemini session destroyed')
      } catch (error) {
        logger.error('Error destroying Gemini session:', error)
      }
    }
    this.session = null
    this.initPromise = null
  }
}
