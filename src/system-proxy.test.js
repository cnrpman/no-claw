import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProxyEnvFromScutilSettings,
  parseScutilProxyOutput,
  resolveProxyEnv
} from "./system-proxy.js";

const SCUTIL_PROXY_OUTPUT = `
<dictionary> {
  ExceptionsList : <array> {
    0 : localhost
    1 : *.local
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7891
  SOCKSProxy : 127.0.0.1
}
`;

test("parseScutilProxyOutput parses enabled proxies and exceptions", () => {
  const parsed = parseScutilProxyOutput(SCUTIL_PROXY_OUTPUT);

  assert.equal(parsed.HTTPEnable, "1");
  assert.equal(parsed.HTTPProxy, "127.0.0.1");
  assert.equal(parsed.HTTPSPort, "7890");
  assert.deepEqual(parsed.ExceptionsList, ["localhost", "*.local"]);
});

test("buildProxyEnvFromScutilSettings maps macOS proxy settings to env vars", () => {
  const proxyEnv = buildProxyEnvFromScutilSettings(parseScutilProxyOutput(SCUTIL_PROXY_OUTPUT));

  assert.deepEqual(proxyEnv, {
    HTTP_PROXY: "http://127.0.0.1:7890",
    HTTPS_PROXY: "http://127.0.0.1:7890",
    ALL_PROXY: "socks5://127.0.0.1:7891",
    NO_PROXY: "localhost,127.0.0.1,::1,*.local"
  });
});

test("buildProxyEnvFromScutilSettings returns null when no transport proxy is enabled", () => {
  assert.equal(buildProxyEnvFromScutilSettings({}), null);
});

test("resolveProxyEnv prefers explicit env vars over macOS system proxy", () => {
  const result = resolveProxyEnv({
    env: {
      HTTPS_PROXY: "http://env-proxy.example:9000",
      NO_PROXY: "localhost"
    },
    platform: "darwin",
    execFileSync() {
      throw new Error("scutil should not be called when env proxy is already set");
    }
  });

  assert.deepEqual(result, {
    source: "env",
    proxyEnv: {
      HTTPS_PROXY: "http://env-proxy.example:9000",
      NO_PROXY: "localhost"
    },
    warnings: []
  });
});

test("resolveProxyEnv falls back to macOS system proxy when env vars are absent", () => {
  const result = resolveProxyEnv({
    env: {},
    platform: "darwin",
    execFileSync() {
      return SCUTIL_PROXY_OUTPUT;
    }
  });

  assert.equal(result.source, "system");
  assert.deepEqual(result.proxyEnv, {
    HTTP_PROXY: "http://127.0.0.1:7890",
    HTTPS_PROXY: "http://127.0.0.1:7890",
    ALL_PROXY: "socks5://127.0.0.1:7891",
    NO_PROXY: "localhost,127.0.0.1,::1,*.local"
  });
  assert.deepEqual(result.warnings, []);
});

test("resolveProxyEnv ignores NO_PROXY-only env without transport proxy vars", () => {
  const result = resolveProxyEnv({
    env: {
      NO_PROXY: "localhost"
    },
    platform: "darwin",
    execFileSync() {
      return "<dictionary> {\n}\n";
    }
  });

  assert.deepEqual(result, {
    source: "none",
    proxyEnv: null,
    warnings: []
  });
});
