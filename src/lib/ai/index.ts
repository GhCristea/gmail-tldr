/**
 * AI Service module barrel export
 */
export type { AIService, AIConfig, SummaryResult, EmailContext, AIProvider, AIServiceFactory } from "./types.js";
export { GeminiNanoService, MockAIService } from "./gemini.js";
export { createAIService, getBestAvailableAIService } from "./factory.js";
