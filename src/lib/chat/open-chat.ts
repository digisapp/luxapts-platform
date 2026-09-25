/**
 * Opens the Stacy chat panel from anywhere on the page (e.g. the building
 * page's sticky bottom bar, which replaces the floating bubble on phones).
 * ChatWidget listens for this event.
 */
export const OPEN_CHAT_EVENT = "staycio:open-chat";

export function openChat() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
