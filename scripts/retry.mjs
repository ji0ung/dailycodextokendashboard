export async function withRetry(operation, options = {}) {
  const attempts = options.attempts || 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
  lastError.attempts = attempts;
  throw lastError;
}
