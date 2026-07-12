/**
 * Parse an SSE stream from the chat API.
 * Calls onContent/onStatus/onError as events arrive, keeping parsing logic
 * out of the UI component.
 */
export interface StreamCallbacks {
  onContent: (text: string) => void;
  onStatus: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<void> {
  const decoder = new TextDecoder();
  // Carries a partial trailing line across reads so events split between
  // chunks aren't dropped.
  let buffer = "";

  const dispatchLine = (line: string) => {
    if (!line.startsWith("data: ")) return;

    let data: { type?: string; content?: string };
    // Parse in its own narrow try/catch so callback errors (e.g. onError
    // throwing to surface server errors) propagate instead of being swallowed.
    try {
      data = JSON.parse(line.slice(6));
    } catch {
      // Skip invalid JSON lines
      return;
    }

    switch (data.type) {
      case "content":
        callbacks.onContent(data.content ?? "");
        break;
      case "status":
        callbacks.onStatus(data.content ?? "");
        break;
      case "error":
        callbacks.onError(data.content ?? "Unknown error");
        break;
      case "done":
        callbacks.onDone();
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // stream: true keeps multibyte characters split across chunks intact
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      dispatchLine(line);
    }
  }

  // Flush any bytes still held by the decoder and the final unterminated line
  buffer += decoder.decode();
  if (buffer) dispatchLine(buffer);
}
