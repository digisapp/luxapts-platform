/**
 * Race a promise against a deadline. The underlying work is not cancelled
 * (it keeps running until the function instance ends), but the caller gets
 * control back in time to record a failure and finish its own bookkeeping.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operation timed out"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}
