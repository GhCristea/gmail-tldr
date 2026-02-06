/**
 * AI Service abstraction using Strategy pattern
 * Allows switching between Gemini Nano, OpenAI, Claude, or mock providers
 */

/**
 * Configuration for AI service initialization
 */
export interface AIConfig {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Summarization result with metadata
 */
export interface SummaryResult {
  text: string;
  provider: AIProvider;
  tokensUsed?: number;
  isLocal: boolean;
}

/**
 * Generic AI Service contract
 * Different implementations (Gemini, OpenAI, etc.) conform to this interface
 */
export interface AIService {
  /**
   * Check if the AI service is available on this device
   * e.g., Gemini Nano checks for chrome.ai support
   */
  isAvailable(): Promise<boolean>;

  /**
   * Initialize the service (if needed)
   * e.g., Gemini creates a session, OpenAI validates API key
   */
  initialize(): Promise<void>;

  /**
   * Generate a summary from input text
   * @param text Input text to summarize (e.g., email body)
   * @param context Additional context (e.g., subject, sender)
   * @returns Summary result with metadata
   */
  summarize(text: string, context?: EmailContext): Promise<SummaryResult>;

  /**
   * Clean up resources (if needed)
   * e.g., Gemini destroys session, OpenAI closes connections
   */
  destroy(): Promise<void>;
}

/**
 * Email metadata for better summarization context
 */
export interface EmailContext {
  subject?: string;
  from?: string;
  to?: string;
  labels?: string[];
}

/**
 * Supported AI providers
 */
export type AIProvider = "gemini-nano" | "openai" | "claude" | "mock";

/**
 * Factory function to create AI service based on provider
 */
export type AIServiceFactory = (provider: AIProvider, config?: AIConfig) => AIService;
