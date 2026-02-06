/**
 * Logging utilities with consistent formatting
 */

const PREFIX = "[Gmail TLDR]";

export const logger = {
  log: (message: string, data?: any) => {
    console.log(`${PREFIX} ${message}`, data);
  },
  info: (message: string, data?: any) => {
    console.info(`${PREFIX} ${message}`, data);
  },
  warn: (message: string, data?: any) => {
    console.warn(`${PREFIX} ${message}`, data);
  },
  error: (message: string, error?: any) => {
    console.error(`${PREFIX} ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    if (process.env.DEBUG) {
      console.debug(`${PREFIX} ${message}`, data);
    }
  },
};
