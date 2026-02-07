import type { Message, Sender, Receiver } from './types'

export function sendMessage<
  From extends Sender = Sender,
  To extends Receiver<From> = Receiver<From>,
  Response = unknown
>(message: Message<From, To>): Promise<Response> {
  return chrome.runtime.sendMessage(message)
}

export function listenForMessages<From extends Sender = Sender, To extends Receiver<From> = Receiver<From>>(
  handler: (
    message: Message<From, To>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => void | boolean
) {
  chrome.runtime.onMessage.addListener(handler)
}
