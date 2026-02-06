import type { Message, Sender, Receiver } from "./types";

/**
 * Type-safe message sender
 * Enforces that the message conforms to the contract defined in MessageMap
 */
export function sendMessage<
  From extends Sender = Sender,
  To extends Receiver<From> = Receiver<From>
>(message: Message<From, To>): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Type-safe message listener
 * Usage: listenForMessages<typeof POPUP, typeof SERVICE_WORKER>(message => { ... })
 */
export function listenForMessages<
  From extends Sender = Sender,
  To extends Receiver<From> = Receiver<From>
>(handler: (message: Message<From, To>, sender: chrome.runtime.MessageSender) => void) {
  chrome.runtime.onMessage.addListener(handler);
}

/**
 * Send message from Service Worker to specific tab
 */
export function sendMessageToTab<
  From extends Sender = Sender,
  To extends Receiver<From> = Receiver<From>
>(tabId: number, message: Message<From, To>): Promise<any> {
  return chrome.tabs.sendMessage(tabId, message);
}
