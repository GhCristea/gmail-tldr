import {
  extractBody,
  extractEmailData,
} from "../lib/gmail";
import type { GmailMessage } from "../lib/types";

describe("Gmail utilities", () => {
  describe("extractBody", () => {
    it("should extract plain text body", () => {
      const payload = {
        body: {
          data: "SGVsbG8gV29ybGQ=", // "Hello World" in base64
        },
      };
      const result = extractBody(payload);
      expect(result).toBe("Hello World");
    });

    it("should return fallback text for missing body", () => {
      const payload = { parts: [] };
      const result = extractBody(payload);
      expect(result).toBe("(No body content)");
    });
  });

  describe("extractEmailData", () => {
    it("should extract email metadata from message", () => {
      const message: GmailMessage = {
        id: "test-id",
        threadId: "test-thread",
        snippet: "This is a test email",
        payload: {
          headers: [
            { name: "Subject", value: "Test Email" },
            { name: "From", value: "sender@example.com" },
            { name: "To", value: "recipient@example.com" },
            { name: "Date", value: "Fri, 06 Feb 2026 12:00:00 +0000" },
          ],
        },
      };

      const result = extractEmailData(message);

      expect(result.id).toBe("test-id");
      expect(result.subject).toBe("Test Email");
      expect(result.from).toBe("sender@example.com");
      expect(result.to).toBe("recipient@example.com");
      expect(result.snippet).toBe("This is a test email");
    });

    it("should use defaults for missing headers", () => {
      const message: GmailMessage = {
        id: "test-id",
        threadId: "test-thread",
        snippet: "Test",
        payload: {
          headers: [],
        },
      };

      const result = extractEmailData(message);

      expect(result.subject).toBe("(No Subject)");
      expect(result.from).toBe("Unknown Sender");
    });
  });
});
