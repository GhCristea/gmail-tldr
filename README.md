# Gmail TLDR

Chrome Extension (Manifest V3) for intelligent Gmail email processing with type-safe messaging architecture.

## Features

- **Polling-based Email Sync**: Service Worker periodically checks for new Gmail messages (1-minute intervals)
- **Type-Safe Messaging**: Discriminated union pattern for inter-component communication (no stringly-typed messages)
- **OAuth 2.0 Integration**: Native Chrome identity API for authentication
- **Persistent State**: Chrome storage for `historyId` tracking
- **Email Processing**: Extract and process new emails with full header/body support

## Architecture

```
Service Worker (background.ts)
├─ Polls Gmail API every 1 minute
├─ Processes new messages via historyId
└─ Broadcasts updates via typed messages

Popup (popup.ts)
├─ Displays sync status
├─ Shows processed emails
└─ Listens for typed messages from Service Worker

Types (src/lib/types.ts)
├─ MessageMap: Enforces message contracts
├─ Payload: Success/Error union types
└─ Sender/Receiver: Actor definitions
```

## Setup

### Prerequisites
- Node.js 18+
- TypeScript 5.3+
- Chrome 88+

### Installation

```bash
npm install
npm run build
```

### Configuration

1. Create a Google Cloud project and enable the Gmail API
2. Create OAuth 2.0 credentials for Chrome Extension
3. Update `manifest.json` with your `client_id`
4. Load the extension in Chrome:
   - `chrome://extensions/`
   - Enable "Developer mode"
   - "Load unpacked" → select `dist/` folder

## Development

```bash
# Watch TypeScript compilation
npm run watch

# Lint code
npm run lint

# Format code
npm run format
```

## Implementation Notes

### Why Polling Instead of Webhooks?

Chrome Extensions cannot listen for incoming HTTP requests. Unlike the server-based approach, e.g. `aluku7-wq/gmail-webhook`, we use `chrome.alarms` to poll the Gmail API periodically.

**Trade-off:**
- ✅ No external dependencies (no ngrok, no server)
- ✅ Works in sandbox (secure)
- ✅ Lightweight (kilobytes vs megabytes)
- ❌ Max 1-minute latency (Chrome's `alarms` minimum)

### Type Safety Pattern

Inspired by `GhCristea/page-highlight`, this project uses a discriminated union pattern to enforce message contracts at compile time.

```typescript
// Define actors
export const SERVICE_WORKER = "SERVICE_WORKER";
export const POPUP = "POPUP";

// Define the contract
export type MessageMap = {
  [SERVICE_WORKER]: {
    [POPUP]: 
      | { type: "SYNC_STATUS"; status: "syncing" | "idle" }
      | { type: "NEW_EMAILS"; data: EmailSummary[] };
  };
};

// Type-safe send
sendMessage<typeof SERVICE_WORKER, typeof POPUP>(POPUP, {
  type: "NEW_EMAILS",  // TS error if this doesn't exist in contract
  data: emails
});
```

## Roadmap

- [ ] Offscreen document for DOM parsing if needed
- [ ] Email classification/summarization
- [ ] Keyboard shortcuts
- [ ] Custom Gmail label integration
- [ ] Settings page

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Chrome Extension MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/identity/)
- [page-highlight](https://github.com/GhCristea/page-highlight) — Type-safe messaging pattern reference

## License

MIT
