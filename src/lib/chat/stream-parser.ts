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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      try {
        const data = JSON.parse(line.slice(6));

        switch (data.type) {
          case "content":
            callbacks.onContent(data.content);
            break;
          case "status":
            callbacks.onStatus(data.content);
            break;
          case "error":
            callbacks.onError(data.content);
            break;
          case "done":
            callbacks.onDone();
            break;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }
}
