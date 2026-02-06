import { ENV } from "../config.js";

const PREFIX = "[Gmail TLDR]";

export const logger = {
  log: (message: string, data?: unknown) => {
    console.log(`${PREFIX} ${message}`, data);
  },
  info: (message: string, data?: unknown) => {
    console.info(`${PREFIX} ${message}`, data);
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`${PREFIX} ${message}`, data);
  },
  error: (message: string, error?: unknown) => {
    console.error(`${PREFIX} ${message}`, error);
  },
  debug: (message: string, data?: unknown) => {
    if (ENV === "development") {
      console.log(`${PREFIX} ${message}`, data);
    }
  },
};
