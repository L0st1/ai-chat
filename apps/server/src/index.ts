import dotenv from "dotenv";
import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Message } from "@ai-chat/shared";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

/** 上游 HTTPS 先解析到 IPv6 时，在部分网络下会 `UND_ERR_CONNECT_TIMEOUT`；优先 IPv4 与多数浏览器行为一致 */
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import { registerChatStreamRoute } from "./chat-stream.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

registerChatStreamRoute(app);

app.get("/health", (_req, res) => {
  const sample: Message = {
    role: "assistant",
    content: "ok",
  };
  res.json({ status: "ok", sample });
});

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
