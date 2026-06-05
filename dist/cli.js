#!/usr/bin/env node

// src/cli.ts
import pc2 from "picocolors";
import * as p2 from "@clack/prompts";
import { appendFileSync, readFileSync as readFileSync2, existsSync as existsSync2 } from "fs";
import { homedir as homedir3, tmpdir } from "os";
import { join as join3 } from "path";
import { execSync as execSync2 } from "child_process";

// src/launch.ts
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var isWindows = process.platform === "win32";
var FALLBACK_PATHS = isWindows ? [
  join(process.env["APPDATA"] ?? homedir(), "npm", "claude.cmd"),
  join(process.env["APPDATA"] ?? homedir(), "npm", "claude"),
  join(homedir(), "AppData", "Roaming", "npm", "claude.cmd")
] : [
  join(homedir(), ".local", "bin", "claude"),
  join(homedir(), ".npm", "bin", "claude"),
  "/usr/local/bin/claude",
  "/opt/homebrew/bin/claude"
];
function findClaudeBinary() {
  try {
    const result = execSync(isWindows ? "where.exe claude" : "which claude", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    const path = result.trim().split("\n")[0].trim();
    if (path) return path;
  } catch {
  }
  for (const path of FALLBACK_PATHS) {
    if (existsSync(path)) return path;
  }
  return null;
}
function launchClaude(env, model, extraArgs) {
  return new Promise((resolve) => {
    const claudePath = findClaudeBinary();
    const args = ["--model", model, ...extraArgs];
    const child = spawn(claudePath, args, {
      stdio: "inherit",
      env,
      shell: isWindows
    });
    const forward = (signal) => {
      child.kill(signal);
    };
    process.once("SIGINT", () => forward("SIGINT"));
    process.once("SIGTERM", () => forward("SIGTERM"));
    child.on("exit", (code) => {
      resolve(code ?? 0);
    });
  });
}

// src/constants.ts
import { homedir as homedir2 } from "os";
import { join as join2 } from "path";
var BACKENDS = {
  zen: {
    id: "zen",
    name: "OpenCode Zen",
    // No /v1 suffix — the Anthropic SDK appends /v1/messages automatically
    baseUrl: "https://opencode.ai/zen"
  },
  go: {
    id: "go",
    name: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go"
  }
};
var CONFLICTING_ENV_VARS = [
  "CLAUDE_CODE_USE_VERTEX",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  "ANTHROPIC_VERTEX_BASE_URL",
  "CLOUD_ML_REGION",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "ANTHROPIC_AWS_BASE_URL",
  "ANTHROPIC_AWS_API_KEY",
  "ANTHROPIC_AWS_WORKSPACE_ID",
  "ANTHROPIC_FOUNDRY_API_KEY",
  "ANTHROPIC_FOUNDRY_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL"
];
var OPENCODE_CACHE_PATH = join2(homedir2(), ".cache", "opencode", "models.json");
var MODELS_CACHE_TTL_MS = 60 * 60 * 1e3;
var STALE_FREE_MODELS = /* @__PURE__ */ new Set([
  "qwen3.6-plus-free"
  // 401 — free promotion ended
]);
function classifyModelFormat(modelId, providerNpm) {
  if (providerNpm === "@ai-sdk/anthropic") return "anthropic";
  if (providerNpm === "@ai-sdk/openai") return "unsupported";
  if (providerNpm === "@ai-sdk/google") return "unsupported";
  const lower = modelId.toLowerCase();
  if (lower.startsWith("claude-")) return "anthropic";
  if (lower.startsWith("gpt-")) return "unsupported";
  if (lower.startsWith("gemini-")) return "unsupported";
  return "openai";
}
var VERSION = "0.2.0";

// src/env.ts
function detectConflicts() {
  return CONFLICTING_ENV_VARS.filter((name) => process.env[name] !== void 0).map((name) => ({ name, value: process.env[name] }));
}
function resolveApiKey() {
  const key = process.env["OPENCODE_API_KEY"];
  return key?.trim() || null;
}
function buildChildEnv(backend, model, apiKey, proxyPort) {
  const env = { ...process.env };
  for (const name of CONFLICTING_ENV_VARS) {
    delete env[name];
  }
  env["ANTHROPIC_BASE_URL"] = proxyPort ? `http://127.0.0.1:${proxyPort}` : backend.baseUrl;
  env["ANTHROPIC_API_KEY"] = apiKey;
  env["ANTHROPIC_MODEL"] = model;
  return env;
}

// src/models.ts
import { readFileSync } from "fs";
var BRAND_MAP = [
  ["claude", "Claude"],
  ["gpt", "GPT"],
  ["gemini", "Gemini"],
  ["deepseek", "DeepSeek"],
  ["qwen", "Qwen"],
  ["minimax", "MiniMax"],
  ["kimi", "Kimi"],
  ["glm", "GLM"],
  ["mimo", "MiMo"],
  ["grok", "Grok"],
  ["nemotron", "Nemotron"]
];
function deriveBrand(family) {
  const lower = family.toLowerCase();
  for (const [prefix, brand] of BRAND_MAP) {
    if (lower.startsWith(prefix)) return brand;
  }
  return "Other";
}
function readModelsFromCache(backendId) {
  try {
    const raw = readFileSync(OPENCODE_CACHE_PATH, "utf8");
    const cache = JSON.parse(raw);
    const providerKey = backendId === "zen" ? "opencode" : "opencode-go";
    const providerData = cache[providerKey];
    if (!providerData?.models) return null;
    const result = /* @__PURE__ */ new Map();
    for (const entry of Object.values(providerData.models)) {
      if (entry.status === "deprecated") continue;
      const isFree = entry.cost !== void 0 && entry.cost.input === 0 && entry.cost.output === 0;
      const modelFormat = classifyModelFormat(entry.id, entry.provider?.npm);
      result.set(entry.id, {
        id: entry.id,
        name: entry.name ?? entry.id,
        isFree,
        brand: deriveBrand(entry.family ?? ""),
        sourceBackend: backendId,
        modelFormat,
        cost: entry.cost
      });
    }
    return result;
  } catch {
    return null;
  }
}
async function fetchModelsFromApi(backend) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5e3);
  try {
    const res = await fetch(`${backend.baseUrl}/v1/models`, {
      signal: controller.signal,
      headers: { Authorization: "Bearer test" }
    });
    if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
    const body = await res.json();
    return body.data.map((m) => m.id);
  } finally {
    clearTimeout(timer);
  }
}
function mergeModels(apiIds, cache, backendId) {
  return apiIds.filter((id) => !STALE_FREE_MODELS.has(id)).map((id) => {
    const cached = cache?.get(id);
    if (cached) return { ...cached, sourceBackend: backendId };
    const modelFormat = classifyModelFormat(id, void 0);
    return {
      id,
      name: id,
      isFree: false,
      brand: "Other",
      sourceBackend: backendId,
      modelFormat
    };
  });
}
function groupModels(models) {
  const free = models.filter((m) => m.isFree).sort((a, b) => a.id.localeCompare(b.id));
  const byBrand = /* @__PURE__ */ new Map();
  for (const m of models.filter((m2) => !m2.isFree)) {
    const list = byBrand.get(m.brand) ?? [];
    list.push(m);
    byBrand.set(m.brand, list);
  }
  for (const [brand, list] of byBrand) {
    byBrand.set(brand, list.sort((a, b) => a.id.localeCompare(b.id)));
  }
  return { free, byBrand };
}
async function getModels(backend, fallbackModels) {
  const cache = readModelsFromCache(backend.id);
  try {
    const apiIds = await fetchModelsFromApi(backend);
    return { models: mergeModels(apiIds, cache, backend.id), fromCache: false };
  } catch {
    if (cache && cache.size > 0) {
      return { models: [...cache.values()], fromCache: true };
    }
    if (fallbackModels && fallbackModels.length > 0) {
      return { models: fallbackModels, fromCache: true };
    }
    throw new Error(
      "Cannot fetch models. Check your network and https://opencode.ai status."
    );
  }
}

// src/proxy.ts
import { createServer } from "http";
import { Readable } from "stream";
function hashSystemPrompt(system) {
  if (!system) return null;
  const text = typeof system === "string" ? system : system.map((s) => s.text || "").join("\n");
  if (!text.trim()) return null;
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) + hash + text.charCodeAt(i);
    hash = hash & hash;
  }
  return "cache-" + Math.abs(hash).toString(36);
}
function tokenCount(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}
function extractCachedTokens(usage) {
  return tokenCount(
    usage?.prompt_tokens_details?.cached_tokens,
    usage?.input_tokens_details?.cached_tokens,
    usage?.cache_read_input_tokens
  );
}
function extractInputTokens(usage) {
  return tokenCount(
    usage?.prompt_tokens,
    usage?.input_tokens,
    usage?.promptTokens,
    usage?.inputTokens
  );
}
function extractUncachedInputTokens(usage) {
  return Math.max(0, extractInputTokens(usage) - extractCachedTokens(usage));
}
function extractOutputTokens(usage) {
  return tokenCount(
    usage?.completion_tokens,
    usage?.output_tokens,
    usage?.completionTokens,
    usage?.outputTokens
  );
}
function translateImageBlock(part) {
  const src = part.source;
  if (!src) return null;
  if (src.type === "url") {
    return { type: "image_url", image_url: { url: src.url } };
  }
  if (src.type === "base64") {
    return { type: "image_url", image_url: { url: `data:${src.media_type};base64,${src.data}` } };
  }
  return null;
}
function translateRequest(body) {
  const { model, messages, system, temperature, max_tokens, top_p, stop_sequences, tools, stream } = body;
  const openAIMessages = Array.isArray(messages) ? messages.flatMap((msg) => {
    if (typeof msg.content === "string") {
      return [{ role: msg.role, content: msg.content }];
    }
    if (!Array.isArray(msg.content)) return [];
    const result = [];
    if (msg.role === "assistant") {
      const assistantMsg = { role: "assistant", content: null };
      let text = "";
      let reasoningContent = "";
      const toolCalls = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          text += (typeof part.text === "string" ? part.text : JSON.stringify(part.text)) + "\n";
        } else if (part.type === "thinking") {
          reasoningContent += (typeof part.thinking === "string" ? part.thinking : JSON.stringify(part.thinking)) + "\n";
        } else if (part.type === "tool_use") {
          toolCalls.push({
            id: part.id,
            type: "function",
            function: { name: part.name, arguments: JSON.stringify(part.input) }
          });
        }
      }
      const trimmed = text.trim();
      const trimmedReasoning = reasoningContent.trim();
      if (trimmed) assistantMsg.content = trimmed;
      if (trimmedReasoning) assistantMsg.reasoning_content = trimmedReasoning;
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      if (assistantMsg.content || assistantMsg.reasoning_content || assistantMsg.tool_calls) result.push(assistantMsg);
    }
    if (msg.role === "user") {
      let userText = "";
      const contentParts = [];
      const toolResults = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          userText += (typeof part.text === "string" ? part.text : JSON.stringify(part.text)) + "\n";
        } else if (part.type === "image") {
          const translated = translateImageBlock(part);
          if (translated) contentParts.push(translated);
        } else if (part.type === "tool_result") {
          toolResults.push({
            role: "tool",
            tool_call_id: part.tool_use_id,
            content: typeof part.content === "string" ? part.content : JSON.stringify(part.content)
          });
        }
      }
      const trimmed = userText.trim();
      result.push(...toolResults);
      if (contentParts.length > 0) {
        if (trimmed) contentParts.unshift({ type: "text", text: trimmed });
        result.push({ role: "user", content: contentParts });
      } else if (trimmed) {
        result.push({ role: "user", content: trimmed });
      }
    }
    return result;
  }) : [];
  const systemMessages = Array.isArray(system) ? system.map((item) => ({ role: "system", content: item.text })) : system ? [{ role: "system", content: system }] : [];
  const data = { model, messages: [...systemMessages, ...openAIMessages] };
  if (max_tokens !== void 0) data.max_tokens = max_tokens;
  if (temperature !== void 0) data.temperature = temperature;
  if (top_p !== void 0) data.top_p = top_p;
  if (stream !== void 0) data.stream = stream;
  if (stream) data.stream_options = { include_usage: true };
  if (stop_sequences) data.stop = stop_sequences;
  if (tools) {
    data.tools = tools.map((item) => ({
      type: "function",
      function: {
        name: item.name,
        description: item.description,
        parameters: item.input_schema
      }
    }));
  }
  const cacheKey = hashSystemPrompt(system);
  if (cacheKey) data.prompt_cache_key = cacheKey;
  return data;
}
function parseToolArguments(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function translateResponse(completion, model) {
  const messageId = "msg_" + Date.now();
  const content = [];
  const message = completion.choices?.[0]?.message;
  if (message?.reasoning_content) {
    content.push({ type: "thinking", thinking: message.reasoning_content, signature: "" });
  }
  if (message?.content) {
    content.push({ text: message.content, type: "text" });
  }
  if (message?.tool_calls) {
    content.push(...message.tool_calls.map((item) => ({
      type: "tool_use",
      id: item.id,
      name: item.function?.name,
      input: parseToolArguments(item.function?.arguments)
    })));
  }
  const finishReason = completion.choices?.[0]?.finish_reason;
  let stopReason = "end_turn";
  if (finishReason === "tool_calls") stopReason = "tool_use";
  else if (finishReason === "length") stopReason = "max_tokens";
  const result = {
    id: messageId,
    type: "message",
    role: "assistant",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    model
  };
  if (completion.usage) {
    result.usage = {
      input_tokens: extractUncachedInputTokens(completion.usage),
      output_tokens: extractOutputTokens(completion.usage),
      cache_read_input_tokens: extractCachedTokens(completion.usage),
      cache_creation_input_tokens: 0
    };
  }
  return result;
}
function sseChunk(eventType, data) {
  return `event: ${eventType}
data: ${JSON.stringify(data)}

`;
}
function translateStream(upstreamBody, model) {
  const messageId = "msg_" + Date.now();
  let contentBlockIndex = -1;
  let hasStartedTextBlock = false;
  let hasStartedThinkingBlock = false;
  let isToolUse = false;
  let currentToolCallId = null;
  let lastUsage = null;
  let finishReason = null;
  let messageStarted = false;
  let buffer = "";
  const output = new Readable({ read() {
  } });
  function emitSSE(eventType, data) {
    output.push(sseChunk(eventType, data));
  }
  function emitMessageStart() {
    if (messageStarted) return;
    emitSSE("message_start", {
      type: "message_start",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    });
    messageStarted = true;
  }
  function closeCurrentBlock() {
    if (isToolUse || hasStartedTextBlock || hasStartedThinkingBlock) {
      emitSSE("content_block_stop", { type: "content_block_stop", index: contentBlockIndex });
    }
  }
  function processDelta(delta, parsed) {
    if (parsed.usage) {
      lastUsage = {
        input_tokens: extractUncachedInputTokens(parsed.usage),
        output_tokens: extractOutputTokens(parsed.usage),
        cache_read_input_tokens: extractCachedTokens(parsed.usage),
        cache_creation_input_tokens: 0
      };
    }
    if (parsed.choices?.[0]?.finish_reason) {
      finishReason = parsed.choices[0].finish_reason;
    }
    if (delta.tool_calls?.length > 0) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.id && toolCall.id !== currentToolCallId) {
          closeCurrentBlock();
          isToolUse = true;
          hasStartedTextBlock = false;
          hasStartedThinkingBlock = false;
          currentToolCallId = toolCall.id;
          contentBlockIndex++;
          emitMessageStart();
          emitSSE("content_block_start", {
            type: "content_block_start",
            index: contentBlockIndex,
            content_block: { type: "tool_use", id: toolCall.id, name: toolCall.function?.name, input: {} }
          });
        }
        if (toolCall.function?.arguments) {
          emitSSE("content_block_delta", {
            type: "content_block_delta",
            index: contentBlockIndex,
            delta: { type: "input_json_delta", partial_json: toolCall.function.arguments }
          });
        }
      }
      return;
    }
    if (delta.reasoning_content) {
      if (isToolUse || hasStartedTextBlock) {
        closeCurrentBlock();
        isToolUse = false;
        hasStartedTextBlock = false;
        currentToolCallId = null;
        contentBlockIndex++;
      }
      if (!hasStartedThinkingBlock) {
        if (contentBlockIndex < 0) contentBlockIndex = 0;
        emitMessageStart();
        emitSSE("content_block_start", {
          type: "content_block_start",
          index: contentBlockIndex,
          content_block: { type: "thinking", thinking: "", signature: "" }
        });
        hasStartedThinkingBlock = true;
      }
      emitSSE("content_block_delta", {
        type: "content_block_delta",
        index: contentBlockIndex,
        delta: { type: "thinking_delta", thinking: delta.reasoning_content }
      });
      return;
    }
    if (delta.content) {
      if (isToolUse || hasStartedThinkingBlock) {
        closeCurrentBlock();
        isToolUse = false;
        hasStartedThinkingBlock = false;
        currentToolCallId = null;
        contentBlockIndex++;
      }
      if (!hasStartedTextBlock) {
        if (contentBlockIndex < 0) contentBlockIndex = 0;
        emitMessageStart();
        emitSSE("content_block_start", {
          type: "content_block_start",
          index: contentBlockIndex,
          content_block: { type: "text", text: "" }
        });
        hasStartedTextBlock = true;
      }
      emitSSE("content_block_delta", {
        type: "content_block_delta",
        index: contentBlockIndex,
        delta: { type: "text_delta", text: delta.content }
      });
    }
  }
  function processLine(line) {
    if (!line.startsWith("data: ")) return;
    const data = line.slice(6).trim();
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      if (delta) processDelta(delta, parsed);
    } catch {
    }
  }
  function finish() {
    closeCurrentBlock();
    let stopReason = "end_turn";
    if (finishReason === "tool_calls") stopReason = "tool_use";
    else if (finishReason === "length") stopReason = "max_tokens";
    emitSSE("message_delta", {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: lastUsage || { input_tokens: 0, output_tokens: 0 }
    });
    emitSSE("message_stop", { type: "message_stop" });
    output.push(null);
  }
  const decoder = new TextDecoder();
  upstreamBody.on("data", (chunk) => {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) processLine(line);
    }
  });
  upstreamBody.on("end", () => {
    if (buffer.trim()) processLine(buffer);
    finish();
  });
  upstreamBody.on("error", () => {
    finish();
  });
  return output;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
function extractApiKey(req) {
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string") return xApiKey;
  const auth = req.headers["authorization"];
  if (typeof auth === "string") return auth.replace("Bearer ", "").trim();
  return null;
}
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}
function anthropicError(res, status, message) {
  sendJson(res, status, {
    type: "error",
    error: { type: "api_error", message }
  });
}
function startProxy(upstreamBaseUrl) {
  const upstreamUrl = `${upstreamBaseUrl}/v1/chat/completions`;
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/v1/messages") {
      const apiKey = extractApiKey(req);
      if (!apiKey) {
        anthropicError(res, 401, "Missing API key");
        return;
      }
      let anthropicBody;
      try {
        const raw = await readBody(req);
        anthropicBody = JSON.parse(raw);
      } catch {
        anthropicError(res, 400, "Invalid JSON body");
        return;
      }
      const originalModel = anthropicBody.model;
      const openaiBody = translateRequest(anthropicBody);
      let upstreamRes;
      try {
        upstreamRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(openaiBody)
        });
      } catch (err) {
        anthropicError(res, 502, `Upstream unreachable: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      if (!upstreamRes.ok) {
        const errBody = await upstreamRes.text();
        res.writeHead(upstreamRes.status, { "Content-Type": upstreamRes.headers.get("content-type") || "application/json" });
        res.end(errBody);
        return;
      }
      if (openaiBody.stream && upstreamRes.body) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });
        const nodeStream = Readable.fromWeb(upstreamRes.body);
        const translated = translateStream(nodeStream, originalModel);
        translated.pipe(res);
        return;
      }
      const openaiData = await upstreamRes.json();
      const anthropicResponse = translateResponse(openaiData, originalModel);
      sendJson(res, 200, anthropicResponse);
      return;
    }
    anthropicError(res, 404, `Unknown endpoint: ${req.method} ${req.url}`);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind proxy"));
        return;
      }
      resolve({
        port: addr.port,
        close: () => server.close()
      });
    });
  });
}

// src/config.ts
import Conf from "conf";
var store = new Conf({
  projectName: "opencode-starter",
  defaults: {}
});
function loadPreferences() {
  return {
    lastBackend: store.get("lastBackend"),
    lastModel: store.get("lastModel"),
    modelListCache: store.get("modelListCache")
  };
}
function savePreferences(prefs) {
  if (prefs.lastBackend !== void 0) store.set("lastBackend", prefs.lastBackend);
  if (prefs.lastModel !== void 0) store.set("lastModel", prefs.lastModel);
}
function getCachedModels(backendId) {
  const modelListCache = store.get("modelListCache");
  const entry = modelListCache?.[backendId];
  if (!entry) return null;
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  if (age > MODELS_CACHE_TTL_MS) return null;
  return entry.models;
}
function setCachedModels(backendId, models) {
  const existing = store.get("modelListCache") ?? {};
  store.set("modelListCache", {
    ...existing,
    [backendId]: { models, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() }
  });
}
function getSubscriptionTier() {
  return store.get("subscriptionTier") ?? null;
}
function setSubscriptionTier(tier) {
  store.set("subscriptionTier", tier);
}

// src/prompts.ts
import * as p from "@clack/prompts";
import pc from "picocolors";
function modelLabel(model, showBackendBadge = false) {
  if (model.modelFormat === "unsupported") {
    return pc.dim(`${model.name} (not yet supported)`);
  }
  if (model.isFree) {
    const tag = showBackendBadge ? "(free \xB7 Zen)" : "(free)";
    return pc.green(`${model.name} ${tag}`);
  }
  return model.name;
}
function modelHint(model) {
  const parts = [];
  if (model.modelFormat === "openai") parts.push("via proxy");
  else if (model.modelFormat === "unsupported") parts.push("needs format support");
  if (!model.isFree) parts.push(`${model.brand} \xB7 ${model.id}`);
  else parts.push(model.id);
  return parts.join(" \xB7 ");
}
async function askSubscriptionTier() {
  const tier = await p.select({
    message: "What OpenCode subscription do you have?",
    options: [
      {
        value: "free",
        label: "Free only",
        hint: "Zen free models only \u2014 no subscription needed"
      },
      {
        value: "zen",
        label: "Zen subscription",
        hint: "All Zen models (paid + free)"
      },
      {
        value: "go",
        label: "Go subscription",
        hint: "All Go models"
      },
      {
        value: "both",
        label: "Both (Zen + Go)",
        hint: "All Go models + all Zen models \u2014 choose backend each launch"
      }
    ],
    initialValue: "free"
  });
  if (p.isCancel(tier)) {
    p.cancel("Cancelled.");
    return null;
  }
  return tier;
}
async function runWizard(prefs, modelsByBackend, conflicts, tier) {
  p.intro(pc.bold("  OpenCode Starter"));
  let selectorBackendId = null;
  if (tier === "both") {
    const backendId = await p.select({
      message: "Which backend?",
      options: [
        { value: "zen", label: "OpenCode Zen", hint: "66+ models, free tier available" },
        { value: "go", label: "OpenCode Go", hint: "17 models, subscription ($10/mo)" }
      ],
      initialValue: prefs.lastBackend ?? "zen"
    });
    if (p.isCancel(backendId)) {
      p.cancel("Cancelled.");
      return null;
    }
    selectorBackendId = backendId;
  }
  const showBackendBadge = tier === "go";
  let models;
  if (tier === "free") {
    models = modelsByBackend.zen.filter((m) => m.isFree);
  } else if (tier === "zen") {
    models = modelsByBackend.zen;
  } else if (tier === "go") {
    const zenFree = modelsByBackend.zen.filter((m) => m.isFree);
    models = [...zenFree, ...modelsByBackend.go];
  } else {
    models = selectorBackendId === "go" ? modelsByBackend.go : modelsByBackend.zen;
  }
  const selectableModels = [];
  const unsupportedModels = [];
  for (const m of models) {
    (m.modelFormat === "unsupported" ? unsupportedModels : selectableModels).push(m);
  }
  const { free, byBrand } = groupModels(selectableModels);
  const options = [];
  for (const m of free) {
    options.push({ value: m.id, label: modelLabel(m, showBackendBadge), hint: modelHint(m) });
  }
  const brandOrder = ["Claude", "GPT", "Gemini", "DeepSeek", "Qwen", "MiniMax", "Kimi", "GLM", "MiMo", "Grok", "Nemotron", "Other"];
  const sortedBrands = [...byBrand.keys()].sort(
    (a, b) => (brandOrder.indexOf(a) !== -1 ? brandOrder.indexOf(a) : 99) - (brandOrder.indexOf(b) !== -1 ? brandOrder.indexOf(b) : 99)
  );
  for (const brand of sortedBrands) {
    for (const m of byBrand.get(brand) ?? []) {
      options.push({ value: m.id, label: modelLabel(m), hint: modelHint(m) });
    }
  }
  if (options.length === 0) {
    p.cancel("No models available for this backend and subscription tier.");
    return null;
  }
  const defaultModel = prefs.lastModel && options.some((o) => o.value === prefs.lastModel) ? prefs.lastModel : options[0]?.value;
  const modelId = await p.select({
    message: "Which model?",
    options,
    initialValue: defaultModel
  });
  if (p.isCancel(modelId)) {
    p.cancel("Cancelled.");
    return null;
  }
  if (unsupportedModels.length > 0) {
    const brandCounts = unsupportedModels.reduce((acc, m) => {
      acc[m.brand] = (acc[m.brand] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(brandCounts).map(([b, c]) => `${b} (${c})`).join(", ");
    p.log.info(pc.dim(`Not yet supported: ${summary} \u2014 need API format translation`));
  }
  const selectedModel = selectableModels.find((m) => m.id === String(modelId));
  const backend = BACKENDS[selectedModel.sourceBackend];
  if (conflicts.length > 0) {
    const lines = conflicts.map((c) => `  ${pc.dim(c.name)}=${pc.dim(c.value)}`).join("\n");
    p.note(lines, pc.yellow("Env vars that will be temporarily overridden:"));
  }
  const confirmed = await p.confirm({
    message: `Launch Claude Code \xB7 ${pc.bold(String(modelId))} via ${pc.bold(backend.name)}?`,
    initialValue: true
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    return null;
  }
  p.outro(pc.green("Launching..."));
  return { backend, model: selectedModel };
}

// src/cli.ts
function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { showHelp: true, showVersion: false, dryRun: false, setup: false, trace: false, claudeArgs: [] };
  }
  if (args.includes("--version") || args.includes("-v")) {
    return { showVersion: true, showHelp: false, dryRun: false, setup: false, trace: false, claudeArgs: [] };
  }
  const dryRun = args.includes("--dry-run");
  const setup = args.includes("--setup");
  const trace = args.includes("--trace");
  const filteredArgs = args.filter((a) => a !== "--dry-run" && a !== "--setup" && a !== "--trace");
  const sep = filteredArgs.indexOf("--");
  return {
    showHelp: false,
    showVersion: false,
    dryRun,
    setup,
    trace,
    claudeArgs: sep >= 0 ? filteredArgs.slice(sep + 1) : []
  };
}
function printHelp() {
  console.log(`
${pc2.bold("opencode-starter")} v${VERSION}
Launch Claude Code with OpenCode Zen or Go as the Anthropic API backend.

${pc2.bold("Usage:")}
  opencode-starter [--dry-run] [--setup] [-- <claude-flags>]
  opencode-starter --help
  opencode-starter --version

${pc2.bold("Flags:")}
  --dry-run    Run the wizard but show a preview instead of launching Claude Code
  --setup      Re-configure your subscription tier
  --trace      Write Claude Code debug logs to /tmp/opencode-starter-debug.log and show errors on exit

${pc2.bold("Setup:")}
  Get your API key at https://opencode.ai/settings/keys
  Then run: export OPENCODE_API_KEY="your-key"

${pc2.bold("Examples:")}
  opencode-starter
  opencode-starter --dry-run
  opencode-starter --setup
  opencode-starter -- --print "hello"
  opencode-starter -- --dangerously-skip-permissions
`);
}
function printDryRun(backendName, modelId, baseUrl, modelFormat, claudeArgs, conflicts, disableExperimentalBetas) {
  console.log("");
  console.log(pc2.bold(pc2.cyan("  DRY RUN \u2014 would execute:")));
  console.log("");
  const claudeCmd = ["claude", "--model", modelId, ...claudeArgs].join(" ");
  console.log(`  ${pc2.bold("Command:")}  ${claudeCmd}`);
  console.log(`  ${pc2.bold("Backend:")}  ${backendName}`);
  if (modelFormat === "openai") {
    console.log(`  ${pc2.bold("Proxy:")}    would start local translation proxy ${pc2.dim("(Anthropic \u2192 OpenAI)")}`);
    console.log(`             ${pc2.dim(`\u2192 ${baseUrl}/v1/chat/completions`)}`);
  }
  console.log("");
  console.log(`  ${pc2.bold("Env vars SET:")}`);
  if (modelFormat === "openai") {
    console.log(`    ANTHROPIC_BASE_URL=http://127.0.0.1:<port>  ${pc2.dim("(local proxy)")}`);
  } else {
    console.log(`    ANTHROPIC_BASE_URL=${baseUrl}`);
  }
  console.log(`    ANTHROPIC_API_KEY=<your OPENCODE_API_KEY>`);
  console.log(`    ANTHROPIC_MODEL=${modelId}`);
  if (disableExperimentalBetas) {
    console.log(`    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1  ${pc2.dim("(auto-set: model uses protocol translation)")}`);
  }
  console.log("");
  if (conflicts.length > 0) {
    console.log(`  ${pc2.bold("Env vars REMOVED:")}`);
    for (const c of conflicts) {
      console.log(`    ${pc2.dim(c.name)}=${pc2.dim(c.value)}`);
    }
    console.log("");
  }
  console.log(pc2.dim("  (dry run complete \u2014 Claude Code was NOT launched)"));
  console.log("");
}
function detectShellProfile() {
  const shell = process.env["SHELL"] ?? "";
  if (process.platform === "darwin") {
    if (shell.includes("zsh")) return { display: "~/.zshrc", path: `${homedir3()}/.zshrc` };
    if (shell.includes("bash")) return { display: "~/.bash_profile", path: `${homedir3()}/.bash_profile` };
    return { display: "~/.profile", path: `${homedir3()}/.profile` };
  }
  if (process.platform === "linux") {
    if (shell.includes("zsh")) return { display: "~/.zshrc", path: `${homedir3()}/.zshrc` };
    if (shell.includes("bash")) return { display: "~/.bashrc", path: `${homedir3()}/.bashrc` };
    return { display: "~/.profile", path: `${homedir3()}/.profile` };
  }
  if (shell.includes("bash")) return { display: "~/.bashrc", path: `${homedir3()}/.bashrc` };
  return { display: "~/.profile", path: `${homedir3()}/.profile` };
}
async function readFromCredentialStore() {
  try {
    const { Entry } = await import("@napi-rs/keyring");
    return new Entry("opencode-starter", "opencode-starter").getPassword() ?? null;
  } catch {
    return null;
  }
}
async function saveToCredentialStore(key) {
  try {
    const { Entry } = await import("@napi-rs/keyring");
    new Entry("opencode-starter", "opencode-starter").setPassword(key);
    return true;
  } catch {
    return false;
  }
}
async function isSecretServiceAvailable() {
  try {
    const { Entry } = await import("@napi-rs/keyring");
    new Entry("opencode-starter-probe", "probe").getPassword();
    return true;
  } catch {
    return false;
  }
}
async function resolveOrCollectApiKey(simulate = false) {
  if (!simulate) {
    const existing = resolveApiKey();
    if (existing) return existing;
  }
  const isMac = process.platform === "darwin";
  const isWindows2 = process.platform === "win32";
  const isLinux = process.platform === "linux";
  if (simulate) {
    p2.note(
      "Running in dry-run mode \u2014 no keys will be read from or written to your system.",
      "Simulating first-run onboarding"
    );
  }
  if (!simulate) {
    const storedKey = await readFromCredentialStore();
    if (storedKey) {
      const storeName = isMac ? "macOS Keychain" : isWindows2 ? "Windows Credential Manager" : "Secret Service";
      p2.log.success(`Found key in ${storeName}`);
      process.env["OPENCODE_API_KEY"] = storedKey;
      return storedKey;
    }
  }
  p2.note("Get your free key at: https://opencode.ai/settings/keys", "OpenCode API key");
  const key = await p2.password({
    message: "Paste your OPENCODE_API_KEY:",
    validate: (val) => val.trim() ? void 0 : "Key cannot be empty"
  });
  if (p2.isCancel(key)) {
    p2.cancel("Cancelled.");
    return null;
  }
  const trimmedKey = key.trim();
  let secretServiceAvailable = false;
  if (isLinux && !simulate) {
    secretServiceAvailable = await isSecretServiceAvailable();
  }
  const { display, path } = detectShellProfile();
  const saveOptions = (() => {
    if (isMac) {
      return [
        {
          value: "keychain",
          label: "Keychain only",
          hint: "Key stored encrypted in Keychain; opencode-starter reads it automatically next time"
        },
        {
          value: "keychain-autoload",
          label: `Keychain + ${display} auto-load`,
          hint: `Key in Keychain; ${display} also exports it so all terminal tools can see it`
        },
        {
          value: "profile",
          label: `${display} only (plaintext)`,
          hint: "Key written directly to your shell profile \u2014 simpler but less secure"
        },
        {
          value: "session",
          label: "This session only",
          hint: "Not saved anywhere \u2014 you'll be asked again next time"
        }
      ];
    }
    if (isWindows2) {
      return [
        {
          value: "credential-manager",
          label: "Windows Credential Manager",
          hint: "Key stored securely; opencode-starter reads it automatically next time"
        },
        {
          value: "setx",
          label: "Persistent environment variable (plaintext)",
          hint: "Runs setx \u2014 key visible in System Properties \u2192 Environment Variables"
        },
        {
          value: "session",
          label: "This session only",
          hint: "Not saved anywhere \u2014 you'll be asked again next time"
        }
      ];
    }
    const opts = [];
    if (secretServiceAvailable) {
      opts.push({
        value: "secret-service",
        label: "Secret Service (GNOME Keyring / KWallet)",
        hint: "Key stored securely in your desktop keyring; opencode-starter reads it automatically next time"
      });
    } else if (!simulate) {
      p2.log.info("No keyring daemon detected \u2014 secure storage requires GNOME Keyring or KWallet running.");
    }
    opts.push(
      {
        value: "profile",
        label: `${display} (plaintext)`,
        hint: "Key written directly to your shell profile"
      },
      {
        value: "session",
        label: "This session only",
        hint: "Not saved anywhere \u2014 you'll be asked again next time"
      }
    );
    return opts;
  })();
  const saveChoice = await p2.select({
    message: "Where should we save the key?",
    options: saveOptions,
    initialValue: isMac ? "keychain" : isWindows2 ? "credential-manager" : secretServiceAvailable ? "secret-service" : "profile"
  });
  if (p2.isCancel(saveChoice)) {
    p2.cancel("Cancelled.");
    return null;
  }
  if (simulate) {
    if (saveChoice === "keychain") {
      p2.log.info("[dry-run] Would save key to macOS Keychain");
    } else if (saveChoice === "keychain-autoload") {
      p2.log.info(`[dry-run] Would save key to macOS Keychain and add auto-load to ${display}`);
    } else if (saveChoice === "credential-manager") {
      p2.log.info("[dry-run] Would save key to Windows Credential Manager");
    } else if (saveChoice === "setx") {
      p2.log.info("[dry-run] Would run: setx OPENCODE_API_KEY ***");
    } else if (saveChoice === "secret-service") {
      p2.log.info("[dry-run] Would save key to Secret Service (GNOME Keyring / KWallet)");
    } else if (saveChoice === "profile") {
      p2.log.info(`[dry-run] Would append OPENCODE_API_KEY export to ${display}`);
    } else {
      p2.log.info("[dry-run] Would use key for this session only");
    }
  } else if (saveChoice === "keychain") {
    if (await saveToCredentialStore(trimmedKey)) {
      p2.log.success("Key saved to macOS Keychain \u2014 active now and automatically loaded next time.");
    } else {
      p2.log.warn("Could not write to Keychain \u2014 key will be used for this session only");
    }
  } else if (saveChoice === "keychain-autoload") {
    if (await saveToCredentialStore(trimmedKey)) {
      try {
        const autoLoadLine = `export OPENCODE_API_KEY="$(security find-generic-password -s opencode-starter -a opencode-starter -w 2>/dev/null)"`;
        const existing = existsSync2(path) ? readFileSync2(path, "utf8") : "";
        if (!existing.includes(autoLoadLine)) {
          appendFileSync(path, `
# opencode-starter: load API key from macOS Keychain
${autoLoadLine}
`);
        }
        p2.log.success(`Key saved to Keychain and auto-load added to ${display} \u2014 active now and in all future terminals.`);
      } catch {
        p2.log.success("Key saved to Keychain \u2014 active now and automatically loaded next time.");
        p2.log.warn(`Could not write auto-load line to ${display}`);
      }
    } else {
      p2.log.warn("Could not write to Keychain \u2014 key will be used for this session only");
    }
  } else if (saveChoice === "credential-manager") {
    if (await saveToCredentialStore(trimmedKey)) {
      p2.log.success("Key saved to Windows Credential Manager \u2014 active now and automatically loaded next time.");
    } else {
      p2.log.warn("Could not write to Credential Manager \u2014 key will be used for this session only");
    }
  } else if (saveChoice === "setx") {
    try {
      execSync2(`setx OPENCODE_API_KEY "${trimmedKey}"`, { stdio: ["pipe", "pipe", "pipe"] });
      p2.log.success("Key saved as a user environment variable \u2014 active now and in all future terminals.");
    } catch {
      p2.log.warn("Could not run setx \u2014 key will be used for this session only");
    }
  } else if (saveChoice === "secret-service") {
    if (await saveToCredentialStore(trimmedKey)) {
      p2.log.success("Key saved to Secret Service \u2014 active now and automatically loaded next time.");
    } else {
      p2.log.warn("Could not write to Secret Service \u2014 key will be used for this session only");
    }
  } else if (saveChoice === "profile") {
    try {
      if (!existsSync2(path)) appendFileSync(path, "");
      appendFileSync(path, `
export OPENCODE_API_KEY="${trimmedKey}"
`);
      p2.log.success(`Key saved to ${display} \u2014 active now and in all future terminals.`);
    } catch {
      p2.log.warn(`Could not write to ${display} \u2014 key will be used for this session only`);
    }
  }
  if (!simulate) process.env["OPENCODE_API_KEY"] = trimmedKey;
  return trimmedKey;
}
async function main() {
  const { showHelp, showVersion, dryRun, setup, trace, claudeArgs } = parseArgs(process.argv.slice(2));
  if (showHelp) {
    printHelp();
    return;
  }
  if (showVersion) {
    console.log(VERSION);
    return;
  }
  const claudePath = findClaudeBinary();
  if (!claudePath) {
    console.error(pc2.red("\nError: claude binary not found on PATH.\n"));
    console.error("Install Claude Code:");
    console.error("  npm install -g @anthropic-ai/claude-code\n");
    process.exit(1);
  }
  const apiKey = await resolveOrCollectApiKey(dryRun);
  if (!apiKey && !dryRun) process.exit(0);
  const effectiveKey = apiKey ?? "dry-run-placeholder";
  const prefs = dryRun ? {} : loadPreferences();
  const conflicts = detectConflicts();
  let tier = dryRun ? null : getSubscriptionTier();
  if (!tier || setup) {
    tier = await askSubscriptionTier();
    if (!tier) process.exit(0);
    if (!dryRun) setSubscriptionTier(tier);
  }
  const needsZen = tier === "free" || tier === "zen" || tier === "go" || tier === "both";
  const needsGo = tier === "go" || tier === "both";
  const spinner2 = p2.spinner();
  spinner2.start("Fetching available models...");
  let zenModels = [];
  let goModels = [];
  try {
    if (needsZen) {
      const cachedZen = getCachedModels("zen") ?? void 0;
      const result = await getModels(BACKENDS.zen, cachedZen);
      zenModels = result.models;
      if (!result.fromCache && !dryRun) setCachedModels("zen", zenModels);
    }
    if (needsGo) {
      const cachedGo = getCachedModels("go") ?? void 0;
      const result = await getModels(BACKENDS.go, cachedGo);
      goModels = result.models;
      if (!result.fromCache && !dryRun) setCachedModels("go", goModels);
    }
    const total = zenModels.length + goModels.length;
    spinner2.stop(`Loaded ${total} models`);
  } catch (err) {
    spinner2.stop(pc2.red("Failed to load models"));
    console.error(pc2.red(String(err instanceof Error ? err.message : err)));
    process.exit(1);
  }
  const selection = await runWizard(prefs, { zen: zenModels, go: goModels }, conflicts, tier);
  if (!selection) process.exit(0);
  if (!dryRun) savePreferences({ lastBackend: selection.backend.id, lastModel: selection.model.id });
  const disableExperimentalBetas = true;
  if (dryRun) {
    printDryRun(
      selection.backend.name,
      selection.model.id,
      selection.backend.baseUrl,
      selection.model.modelFormat,
      claudeArgs,
      conflicts,
      disableExperimentalBetas
    );
    return;
  }
  let proxyHandle = null;
  if (selection.model.modelFormat === "openai") {
    try {
      proxyHandle = await startProxy(selection.backend.baseUrl);
      p2.log.info(
        `Translation proxy started on port ${proxyHandle.port} ` + pc2.dim(`(${selection.backend.baseUrl}/v1/chat/completions)`)
      );
    } catch (err) {
      p2.log.error(`Failed to start translation proxy: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }
  const childEnv = buildChildEnv(selection.backend, selection.model.id, effectiveKey, proxyHandle?.port);
  childEnv["CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"] = "1";
  const debugLogPath = join3(tmpdir(), "opencode-starter-debug.log");
  const traceArgs = trace ? ["--debug-file", debugLogPath] : [];
  if (trace) {
    p2.log.info(`Debug log: ${debugLogPath}`);
  }
  const exitCode = await launchClaude(childEnv, selection.model.id, [...traceArgs, ...claudeArgs]);
  if (proxyHandle) {
    proxyHandle.close();
  }
  if (trace && existsSync2(debugLogPath)) {
    const log3 = readFileSync2(debugLogPath, "utf8");
    const errorLines = log3.split("\n").filter(
      (l) => l.includes("error") || l.includes("Error") || l.includes('"type":"error"') || l.includes("status")
    );
    console.log("\n" + pc2.bold(pc2.cyan("\u2500\u2500 Debug trace \u2500\u2500")));
    if (errorLines.length > 0) {
      errorLines.slice(0, 30).forEach((l) => console.log(pc2.dim(l)));
    } else {
      console.log(pc2.dim("(no errors found in debug log)"));
    }
    console.log(pc2.dim(`Full log: ${debugLogPath}`));
  }
  process.exit(exitCode);
}
main().catch((err) => {
  if (err === /* @__PURE__ */ Symbol.for("clack:cancel")) {
    process.exit(0);
  }
  console.error(pc2.red("\nUnexpected error:"), err);
  process.exit(1);
});
//# sourceMappingURL=cli.js.map