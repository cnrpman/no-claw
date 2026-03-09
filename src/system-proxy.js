import { execFileSync as defaultExecFileSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const PROXY_ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"];
const PROXY_TRANSPORT_ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"];
const LOOPBACK_NO_PROXY = ["localhost", "127.0.0.1", "::1"];
let undiciModulePromise = null;
let discordGlobalWebSocketPatchInstalled = false;

function readProxyEnvValue(env, key) {
  const directValue = env[key]?.trim();

  if (directValue) {
    return directValue;
  }

  const lowerValue = env[key.toLowerCase()]?.trim();
  return lowerValue || null;
}

function stripOptionalQuotes(value) {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeNoProxyEntries(entries) {
  const normalized = [];

  for (const entry of entries) {
    for (const part of String(entry).split(",")) {
      const value = stripOptionalQuotes(part.trim());

      if (value) {
        normalized.push(value);
      }
    }
  }

  return normalized;
}

function mergeNoProxyEntries(entries) {
  const seen = new Set();
  const merged = [];

  for (const entry of normalizeNoProxyEntries(entries)) {
    if (seen.has(entry)) {
      continue;
    }

    seen.add(entry);
    merged.push(entry);
  }

  return merged.join(",");
}

function buildProxyUrl(protocol, host, port) {
  if (!host || !port) {
    return null;
  }

  const normalizedHost = host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;

  return `${protocol}://${normalizedHost}:${port}`;
}

function selectHttpProxyUrl(proxyEnv) {
  if (proxyEnv.HTTPS_PROXY) {
    return proxyEnv.HTTPS_PROXY;
  }

  if (proxyEnv.HTTP_PROXY) {
    return proxyEnv.HTTP_PROXY;
  }

  if (proxyEnv.ALL_PROXY && /^https?:\/\//i.test(proxyEnv.ALL_PROXY)) {
    return proxyEnv.ALL_PROXY;
  }

  return null;
}

function resolveDiscordDependencyPath(packageName) {
  const discordEntry = require.resolve("discord.js");

  return require.resolve(packageName, {
    paths: [path.dirname(discordEntry)]
  });
}

async function loadUndiciModule() {
  undiciModulePromise ??= (async () => {
    try {
      const undiciEntry = resolveDiscordDependencyPath("undici");

      return import(pathToFileURL(undiciEntry).href);
    } catch {
      return null;
    }
  })();

  return undiciModulePromise;
}

function normalizeExplicitProxyEnv(env) {
  const proxyEnv = {};
  let hasTransportProxy = false;

  for (const key of PROXY_ENV_KEYS) {
    const value = readProxyEnvValue(env, key);

    if (value) {
      proxyEnv[key] = value;

      if (PROXY_TRANSPORT_ENV_KEYS.includes(key)) {
        hasTransportProxy = true;
      }
    }
  }

  return hasTransportProxy ? proxyEnv : null;
}

export function parseScutilProxyOutput(output) {
  const parsed = {};
  let isInsideExceptionsList = false;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line === "<dictionary> {" || line === "}") {
      if (isInsideExceptionsList && line === "}") {
        isInsideExceptionsList = false;
      }

      continue;
    }

    if (line.startsWith("ExceptionsList : <array> {")) {
      parsed.ExceptionsList = [];
      isInsideExceptionsList = true;
      continue;
    }

    if (isInsideExceptionsList) {
      const entryMatch = /^\d+\s*:\s*(.+)$/.exec(line);

      if (entryMatch) {
        parsed.ExceptionsList.push(stripOptionalQuotes(entryMatch[1].trim()));
      }

      continue;
    }

    const match = /^([A-Za-z0-9_]+)\s*:\s*(.+)$/.exec(line);

    if (match) {
      parsed[match[1]] = stripOptionalQuotes(match[2].trim());
    }
  }

  return parsed;
}

export function buildProxyEnvFromScutilSettings(settings) {
  const httpProxy = settings.HTTPEnable === "1"
    ? buildProxyUrl("http", settings.HTTPProxy, settings.HTTPPort)
    : null;
  const httpsProxy = settings.HTTPSEnable === "1"
    ? buildProxyUrl("http", settings.HTTPSProxy, settings.HTTPSPort)
    : null;
  const socksProxy = settings.SOCKSEnable === "1"
    ? buildProxyUrl("socks5", settings.SOCKSProxy, settings.SOCKSPort)
    : null;
  const proxyEnv = {};
  const hasTransportProxy = Boolean(httpProxy || httpsProxy || socksProxy);

  if (httpProxy) {
    proxyEnv.HTTP_PROXY = httpProxy;
  }

  if (httpsProxy) {
    proxyEnv.HTTPS_PROXY = httpsProxy;
  }

  if (socksProxy) {
    proxyEnv.ALL_PROXY = socksProxy;
  }

  if (hasTransportProxy) {
    const noProxy = mergeNoProxyEntries([
      ...LOOPBACK_NO_PROXY,
      ...(settings.ExceptionsList || [])
    ]);

    if (noProxy) {
      proxyEnv.NO_PROXY = noProxy;
    }
  }

  return Object.keys(proxyEnv).length > 0 ? proxyEnv : null;
}

export function resolveProxyEnv({
  env = process.env,
  platform = process.platform,
  execFileSync = defaultExecFileSync
} = {}) {
  const explicitProxyEnv = normalizeExplicitProxyEnv(env);

  if (explicitProxyEnv) {
    return {
      source: "env",
      proxyEnv: explicitProxyEnv,
      warnings: []
    };
  }

  if (platform !== "darwin") {
    return {
      source: "none",
      proxyEnv: null,
      warnings: []
    };
  }

  let output = "";

  try {
    output = execFileSync("scutil", ["--proxy"], {
      encoding: "utf8"
    });
  } catch {
    return {
      source: "none",
      proxyEnv: null,
      warnings: []
    };
  }

  const proxyEnv = buildProxyEnvFromScutilSettings(parseScutilProxyOutput(output));

  if (!proxyEnv) {
    return {
      source: "none",
      proxyEnv: null,
      warnings: []
    };
  }

  const warnings = [];

  if (!selectHttpProxyUrl(proxyEnv) && proxyEnv.ALL_PROXY) {
    warnings.push(
      "Detected a SOCKS-only system proxy. Set HTTP_PROXY/HTTPS_PROXY explicitly if Discord traffic still cannot connect."
    );
  }

  return {
    source: "system",
    proxyEnv,
    warnings
  };
}

function mirrorProxyEnv(env, proxyEnv) {
  for (const key of PROXY_ENV_KEYS) {
    const value = proxyEnv[key];

    if (!value) {
      continue;
    }

    env[key] = value;
    env[key.toLowerCase()] = value;
  }
}

function installGlobalHttpAgents(proxyEnv) {
  http.globalAgent = new http.Agent({
    keepAlive: true,
    proxyEnv
  });
  https.globalAgent = new https.Agent({
    keepAlive: true,
    proxyEnv
  });
}

async function installUndiciDispatcher(proxyEnv) {
  const sharedProxy = selectHttpProxyUrl(proxyEnv);

  if (!sharedProxy) {
    return {
      configured: false,
      reason: proxyEnv.ALL_PROXY ? "socks_only" : "missing_http_proxy"
    };
  }

  const undici = await loadUndiciModule();

  if (!undici?.EnvHttpProxyAgent || !undici?.setGlobalDispatcher) {
    return {
      configured: false,
      reason: "undici_unavailable"
    };
  }

  if (
    undici.ProxyAgent &&
    (proxyEnv.HTTP_PROXY || sharedProxy) === (proxyEnv.HTTPS_PROXY || sharedProxy)
  ) {
    undici.setGlobalDispatcher(new undici.ProxyAgent(sharedProxy));
  } else {
    undici.setGlobalDispatcher(
      new undici.EnvHttpProxyAgent({
        httpProxy: proxyEnv.HTTP_PROXY || sharedProxy,
        httpsProxy: proxyEnv.HTTPS_PROXY || sharedProxy,
        noProxy: proxyEnv.NO_PROXY
      })
    );
  }

  return {
    configured: true,
    reason: null
  };
}

function redactProxyUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "invalid";
  }
}

export async function applySystemProxy({
  env = process.env,
  platform = process.platform,
  execFileSync = defaultExecFileSync,
  logger = null
} = {}) {
  const resolved = resolveProxyEnv({
    env,
    platform,
    execFileSync
  });

  if (!resolved.proxyEnv) {
    return {
      enabled: false,
      ...resolved,
      undici: {
        configured: false,
        reason: "disabled"
      }
    };
  }

  mirrorProxyEnv(env, resolved.proxyEnv);

  if (!env.NODE_USE_ENV_PROXY?.trim()) {
    env.NODE_USE_ENV_PROXY = "1";
  }

  if (selectHttpProxyUrl(resolved.proxyEnv)) {
    installGlobalHttpAgents(resolved.proxyEnv);
  }

  const undici = await installUndiciDispatcher(resolved.proxyEnv);
  const warnings = [...resolved.warnings];

  if (!undici.configured && undici.reason !== "disabled") {
    warnings.push(`Undici proxy dispatcher was not configured: ${undici.reason}.`);
  }

  if (logger) {
    logger("network.proxy.enabled", {
      source: resolved.source,
      httpProxy: redactProxyUrl(resolved.proxyEnv.HTTP_PROXY),
      httpsProxy: redactProxyUrl(resolved.proxyEnv.HTTPS_PROXY),
      allProxy: redactProxyUrl(resolved.proxyEnv.ALL_PROXY),
      noProxy: resolved.proxyEnv.NO_PROXY || null,
      undici: undici.configured ? "configured" : undici.reason
    });

    if (warnings.length > 0) {
      logger("network.proxy.warning", { warnings });
    }
  }

  return {
    enabled: true,
    source: resolved.source,
    proxyEnv: resolved.proxyEnv,
    warnings,
    undici
  };
}

export async function proxyAwareFetch(input, init) {
  const undici = await loadUndiciModule();

  if (undici?.fetch) {
    return undici.fetch(input, init);
  }

  return fetch(input, init);
}

export function installDiscordGlobalWebSocketPatch() {
  if (discordGlobalWebSocketPatchInstalled) {
    return;
  }

  const originalLoad = Module._load;

  Module._load = function patchedDiscordUtilLoad(request, parent, isMain) {
    const exports = originalLoad.call(this, request, parent, isMain);

    if (request !== "@discordjs/util") {
      return exports;
    }

    return new Proxy(exports, {
      get(target, property, receiver) {
        if (property === "shouldUseGlobalFetchAndWebSocket") {
          return () => true;
        }

        return Reflect.get(target, property, receiver);
      }
    });
  };

  discordGlobalWebSocketPatchInstalled = true;
}
