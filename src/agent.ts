import { setGlobalDispatcher, Agent as Agent } from "undici";
setGlobalDispatcher(new Agent({ connect: { timeout: 20_000 } }));
import { BSKY_HANDLE, BSKY_PASSWORD, PDS } from "./config.js";
import { AtpAgent } from "@atproto/api";

export const agent = new AtpAgent({
  service: `https://${PDS}`,
});
export const login = () =>
  agent.login({
    identifier: BSKY_HANDLE,
    password: BSKY_PASSWORD,
  });

export const isLoggedIn = login()
  .then(() => true)
  .catch(() => false);
