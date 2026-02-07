# Implementation Notes

## Message Contracts

**Service Worker ↔ Popup:**

- `SYNC_STATUS`: Broadcast sync state (idle, syncing, error)
- `NEW_EMAILS`: Broadcast processed emails with summaries and labels
- `TRIGGER_SYNC_NOW`: Manual sync request from popup
- `CLEAR_HISTORY`: Clear stored history on user request

**Service Worker ↔ Offscreen:**

- `PROCESS_EMAIL`: Send email body for NLP pre-filtering
- `PROCESSED_EMAIL_RESULT`: Return filtered text, labels, and metadata

## Why Two-Stage NLP?

1. **Wink (deterministic, cheap)**: Removes boilerplate using patterns. ~100ms per email.
2. **Gemini Nano (statistical, expensive in tokens)**: Summarizes filtered content only. ~300ms per email + token cost.

**Benefit**: By pre-filtering with Wink, you reduce token consumption to Gemini by 40-60%, cutting both cost and latency.

### Why Offscreen Document?

Chrome Extension restrictions prevent running complex DOM-dependent libraries in service workers. The offscreen document:

- Runs in a sandbox with access to `document`
- Enables Wink NLP (which internally uses the DOM for text parsing)
- Stays lightweight and isolated from the main UI
- Communicates via type-safe message passing

## Pattern Design Philosophy

Email patterns (in `lib/nlp/emailPatterns.ts`) mix:

- **Literal tokens**: `[best] [regards]`, `[unsubscribe]`
- **POS tags**: `[VERB]`, `[NOUN]`, `[DATE]` (from Wink's Universal POS tagset)
- **Negation patterns**: `[|ADJ]` (optional adjective)

This allows surgical pattern matching without full regex complexity:

- `[by] DATE` matches "by March 15" or "by 2026-03-15"
- `[sent] [from] [my] [NOUN]` matches "sent from my iPhone", "sent from my desktop"
- `[can] [you] [please] [VERB]` matches "can you please review", "can you please approve", etc.

## Diagnostic Flow (If "(No summary)" Appears)

**Root Causes & Fixes:**

```mermaid
graph TD
    A["Email processed"] --> B{"Offscreen<br/>responding?"}
    B -->|✓| C{"Gemini Nano<br/>available?"}
    B -->|✗| B1["✗ Missing permission<br/>manifest: offscreen"]
    B1 --> B2["✗ Reload extension<br/>or add permission"]
    B2 --> B

    C -->|✓| D{"Summary text<br/>generated?"}
    C -->|✗| C1["✗ Chrome version < 123<br/>OR"]
    C1 --> C2["✗ Flag disabled:<br/>optimization-guide-on-device-model"]
    C2 --> C3["Enable flag & restart Chrome"]
    C3 --> C

    D -->|✓| E["Popup open?"]
    D -->|✗| D1["Check logs in<br/>Service Worker console"]
    D1 --> D

    E -->|✓| F["✓ Summary displays"]
    E -->|✗| G["Open popup &<br/>click Sync Now"]
    G --> F

    classDef default fill:#003366,stroke:#003300,stroke-width:2px,color:#fff;
    class B1,C1,C2,D1 default;
    classDef if fill:#ffff00,stroke:#ffff00,stroke-width:2px,color:#000;
    class B,C,D if;
    classDef io fill:#339966,stroke:#339900,stroke-width:2px,color:#fff;
    class A,F io;
```
