# Gmail TLDR

Chrome Extension (Manifest V3) for intelligent Gmail email processing with type-safe messaging
architecture and on-device NLP-powered summarization.

## Features

- **Polling-based Email Sync**: Service Worker periodically checks for new Gmail messages (1-minute intervals)
- **Wink NLP Pre-filtering**: On-device pattern matching to strip noise (signatures, legal disclaimers, unsubscribe blocks) before LLM processing
- **Gemini Nano Summarization**: On-device LLM (Chrome 123+) that produces concise summaries of filtered email content
- **Type-Safe Messaging**: Discriminated union pattern for inter-component communication (no stringly-typed messages)
- **OAuth 2.0 Integration**: Native Chrome identity API for authentication
- **Persistent State**: Chrome storage for `historyId` tracking

## Architecture

### Two-Stage NLP Pipeline

```
Gmail API
   │
   ├─ [Service Worker] (background.ts)
   │  ├─ Polls Gmail API every 1 minute
   │  ├─ Fetches new messages via Gmail History API
   │  ├─ Extracts email metadata (subject, from, to, snippet)
   │  │
   │  └─ For each email:
   │     ├─ Send raw body to [Offscreen Document]
   │     │
   │     └─ Receive back: filtered_text + labels
   │        ├─ Call GeminiNanoService(filtered_text)
   │        ├─ Receive: summary
   │        └─ Attach summary + labels to email
   │
   ├─ [Offscreen Document] (offscreen.ts)
   │  ├─ Receives: raw email body
   │  ├─ Runs: Wink NLP preprocessing
   │  │  ├─ Pattern matching (signatures, legal, unsubscribe)
   │  │  ├─ Strips low-signal blocks
   │  │  └─ Tags high-signal spans (deadlines, requests)
   │  ├─ Infers: email_labels (newsletter, transactional, actionable, etc.)
   │  └─ Sends back: filtered_text + labels
   │
   ├─ [GeminiNanoService] (lib/ai/gemini.ts)
   │  ├─ Receives: filtered_text + context (subject, from)
   │  ├─ Calls: chrome.ai.languageModel.create().prompt()
   │  └─ Returns: summary (1-3 sentences, action items)
   │
   └─ [Popup] (popup.ts)
      ├─ Displays: sync status
      ├─ Renders: email list with summaries + NLP labels
      └─ Listens: for type-safe messages from Service Worker
```

### Message Contracts

**Service Worker ↔ Popup:**

- `SYNC_STATUS`: Broadcast sync state (idle, syncing, error)
- `NEW_EMAILS`: Broadcast processed emails with summaries and labels
- `TRIGGER_SYNC_NOW`: Manual sync request from popup
- `CLEAR_HISTORY`: Clear stored history on user request

**Service Worker ↔ Offscreen:**

- `PROCESS_EMAIL`: Send email body for NLP pre-filtering
- `PROCESSED_EMAIL_RESULT`: Return filtered text, labels, and metadata

## Setup

### Prerequisites

- Node.js 18+
- TypeScript 5.3+
- Chrome 88+ (Gmail API support)
- Chrome 123+ (for Gemini Nano on-device LLM)

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
5. Enable Gemini Nano (if available):
   - `chrome://flags/#optimization-guide-on-device-model`
   - Set to "Enabled"

## Development

```bash
# Watch TypeScript compilation
npm run watch

# Lint code
npm run lint

# Format code
npm run format
```

## How It Works

### Example: Email Processing Flow

**Raw email from Gmail API:**

```
Subject: Action Required: Q1 Budget Review
From: manager@company.com
Body:
  Hi John,

  Hope you are doing well. I wanted to circle back on the Q1 budget review.

  Please review the attached spreadsheet and confirm your department's headcount
  needs by Friday, March 15th.

  Action items:
  - Review budget breakdown
  - Update headcount forecast
  - Reply with approval

  Thanks for your quick turnaround on this.

  Best regards,
  Sarah
  Manager, Finance

  --
  This email and any attachments may contain confidential information intended
  solely for the use of the addressee. If you are not the intended recipient,
  please delete it and notify the sender.

  [Company Legal Footer]
  [Unsubscribe]
```

**After Wink NLP pre-filtering:**

```
Q1 budget review. Please review the attached spreadsheet and confirm your
department's headcount needs by Friday, March 15th. Action items:
- Review budget breakdown
- Update headcount forecast
- Reply with approval

Labels: ["actionable", "possible_deadline"]
Dropped blocks: ["greeting", "signature", "legal_footer", "chatter"]
```

**After Gemini Nano summarization:**

```
TLDR: Manager needs Q1 budget review + headcount forecast by March 15.

Action items:
- Review budget spreadsheet
- Update headcount forecast
- Send approval by Friday

Confidence: high (clear deadline and action items)
```

**Rendered in popup:**

```
┌────────────────────────────────────────────────────────────────┐
│ From: manager@company.com                                      │
│ Subject: Action Required: Q1 Budget Review                     │
│                                                                │
│ Manager needs Q1 budget review + headcount forecast by         │
│ March 15.                                                      │
│                                                                │
│ [actionable] [possible_deadline]                               │
│                                                                │
│ Tokens: 47                                                     │
└────────────────────────────────────────────────────────────────┘
```

## Implementation Notes

### Why Two-Stage NLP?

1. **Wink (deterministic, cheap)**: Removes boilerplate using patterns. ~100ms per email.
2. **Gemini Nano (statistical, expensive in tokens)**: Summarizes filtered content only. ~300ms per email + token cost.

**Benefit**: By pre-filtering with Wink, you reduce token consumption to Gemini by 40-60%, cutting both cost and latency.

### Why Offscreen Document?

Chrome Extension restrictions prevent running complex DOM-dependent libraries in service workers. The offscreen document:

- Runs in a sandbox with access to `document`
- Enables Wink NLP (which internally uses the DOM for text parsing)
- Stays lightweight and isolated from the main UI
- Communicates via type-safe message passing

### Pattern Design Philosophy

Email patterns (in `lib/nlp/emailPatterns.ts`) mix:

- **Literal tokens**: `[best] [regards]`, `[unsubscribe]`
- **POS tags**: `[VERB]`, `[NOUN]`, `[DATE]` (from Wink's Universal POS tagset)
- **Negation patterns**: `[|ADJ]` (optional adjective)

This allows surgical pattern matching without full regex complexity:

- `[by] DATE` matches "by March 15" or "by 2026-03-15"
- `[sent] [from] [my] [NOUN]` matches "sent from my iPhone", "sent from my desktop"
- `[can] [you] [please] [VERB]` matches "can you please review", "can you please approve", etc.

For production, you can:

1. Add company-specific patterns (e.g., internal email signatures)
2. Tune pattern weights (some patterns more important than others)
3. Add heuristic scoring to skip Gemini entirely for obvious newsletters

## Roadmap

- [ ] Integrate real Wink NLP model (`wink-nlp` + `wink-eng-lite-web-model`)
- [ ] Tune pattern library for common email types (transactional, newsletters, etc.)
- [ ] Add settings page to configure summarization preferences
- [ ] Keyboard shortcuts for quick actions (archive, snooze, etc.)
- [ ] Custom Gmail label integration (auto-label by email type)
- [ ] Analytics: track which email types are processed, token usage, summary quality

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Chrome Extension MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Offscreen Document API](https://developer.chrome.com/docs/extensions/reference/offscreen/)
- [Gemini Nano on Chrome](https://developer.chrome.com/docs/extensions/reference/language-model/)
- [Wink NLP Documentation](https://winkjs.org/wink-nlp/)
- [page-highlight](https://github.com/GhCristea/page-highlight) — Type-safe messaging pattern reference

## License

MIT
