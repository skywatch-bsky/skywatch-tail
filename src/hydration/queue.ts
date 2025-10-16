import { EventEmitter } from "events";
import { logger } from "../logger/index.js";

export interface HydrationTask {
  type: "post" | "profile";
  identifier: string;
}

export class HydrationQueue extends EventEmitter {
  private queue: HydrationTask[] = [];
  private processing = false;
  private processingTask: HydrationTask | null = null;

  enqueue(task: HydrationTask): void {
    const isDuplicate = this.queue.some(
      (t) => t.type === task.type && t.identifier === task.identifier
    );

    if (isDuplicate) {
      logger.debug(
        { type: task.type, identifier: task.identifier },
        "Skipping duplicate task"
      );
      return;
    }

    if (
      this.processingTask?.type === task.type &&
      this.processingTask?.identifier === task.identifier
    ) {
      logger.debug(
        { type: task.type, identifier: task.identifier },
        "Task already being processed"
      );
      return;
    }

    this.queue.push(task);
    logger.debug(
      { type: task.type, identifier: task.identifier, queueSize: this.queue.length },
      "Task enqueued"
    );

    if (!this.processing) {
      this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    this.processingTask = this.queue.shift()!;

    logger.debug(
      {
        type: this.processingTask.type,
        identifier: this.processingTask.identifier,
        remaining: this.queue.length,
      },
      "Processing task"
    );

    this.emit("task", this.processingTask);

    setTimeout(() => {
      this.processingTask = null;
      this.processNext();
    }, 100);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
    this.processing = false;
    this.processingTask = null;
    logger.info("Hydration queue cleared");
  }
}
