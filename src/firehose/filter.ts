import { LabelEvent } from "./decoder.js";
import { config } from "../config/index.js";
import { logger } from "../logger/index.js";

export class LabelFilter {
  private allowedLabels: Set<string> | null;

  constructor(allowedLabels?: string[]) {
    const labels = allowedLabels ?? config.filtering.captureLabels;

    if (labels && labels.length > 0) {
      this.allowedLabels = new Set(labels);
      logger.info(
        { labels: Array.from(this.allowedLabels) },
        "Label filtering enabled"
      );
    } else {
      this.allowedLabels = null;
      logger.info("Label filtering disabled - capturing all labels");
    }
  }

  shouldCapture(label: LabelEvent): boolean {
    if (this.allowedLabels === null) {
      return true;
    }

    const shouldCapture = this.allowedLabels.has(label.val);

    if (!shouldCapture) {
      logger.debug({ val: label.val }, "Label filtered out");
    }

    return shouldCapture;
  }

  getFilteredLabels(): string[] | null {
    return this.allowedLabels ? Array.from(this.allowedLabels) : null;
  }
}
