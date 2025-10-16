import { logger } from "../logger/index.js";

export interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
  refillInterval: number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervals = Math.floor(elapsed / this.config.refillInterval);

    if (intervals > 0) {
      this.tokens = Math.min(
        this.config.maxTokens,
        this.tokens + intervals * this.config.refillRate
      );
      this.lastRefill = now;
    }
  }

  async acquire(tokens: number = 1): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }

      const waitTime = this.config.refillInterval;
      logger.debug(
        { tokens, available: this.tokens, waitTime },
        "Rate limit reached, waiting"
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
  }
}

export class MultiRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor(
    private defaultConfig: RateLimiterConfig
  ) {}

  setLimiter(key: string, config: RateLimiterConfig): void {
    this.limiters.set(key, new RateLimiter(config));
  }

  async acquire(key: string, tokens: number = 1): Promise<void> {
    let limiter = this.limiters.get(key);
    if (!limiter) {
      limiter = new RateLimiter(this.defaultConfig);
      this.limiters.set(key, limiter);
    }
    await limiter.acquire(tokens);
  }

  reset(key?: string): void {
    if (key) {
      this.limiters.get(key)?.reset();
    } else {
      for (const limiter of this.limiters.values()) {
        limiter.reset();
      }
    }
  }
}
