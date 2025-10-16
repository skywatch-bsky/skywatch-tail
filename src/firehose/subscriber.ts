import WebSocket from "ws";
import { EventEmitter } from "events";
import { config } from "../config/index.js";
import { logger } from "../logger/index.js";
import {
  decodeFirehoseMessage,
  extractLabelFromMessage,
  validateLabel,
  LabelEvent,
} from "./decoder.js";
import { LabelFilter } from "./filter.js";
import * as fs from "fs/promises";
import * as path from "path";

const CURSOR_FILE = path.join(config.database.path, "..", "cursor.txt");

export interface SubscriberEvents {
  label: (label: LabelEvent) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: () => void;
}

export class FirehoseSubscriber extends EventEmitter {
  private ws: WebSocket | null = null;
  private filter: LabelFilter;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private baseReconnectDelay = 1000;
  private shouldReconnect = true;
  private cursor: number | null = null;

  constructor() {
    super();
    this.filter = new LabelFilter();
  }

  async start(): Promise<void> {
    await this.loadCursor();
    this.connect();
  }

  private async loadCursor(): Promise<void> {
    try {
      const data = await fs.readFile(CURSOR_FILE, "utf-8");
      this.cursor = parseInt(data.trim(), 10);
      logger.info({ cursor: this.cursor }, "Loaded cursor from file");
    } catch (error) {
      logger.info("No existing cursor found, starting from beginning");
      this.cursor = null;
    }
  }

  private async saveCursor(cursor: number): Promise<void> {
    try {
      await fs.writeFile(CURSOR_FILE, cursor.toString(), "utf-8");
      this.cursor = cursor;
    } catch (error) {
      logger.error({ error }, "Failed to save cursor");
    }
  }

  private connect(): void {
    const url = new URL(config.labeler.wssUrl);
    if (this.cursor !== null) {
      url.searchParams.set("cursor", this.cursor.toString());
    }

    logger.info({ url: url.toString() }, "Connecting to firehose");

    this.ws = new WebSocket(url.toString());

    this.ws.on("open", () => {
      logger.info("Connected to firehose");
      this.reconnectAttempts = 0;
      this.emit("connected");
    });

    this.ws.on("message", async (data: Buffer) => {
      try {
        const message = decodeFirehoseMessage(data);
        if (!message) return;

        if (message.t === "#info") {
          logger.debug({ message }, "Received info message");
          return;
        }

        const label = extractLabelFromMessage(message);
        if (!label) return;

        if (!validateLabel(label)) return;

        if (!this.filter.shouldCapture(label)) return;

        this.emit("label", label);

        if (message.seq) {
          await this.saveCursor(message.seq);
        }
      } catch (error) {
        logger.error({ error }, "Error processing message");
      }
    });

    this.ws.on("error", (error) => {
      logger.error({ error }, "WebSocket error");
      this.emit("error", error);
    });

    this.ws.on("close", (code, reason) => {
      logger.warn({ code, reason: reason.toString() }, "WebSocket closed");
      this.ws = null;
      this.emit("disconnected");

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    logger.info(
      { delay, attempt: this.reconnectAttempts },
      "Scheduling reconnection"
    );

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  stop(): void {
    this.shouldReconnect = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.info("Firehose subscriber stopped");
  }
}
