import { AIService, AIServiceFactory, AIProvider, AIConfig } from "./types.js";
import { GeminiNanoService, MockAIService } from "./gemini.js";
import { logger } from "../logger.js";

/**
 * Factory for creating AI service instances
 * Implements Strategy pattern: supports multiple AI providers
 */
export const createAIService: AIServiceFactory = (
  provider: AIProvider,
  config?: AIConfig
): AIService => {
  switch (provider) {
    case "gemini-nano":
      logger.log("Creating Gemini Nano service");
      return new GeminiNanoService(config);

    case "mock":
      logger.log("Creating Mock AI service");
      return new MockAIService();

    case "openai":
    case "claude":
      logger.warn(`${provider} not yet implemented. Falling back to mock.`);
      return new MockAIService();

    default:
      const exhaustive: never = provider;
      throw new Error(`Unknown AI provider: ${exhaustive}`);
  }
};

/**
 * Get the best available AI service on this device
 * Priority: Gemini Nano > Mock
 */
export async function getBestAvailableAIService(config?: AIConfig): Promise<AIService> {
  const gemini = new GeminiNanoService(config);
  const available = await gemini.isAvailable();

  if (available) {
    logger.log("Gemini Nano available, using as primary service");
    return gemini;
  }

  logger.warn("Gemini Nano not available, falling back to Mock service");
  return new MockAIService();
}
