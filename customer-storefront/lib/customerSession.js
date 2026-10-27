const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function getEnvironmentValue(name) {
  if (process.env[name]) return process.env[name];
  if (process.env.VERCEL) return "";
  for (const fileName of [".env.development.local", ".env.local"]) {
    try {
      const line = fs.readFileSync(path.join(process.cwd(), fileName), "utf8")
        .split(/\r?\n/)
        .find(entry => entry.trim().startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return "";
}

function getCustomerConfig() {
  const url = getEnvironmentValue("SUPABASE_URL").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = getEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
  const secret = getEnvironmentValue("CUSTOMER_SESSION_SECRET");
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY phía server.");
  if (secret.length < 32) throw new Error("CUSTOMER_SESSION_SECRET phải có tối thiểu 32 ký tự.");
  return { url, key, secret };
}

function getCustomerPublicConfig() {
  const url = getEnvironmentValue("SUPABASE_URL").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = getEnvironmentValue("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY phía server.");
  return { url, key };
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function customerDatabaseRequest(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}${endpoint}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.details || `Cơ sở dữ liệu trả về HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signCustomerToken(payload, secret) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyCustomerToken(token, secret, type = "access") {
  if (typeof token !== "string") throw createHttpError(401, "Vui lòng đăng nhập.");
  const parts = token.split(".");
  if (parts.length !== 3) throw createHttpError(401, "Phiên đăng nhập không hợp lệ.");
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw createHttpError(401, "Phiên đăng nhập không hợp lệ.");
  }

  let payload;
  let header;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw createHttpError(401, "Phiên đăng nhập không hợp lệ.");
  }
  if (header.alg !== "HS256" || header.typ !== "JWT" ||
      payload.iss !== "woodcraft-customer" || payload.type !== type ||
      !Number.isInteger(payload.id) || payload.id < 1 ||
      typeof payload.username !== "string" ||
      !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw createHttpError(401, "Phiên đăng nhập đã hết hạn hoặc không hợp lệ.");
  }
  return payload;
}

function createCustomerSession(config, account) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: Number(account.id_khachhang),
    username: account.tendangnhap,
    email: account.email || null
  };
  const common = { iss: "woodcraft-customer", id: user.id, username: user.username, iat: now };
  return {
    access_token: signCustomerToken({ ...common, type: "access", exp: now + 3600 }, config.secret),
    refresh_token: signCustomerToken({ ...common, type: "refresh", exp: now + 30 * 24 * 3600 }, config.secret),
    expires_in: 3600,
    user
  };
}

async function getAuthenticatedCustomer(request, config) {
  const authorization = request.headers.authorization || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const user = verifyCustomerToken(token, config.secret);
  const rows = await customerDatabaseRequest(
    config,
    `/rest/v1/dangnhap?select=tendangnhap,loaitaikhoan,id_khachhang,trangthai&tendangnhap=eq.${encodeURIComponent(user.username)}&loaitaikhoan=eq.KHACHHANG&limit=1`
  );
  const account = rows?.[0];
  if (!account || Number(account.id_khachhang) !== user.id) {
    throw createHttpError(401, "Tài khoản không còn hợp lệ. Vui lòng đăng nhập lại.");
  }
  if (Number(account.trangthai) === 0) throw createHttpError(403, "Tài khoản khách hàng đã bị khóa.");
  return { user, account };
}

function statusFor(error) {
  return Number.isInteger(error.status) ? error.status : 502;
}

module.exports = {
  createCustomerSession,
  createHttpError,
  customerDatabaseRequest,
  getAuthenticatedCustomer,
  getCustomerConfig,
  getCustomerPublicConfig,
  signCustomerToken,
  statusFor,
  verifyCustomerToken
};
