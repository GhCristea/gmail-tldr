import { AIConfig, SummaryResult, EmailContext } from "./types.js";
import { logger } from "../logger.js";

/**
 * Chrome's built-in AI API types (experimental)
 * Available in Chrome 123+ with chrome.ai origin trial
 */
declare global {
  interface Window {
    ai?: {
      languageModel?: {
        capabilities(): Promise<{ available: "readily" | "after-download" | "no" }>;
        create(options?: { topK?: number; temperature?: number; systemPrompt?: string }): Promise<AILanguageModel>;
      };
    };
  }
  interface AILanguageModel {
    prompt(text: string, options?: { signal?: AbortSignal }): Promise<string>;
    countTokens(text: string): Promise<number>;
    destroy(): Promise<void>;
  }
}

/**
 * Gemini Nano Service - Direct implementation
 * Chrome 123+ built-in LLM
 */
export class GeminiNanoService {
  private session: AILanguageModel | null = null;
  private config: AIConfig;

  constructor(config: AIConfig = {}) {
    this.config = {
      systemPrompt: "You are a helpful email summarization assistant. Summarize emails in 1-2 sentences, focusing on action items and key information.",
      temperature: 0.7,
      ...config,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!self.ai?.languageModel) return false;
    const caps = await self.ai.languageModel.capabilities();
    return caps.available !== "no";
  }

  async initialize(): Promise<void> {
    if (this.session) return;

    const available = await this.isAvailable();
    if (!available) {
      throw new Error("Gemini Nano not available. Enable chrome://flags/#optimization-guide-on-device-model");
    }

    this.session = await self.ai!.languageModel!.create({
      systemPrompt: this.config.systemPrompt,
      temperature: this.config.temperature,
      topK: this.config.topK
    });
  }

  async summarize(text: string, context?: EmailContext): Promise<SummaryResult> {
    if (!this.session) await this.initialize();
    if (!this.session) throw new Error("AI Session failed to initialize");

    const prompt = this.buildPrompt(text, context);
    
    // 30s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const summary = await this.session.prompt(prompt, { signal: controller.signal });
      const tokensUsed = Math.ceil(summary.length / 0.75); // Rough estimate
      
      return { text: summary.trim(), tokensUsed };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPrompt(text: string, context?: EmailContext): string {
    const parts = [];
    if (context?.subject) parts.push(`Subject: ${context.subject}`);
    if (context?.from) parts.push(`From: ${context.from}`);
    
    const contextStr = parts.length ? parts.join("\n") + "\n\n" : "";
    const cleanText = text.slice(0, 4000); // Simple truncation

    return `${contextStr}Email:\n${cleanText}\n\nTask: Summarize in 1-2 sentences.`;
  }

  async destroy(): Promise<void> {
    await this.session?.destroy();
    this.session = null;
  }
}
