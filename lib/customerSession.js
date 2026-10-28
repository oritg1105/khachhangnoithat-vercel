const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function getEnvironmentValue(name) {
  const isProductionDeployment = process.env.VERCEL && process.env.NODE_ENV === "production";
  if (!isProductionDeployment) {
    for (const fileName of [".env.development.local", ".env.local"]) {
      try {
        const lines = fs.readFileSync(path.join(__dirname, "..", fileName), "utf8").split(/\r?\n/);
        const line = lines.find(entry => new RegExp(`^\\s*${name}\\s*=`).test(entry));
        if (line) {
          const value = line.slice(line.indexOf("=") + 1).trim();
          return value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  if (process.env[name]) return process.env[name];
  return "";
}

function getCustomerConfig() {
  return { ...getCustomerPublicConfig(), secret: getCustomerSessionSecret() };
}

function getCustomerSessionSecret() {
  const secret = getEnvironmentValue("CUSTOMER_SESSION_SECRET");
  if (secret.length < 32) throw new Error("CUSTOMER_SESSION_SECRET phải có tối thiểu 32 ký tự.");
  return secret;
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

function createCustomerSessionError(status, message, code = "CUSTOMER_SESSION_INVALID") {
  const error = createHttpError(status, message);
  error.code = code;
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
  if (typeof token !== "string") {
    throw createCustomerSessionError(401, "Vui lòng đăng nhập.", "CUSTOMER_SESSION_MISSING");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw createCustomerSessionError(401, "Phiên đăng nhập không hợp lệ.", "CUSTOMER_SESSION_MALFORMED");
  }
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw createCustomerSessionError(
      401,
      "Chữ ký phiên đăng nhập không hợp lệ. Máy chủ không chấp nhận token phiên này.",
      "CUSTOMER_SESSION_SIGNATURE_INVALID"
    );
  }

  let payload;
  let header;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw createCustomerSessionError(401, "Nội dung phiên đăng nhập không hợp lệ.", "CUSTOMER_SESSION_MALFORMED");
  }
  if (header.alg !== "HS256" || header.typ !== "JWT" ||
      payload.iss !== "woodcraft-customer" || payload.type !== type ||
      !Number.isInteger(payload.id) || payload.id < 1 ||
      typeof payload.username !== "string" ||
      !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw createCustomerSessionError(
      401,
      "Phiên đăng nhập đã hết hạn hoặc có thông tin không hợp lệ.",
      "CUSTOMER_SESSION_CLAIMS_INVALID"
    );
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
    throw createCustomerSessionError(
      401,
      "Token hợp lệ nhưng tài khoản trong phiên không khớp tài khoản khách hàng trong database.",
      "CUSTOMER_ACCOUNT_NOT_LINKED"
    );
  }
  if (Number(account.trangthai) === 0) {
    const error = createCustomerSessionError(403, "Tài khoản khách hàng đã bị khóa.");
    error.code = "CUSTOMER_ACCOUNT_DISABLED";
    throw error;
  }
  return { user, account };
}

function statusFor(error) {
  return Number.isInteger(error.status) ? error.status : 502;
}

module.exports = {
  createCustomerSession,
  createCustomerSessionError,
  createHttpError,
  customerDatabaseRequest,
  getAuthenticatedCustomer,
  getCustomerConfig,
  getCustomerPublicConfig,
  signCustomerToken,
  statusFor,
  verifyCustomerToken
};
