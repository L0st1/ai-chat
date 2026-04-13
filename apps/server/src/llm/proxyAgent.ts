import { ProxyAgent } from "undici";

let agent: ProxyAgent | undefined;
let cachedUrl: string | undefined;

function readProxyUrlFromEnv(): string | undefined {
  const raw =
    process.env.LLM_PROXY?.trim() ||
    process.env.LLM_HTTPS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  return raw || undefined;
}

/** 懒创建、按 URL 复用，便于在首次请求前已由入口加载 `.env` */
export function getLlmProxyDispatcher(): ProxyAgent | undefined {
  const url = readProxyUrlFromEnv();
  if (!url) {
    return undefined;
  }
  if (agent && cachedUrl === url) {
    return agent;
  }
  if (agent) {
    void agent.close();
  }
  cachedUrl = url;
  agent = new ProxyAgent(url);
  return agent;
}
