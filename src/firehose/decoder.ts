import { decodeFirst } from "@atcute/cbor";
import { logger } from "../logger/index.js";

export interface LabelEvent {
  ver?: number;
  src: string;
  uri: string;
  cid?: string;
  val: string;
  neg?: boolean;
  cts: string;
  exp?: string;
  sig?: Uint8Array;
}

export interface FirehoseMessage {
  op?: number;
  t?: string;
  seq?: number;
  labels?: LabelEvent[];
  [key: string]: any;
}

export function decodeFirehoseMessage(data: Buffer): FirehoseMessage | null {
  try {
    const buffer = new Uint8Array(data);
    const [header, remainder] = decodeFirst(buffer);
    const [body] = decodeFirst(remainder);

    return body as FirehoseMessage;
  } catch (err) {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
        dataLength: data.length,
        dataPreview: data.slice(0, 50).toString("hex")
      },
      "Failed to decode CBOR message"
    );
    return null;
  }
}

export function extractLabelsFromMessage(message: FirehoseMessage): LabelEvent[] {
  if (!message) {
    return [];
  }

  if (message.labels && Array.isArray(message.labels)) {
    return message.labels;
  }

  return [];
}

export function validateLabel(label: LabelEvent): boolean {
  if (!label.src || !label.uri || !label.val || !label.cts) {
    logger.warn({ label }, "Invalid label: missing required fields");
    return false;
  }

  return true;
}
