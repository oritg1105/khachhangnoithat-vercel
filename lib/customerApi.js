const fs = require("fs");
const path = require("path");

function getEnvironmentValue(name) {
  if (process.env[name]) return process.env[name];
  if (process.env.VERCEL) return "";

  for (const fileName of [".env.development.local", ".env.local"]) {
    try {
      const filePath = path.join(process.cwd(), fileName);
      const line = fs.readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .find(entry => entry.trim().startsWith(`${name}=`));
      if (line) {
        return line.slice(name.length + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return "";
}

function getSupabaseConfig() {
  const url = getEnvironmentValue("SUPABASE_URL").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = getEnvironmentValue("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY.");
  return { url, key };
}

function sendError(response, status, message) {
  return response.status(status).json({ error: message });
}

async function supabaseRequest(url, key, endpoint, options = {}) {
  const response = await fetch(`${url}${endpoint}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${options.token || key}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.msg || payload?.error_description || payload?.error || `Supabase trả về ${response.status}.`);
    error.status = response.status;
    error.details = payload?.details;
    throw error;
  }
  return payload;
}

async function getAuthenticatedUser(request, config) {
  const authorization = request.headers.authorization || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    const error = new Error("Vui lòng đăng nhập.");
    error.status = 401;
    throw error;
  }
  const user = await supabaseRequest(config.url, config.key, "/auth/v1/user", { token });
  return { user, token };
}

function statusFor(error) {
  return Number.isInteger(error.status) ? error.status : 502;
}

module.exports = { getAuthenticatedUser, getSupabaseConfig, sendError, statusFor, supabaseRequest };
