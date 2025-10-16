export interface List {
  label: string;
  rkey: string;
}

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

export interface CacheKey {
  did: string;
  label: string;
  neg: boolean;
}
