#!/usr/bin/env node
// camofox-browser MCP server
//
// Standalone Model Context Protocol server that exposes the camofox-browser
// REST API (default http://localhost:9377) as MCP tools. Tool names, schemas,
// REST routes, request bodies, auth, and response shaping are imported from
// mcp/lib/tool-contracts.mjs — the SAME source of truth the OpenClaw plugin
// (plugin.ts) uses — so behavior is identical whether an agent reaches camofox
// via OpenClaw or MCP. Drift is structurally impossible.
//
// Transport: stdio (Claude Code / Codex / agy / Cursor / opencode spawn this as
// a child process). The camofox REST server itself must be running (npm start) —
// this server only forwards calls, it does not launch the browser.
//
// Auth:
//   - CAMOFOX_ACCESS_KEY (global): forwarded as `Authorization: Bearer` on every
//     request so globally-authenticated REST servers accept MCP traffic.
//   - CAMOFOX_API_KEY (cookie import): forwarded as `Authorization: Bearer` on
//     the cookie-import route only.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import { loadMcpConfig } from "./lib/config.mjs";
import {
  TOOL_DEFS,
  runTool,
  adaptResponse,
} from "./lib/tool-contracts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Version from this package's own package.json (single source — no hardcoded
// duplicate). mcp/ is an independently installable package (@askjo/camofox-browser-mcp)
// with its own manifest, so this reads locally rather than the parent repo's.
const VERSION = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf8")
).version;

// Server config (apiKey / accessKey / cookiesDir / port). The standalone
// package reads only its own environment settings; CAMOFOX_BASE_URL overrides
// the derived local URL.
const CONFIG = loadMcpConfig();
const BASE_URL = process.env.CAMOFOX_BASE_URL || `http://localhost:${CONFIG.port}`;

// Stable userId is essential: persistence hashes it to pick the on-disk
// account profile. A random id here silently creates a fresh login on restart.
// Set CAMOFOX_USER_ID to isolate a second person's/browser identity.
const USER_ID = process.env.CAMOFOX_USER_ID || 'personal';
// sessionKey partitions tabs within a user (matches plugin.ts fallback "default").
const SESSION_KEY = process.env.CAMOFOX_SESSION_KEY || "default";

// The standalone package declares the SDK directly. Surface a clear,
// actionable error if an incomplete installation is missing it.
let Server, StdioServerTransport, CallToolRequestSchema, ListToolsRequestSchema;
try {
  const serverMod = await import("@modelcontextprotocol/sdk/server/index.js");
  Server = serverMod.Server;
  const stdioMod = await import("@modelcontextprotocol/sdk/server/stdio.js");
  StdioServerTransport = stdioMod.StdioServerTransport;
  const typesMod = await import("@modelcontextprotocol/sdk/types.js");
  CallToolRequestSchema = typesMod.CallToolRequestSchema;
  ListToolsRequestSchema = typesMod.ListToolsRequestSchema;
} catch {
  console.error(
    "[camofox-browser-mcp] @modelcontextprotocol/sdk is not installed.\n" +
      "Install the adapter dependencies with: npm install\n" +
      "from the @askjo/camofox-browser-mcp package directory."
  );
  process.exit(1);
}

const server = new Server(
  { name: "camofox-browser", version: VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }
  try {
    const { spec, payload } = await runTool(
      name,
      args || {},
      { userId: USER_ID, sessionKey: SESSION_KEY },
      BASE_URL,
      CONFIG
    );
    const content = adaptResponse(spec, payload);
    return { content };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `camofox error: ${err.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[camofox-browser-mcp] v${VERSION} connected → ${BASE_URL} (user=${USER_ID})`
);
