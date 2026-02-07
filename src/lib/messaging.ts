import type { Message, Sender, Receiver } from './types.js'

export function sendMessage<
  From extends Sender = Sender,
  To extends Receiver<From> = Receiver<From>,
  Response = unknown
>(message: Message<From, To>): Promise<Response> {
  return chrome.runtime.sendMessage(message)
}

export function listenForMessages<From extends Sender = Sender, To extends Receiver<From> = Receiver<From>>(
  handler: (message: Message<From, To>, sender: chrome.runtime.MessageSender) => void
) {
  chrome.runtime.onMessage.addListener(handler)
}
