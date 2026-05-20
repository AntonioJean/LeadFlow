import fs from "node:fs";
import path from "node:path";

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index);
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

const rootEnv = readEnv(path.resolve(process.cwd(), ".env"));
const infraEnv = readEnv(path.resolve(process.cwd(), "infra/evolution/.env"));

const baseUrl = rootEnv.EVOLUTION_API_URL || rootEnv.EVOLUTION_BASE_URL || infraEnv.SERVER_URL || "http://localhost:8080";
const apiKey = rootEnv.EVOLUTION_API_KEY || infraEnv.AUTHENTICATION_API_KEY;
const instance = rootEnv.EVOLUTION_INSTANCE || rootEnv.EVOLUTION_DEFAULT_INSTANCE || "leadflow";

async function request(label, url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text.slice(0, 300);
    }
    console.log(JSON.stringify({ label, ok: response.ok, status: response.status, body }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ label, ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  }
}

console.log(JSON.stringify({ baseUrl, instance, apiKeyConfigured: Boolean(apiKey) }, null, 2));

await request("health", `${baseUrl.replace(/\/+$/, "")}/`);
await request("instances", `${baseUrl.replace(/\/+$/, "")}/instance/fetchInstances`);
await request("connection", `${baseUrl.replace(/\/+$/, "")}/instance/connectionState/${instance}`);
