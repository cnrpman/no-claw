import {
  applySystemProxy,
  installDiscordGlobalWebSocketPatch
} from "./system-proxy.js";

function log(message, details = {}) {
  const payload = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.log(`${new Date().toISOString()} ${message}${payload}`);
}

const proxyState = await applySystemProxy({ logger: log });

if (proxyState.enabled) {
  installDiscordGlobalWebSocketPatch();
  log("network.proxy.gateway", {
    mode: "global-websocket"
  });
}

await import("./app.js");
