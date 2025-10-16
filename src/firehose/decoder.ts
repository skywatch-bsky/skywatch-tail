import { decode as decodeCBOR } from "@atcute/cbor";
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
  op: number;
  t?: string;
  [key: string]: any;
}

export function decodeFirehoseMessage(data: Buffer): FirehoseMessage | null {
  try {
    const decoded = decodeCBOR(data);
    return decoded as FirehoseMessage;
  } catch (error) {
    logger.error({ error }, "Failed to decode CBOR message");
    return null;
  }
}

export function extractLabelFromMessage(message: FirehoseMessage): LabelEvent | null {
  if (!message || message.op !== 1) {
    return null;
  }

  if (message.t !== "#labels") {
    return null;
  }

  const labels = message.labels;
  if (!Array.isArray(labels) || labels.length === 0) {
    return null;
  }

  return labels[0] as LabelEvent;
}

export function validateLabel(label: LabelEvent): boolean {
  if (!label.src || !label.uri || !label.val || !label.cts) {
    logger.warn({ label }, "Invalid label: missing required fields");
    return false;
  }

  return true;
}
