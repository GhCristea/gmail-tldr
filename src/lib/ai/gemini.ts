import { AIService, AIConfig, SummaryResult, EmailContext, AIProvider } from "./types.js";
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
 * Gemini Nano Service - Chrome's built-in on-device LLM
 * - Runs locally (0 latency, 0 cost)
 * - Privacy-focused (no network calls)
 * - Perfect for email summarization
 *
 * Availability: Chrome 123+ with chrome.ai origin trial
 */
export class GeminiNanoService implements AIService {
  private session: AILanguageModel | null = null;
  private config: AIConfig;
  private isInitialized = false;

  constructor(config: AIConfig = {}) {
    this.config = {
      systemPrompt: "You are a helpful email summarization assistant. Summarize emails in 1-2 sentences, focusing on action items and key information. Be concise and clear.",
      maxTokens: 50,
      temperature: 0.7,
      ...config,
    };
  }

  /**
   * Check if Gemini Nano is available on this device
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!self.ai?.languageModel) {
        logger.warn("Chrome AI API not available. Ensure chrome.ai origin trial is enabled.");
        return false;
      }

      const capabilities = await self.ai.languageModel.capabilities();
      const available = capabilities.available !== "no";

      if (!available) {
        logger.warn("Gemini Nano not available on this device (no = unavailable)");
      } else {
        logger.log(`Gemini Nano available: ${capabilities.available}`);
      }

      return available;
    } catch (error) {
      logger.error("Error checking Gemini Nano availability:", error);
      return false;
    }
  }

  /**
   * Initialize Gemini Nano session
   * Creates the language model session for summarization
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.session) {
      logger.log("Gemini Nano already initialized");
      return;
    }

    try {
      const available = await this.isAvailable();
      if (!available) {
        throw new Error("Gemini Nano not available on this device");
      }

      logger.log("Initializing Gemini Nano session...");
      this.session = await self.ai!.languageModel!.create({
        systemPrompt: this.config.systemPrompt,
        temperature: this.config.temperature,
      });

      this.isInitialized = true;
      logger.log("Gemini Nano session initialized successfully");
    } catch (error) {
      logger.error("Error initializing Gemini Nano:", error);
      throw error;
    }
  }

  /**
   * Generate a summary from email text using Gemini Nano
   * @param text Email body or content to summarize
   * @param context Email metadata (subject, from, etc.)
   * @returns Summary result with text and metadata
   */
  async summarize(text: string, context?: EmailContext): Promise<SummaryResult> {
    try {
      if (!this.session) {
        await this.initialize();
      }

      if (!this.session) {
        throw new Error("Failed to initialize Gemini Nano session");
      }

      // Build context-aware prompt
      const prompt = this.buildPrompt(text, context);

      // Add abort signal for timeout (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        logger.log("Calling Gemini Nano for summarization...");
        const summary = await this.session.prompt(prompt, { signal: controller.signal });

        // Count tokens used (rough estimate: ~0.75 chars per token)
        const tokensUsed = Math.ceil(summary.length / 0.75);

        logger.log("Gemini Nano summary generated", { length: summary.length, tokens: tokensUsed });

        return {
          text: summary.trim(),
          provider: "gemini-nano",
          tokensUsed,
          isLocal: true,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        logger.warn("Gemini Nano summarization timed out");
        return {
          text: "(Summarization timed out)",
          provider: "gemini-nano",
          isLocal: true,
        };
      }

      logger.error("Error during Gemini Nano summarization:", error);
      return {
        text: "(Error generating summary)",
        provider: "gemini-nano",
        isLocal: true,
      };
    }
  }

  /**
   * Build a context-aware prompt for the summarization task
   * Includes email metadata for better results
   */
  private buildPrompt(text: string, context?: EmailContext): string {
    const contextLines: string[] = [];

    if (context?.subject) {
      contextLines.push(`Subject: ${context.subject}`);
    }
    if (context?.from) {
      contextLines.push(`From: ${context.from}`);
    }
    if (context?.labels?.includes("STARRED")) {
      contextLines.push("Status: Starred (Important)");
    }

    const contextStr = contextLines.length > 0 ? `\n${contextLines.join("\n")}\n` : "";

    // Truncate text to avoid exceeding token limits (~3000 chars ≈ 4k tokens)
    const truncatedText = text.substring(0, 3000);

    return `${contextStr}\nEmail body:\n${truncatedText}\n\nSummarize this email in 1-2 sentences, focusing on key information and action items.`;
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.session) {
      try {
        await this.session.destroy();
        this.session = null;
        this.isInitialized = false;
        logger.log("Gemini Nano session destroyed");
      } catch (error) {
        logger.error("Error destroying Gemini Nano session:", error);
      }
    }
  }
}

/**
 * Mock AI Service for testing without Gemini Nano
 * Generates deterministic mock summaries
 */
export class MockAIService implements AIService {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async initialize(): Promise<void> {
    logger.log("Mock AI Service initialized");
  }

  async summarize(text: string, context?: EmailContext): Promise<SummaryResult> {
    // Deterministic mock based on email subject or text length
    const seed = context?.subject?.length || text.length;
    const mockSummaries = [
      "Meeting scheduled for next Tuesday at 2 PM. Please confirm attendance.",
      "Action required: Review and approve budget proposal by Friday.",
      "Project update: All milestones on track for Q1 delivery.",
      "Urgent: Database migration needs immediate attention.",
      "FYI: New security policy effective immediately. Review attached document.",
    ];

    const summary = mockSummaries[seed % mockSummaries.length];
    logger.log("Mock AI summary generated", { summary });

    return {
      text: summary,
      provider: "mock",
      tokensUsed: 20,
      isLocal: true,
    };
  }

  async destroy(): Promise<void> {
    logger.log("Mock AI Service destroyed");
  }
}
