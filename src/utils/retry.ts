import { logger } from "../logger/index.js";

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: ((error: any) => boolean)[];
}

export class RetryError extends Error {
  constructor(
    message: string,
    public attempts: number,
    public lastError: Error
  ) {
    super(message);
    this.name = "RetryError";
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableErrors = [(error) => true],
  } = config;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable = retryableErrors.some((check) => check(lastError));

      if (!isRetryable || attempt >= maxAttempts) {
        throw new RetryError(
          `Operation failed after ${attempt} attempts`,
          attempt,
          lastError
        );
      }

      logger.warn(
        {
          attempt,
          maxAttempts,
          delay,
          error: lastError.message,
        },
        "Retrying after error"
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw new RetryError(
    `Operation failed after ${maxAttempts} attempts`,
    maxAttempts,
    lastError!
  );
}

export function isRateLimitError(error: any): boolean {
  return (
    error?.status === 429 ||
    error?.message?.toLowerCase().includes("rate limit") ||
    error?.message?.toLowerCase().includes("too many requests")
  );
}

export function isNetworkError(error: any): boolean {
  return (
    error?.code === "ECONNRESET" ||
    error?.code === "ENOTFOUND" ||
    error?.code === "ETIMEDOUT" ||
    error?.message?.toLowerCase().includes("network") ||
    error?.message?.toLowerCase().includes("timeout")
  );
}

export function isServerError(error: any): boolean {
  return error?.status >= 500 && error?.status < 600;
}
