/**
 * Configuration for Gemini Nano
 */
export interface AIConfig {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
}

/**
 * Summarization result
 */
export interface SummaryResult {
  text: string;
  tokensUsed?: number;
}

/**
 * Email metadata for context-aware prompting
 */
export interface EmailContext {
  subject?: string;
  from?: string;
  to?: string;
  labels?: string[];
}
