import { decode, decodeFirst } from "@atcute/cbor";
import { readFileSync, writeFileSync } from "fs";
import { WSS_URL } from "./config.js";
import { logger } from "./logger.js";
import { LabelEvent } from "./types.js";

let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let cursor: string = "";
const MAX_RECONNECT_DELAY = 60000;
const INITIAL_RECONNECT_DELAY = 1000;
const CURSOR_FILE = "./cursor.txt";

function getReconnectDelay(): number {
  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY,
  );
  reconnectAttempts++;
  return delay;
}

async function handleLabelEvent(event: LabelEvent): Promise<void> {
  // Placeholder for hydration logic
  logger.info({ event }, "Received label event");
}

function saveCursor(seq: string): void {
  try {
    cursor = seq;
    writeFileSync(CURSOR_FILE, seq, "utf8");
    logger.debug({ cursor: seq }, "Saved cursor");
  } catch (err) {
    logger.warn({ err }, "Failed to save cursor");
  }
}

function loadCursor(): string {
  try {
    const saved = readFileSync(CURSOR_FILE, "utf8").trim();
    logger.info({ cursor: saved }, "Loaded cursor from file");
    return saved;
  } catch (err) {
    logger.info("No cursor file found, starting from live");
    return "";
  }
}

function parseMessage(data: any): void {
  try {
    let buffer: Uint8Array;

    if (data instanceof ArrayBuffer) {
      buffer = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      buffer = data;
    } else if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (parsed.seq) {
          saveCursor(parsed.seq.toString());
        }
        processLabels(parsed);
        return;
      } catch {
        logger.warn("Received non-JSON string message");
        return;
      }
    } else {
      processLabels(data);
      return;
    }

    const [header, remainder] = decodeFirst(buffer);
    const [body] = decodeFirst(remainder);

    if (body && typeof body === "object" && "seq" in body) {
      saveCursor(body.seq.toString());
    }

    processLabels(body);
  } catch (err) {
    logger.error({ err }, "Error parsing message");
  }
}

function processLabels(parsed: any): void {
  if (parsed.labels && Array.isArray(parsed.labels)) {
    for (const label of parsed.labels) {
      handleLabelEvent(label as LabelEvent);
    }
  } else if (parsed.label) {
    handleLabelEvent(parsed.label as LabelEvent);
  } else {
    logger.debug({ parsed }, "Message does not contain label data");
  }
}

function connect(): void {
  if (
    ws &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  ) {
    logger.debug("WebSocket already connected or connecting");
    return;
  }

  const url = cursor ? `${WSS_URL}?cursor=${cursor}` : WSS_URL;
  logger.info({ url, cursor }, "Connecting to firehose");

  ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    logger.info("Firehose connection established");
    reconnectAttempts = 0;
  });

  ws.addEventListener("message", (event) => {
    parseMessage(event.data);
  });

  ws.addEventListener("error", (event) => {
    logger.error({ event }, "Firehose WebSocket error");
  });

  ws.addEventListener("close", (event) => {
    logger.warn(
      { code: event.code, reason: event.reason },
      "Firehose connection closed",
    );
    scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  const delay = getReconnectDelay();
  logger.info({ delay, attempt: reconnectAttempts }, "Scheduling reconnect");

  reconnectTimeout = setTimeout(() => {
    connect();
  }, delay);
}

export function startFirehose(): void {
  cursor = loadCursor();
  connect();
}

export function stopFirehose(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (ws) {
    logger.info("Closing firehose connection");
    ws.close();
    ws = null;
  }
}
