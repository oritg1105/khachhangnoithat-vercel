const crypto = require("crypto");
const {
  createCustomerSession, createCustomerSessionError, createHttpError, customerDatabaseRequest,
  getCustomerConfig, signCustomerToken, statusFor, verifyCustomerToken
} = require("../lib/customerSession.js");

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_ITERATIONS = 120000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256");
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(password, storedPassword) {
  if (typeof storedPassword !== "string") return false;
  const [, iterationsText, saltText, hashText] = storedPassword.split("$");
  const iterations = Number(iterationsText);
  if (!storedPassword.startsWith("pbkdf2-sha256$") ||
      !Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000 ||
      !saltText || !hashText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return crypto.timingSafeEqual(actual, expected);
}

async function findCustomerAccount(config, username) {
  const escapedUsername = username.replace(/[\\%_]/g, character => `\\${character}`);
  const query = new URLSearchParams({
    select: "tendangnhap,matkhau,loaitaikhoan,id_khachhang,trangthai",
    tendangnhap: `ilike.${escapedUsername}`,
    loaitaikhoan: "eq.KHACHHANG",
    limit: "1"
  });
  const rows = await customerDatabaseRequest(config, `/rest/v1/dangnhap?${query}`);
  return rows?.[0] || null;
}

async function ensureUsernameAvailable(config, username) {
  const escapedUsername = username.replace(/[\\%_]/g, character => `\\${character}`);
  const query = new URLSearchParams({
    select: "tendangnhap",
    tendangnhap: `ilike.${escapedUsername}`,
    limit: "1000"
  });
  const rows = await customerDatabaseRequest(config, `/rest/v1/dangnhap?${query}`);
  if ((rows || []).some(row => String(row.tendangnhap || "").trim().toLowerCase() === username)) {
    throw createHttpError(409, "Tên đăng nhập đã được sử dụng.");
  }
}

function validateCredentials(username, password) {
  if (typeof username !== "string" || !USERNAME_PATTERN.test(username.trim()) ||
      typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw createHttpError(400, "Tên đăng nhập cần 3–40 ký tự chữ/số/._-; mật khẩu cần 8–128 ký tự.");
  }
  return { username: username.trim().toLowerCase(), password };
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  const { action } = request.body || {};
  let config;
  try {
    config = getCustomerConfig();
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }

  try {
    if (action === "signup") {
      const { username, password } = validateCredentials(request.body?.username, request.body?.password);
      const fullName = typeof request.body?.fullName === "string" ? request.body.fullName.trim() : "";
      const phone = typeof request.body?.phone === "string" ? request.body.phone.trim() : "";
      const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
      if (!fullName || fullName.length > 120 || phone.length > 30 ||
          (email && (email.length > 254 || !EMAIL_PATTERN.test(email)))) {
        throw createHttpError(400, "Họ tên, số điện thoại hoặc email không hợp lệ.");
      }

      await ensureUsernameAvailable(config, username);
      const createdCustomers = await customerDatabaseRequest(config, "/rest/v1/khachhang", {
        method: "POST",
        prefer: "return=representation",
        body: { hoten: fullName, sdt: phone || null, email: email || null }
      });
      const profile = createdCustomers?.[0];
      const customerId = Number(profile?.id_khachhang);
      if (!Number.isInteger(customerId) || customerId < 1) {
        throw new Error("Database không trả về mã khách hàng sau đăng ký.");
      }

      try {
        await customerDatabaseRequest(config, "/rest/v1/dangnhap", {
          method: "POST",
          prefer: "return=minimal",
          body: {
            tendangnhap: username,
            loaitaikhoan: "KHACHHANG",
            matkhau: hashPassword(password),
            id_khachhang: customerId,
            cccd_nhanvien: null,
            trangthai: 1
          }
        });
      } catch (error) {
        try {
          const rollback = new URLSearchParams({ id_khachhang: `eq.${customerId}` });
          await customerDatabaseRequest(config, `/rest/v1/khachhang?${rollback}`, { method: "DELETE" });
        } catch (rollbackError) {
          console.error("Customer signup profile rollback failed:", rollbackError.message);
          throw new Error("Không thể tạo tài khoản và cũng không thể hoàn tác hồ sơ khách. Kiểm tra dữ liệu KHACHHANG trong database.");
        }
        throw error;
      }

      return response.status(201).json(createCustomerSession(config, {
        id_khachhang: customerId,
        tendangnhap: username,
        email: profile.email
      }));
    }

    if (action === "signin") {
      const { username, password } = validateCredentials(request.body?.username, request.body?.password);
      const account = await findCustomerAccount(config, username);
      if (!account || !verifyPassword(password, account.matkhau)) {
        throw createHttpError(401, "Tên đăng nhập hoặc mật khẩu chưa đúng.");
      }
      if (Number(account.trangthai) === 0) throw createHttpError(403, "Tài khoản khách hàng đã bị khóa.");
      if (!Number.isInteger(Number(account.id_khachhang)) || Number(account.id_khachhang) < 1) {
        throw createHttpError(409, "Tài khoản khách hàng chưa được liên kết với hồ sơ.");
      }
      const customers = await customerDatabaseRequest(
        config,
        `/rest/v1/khachhang?select=id_khachhang,email&id_khachhang=eq.${Number(account.id_khachhang)}&limit=1`
      );
      return response.status(200).json(createCustomerSession(config, {
        id_khachhang: Number(account.id_khachhang),
        tendangnhap: account.tendangnhap,
        email: customers?.[0]?.email || null
      }));
    }

    if (action === "refresh") {
      const refresh = verifyCustomerToken(request.body?.refreshToken, config.secret, "refresh");
      const account = await findCustomerAccount(config, refresh.username);
      if (!account || Number(account.id_khachhang) !== refresh.id) {
        throw createCustomerSessionError(
          401,
          "Tài khoản trong token làm mới không khớp tài khoản khách hàng trong database.",
          "CUSTOMER_ACCOUNT_NOT_LINKED"
        );
      }
      if (Number(account.trangthai) === 0) {
        const error = createCustomerSessionError(403, "Tài khoản khách hàng đã bị khóa.");
        error.code = "CUSTOMER_ACCOUNT_DISABLED";
        throw error;
      }
      const customers = await customerDatabaseRequest(
        config,
        `/rest/v1/khachhang?select=id_khachhang,email&id_khachhang=eq.${refresh.id}&limit=1`
      );
      return response.status(200).json(createCustomerSession(config, {
        id_khachhang: refresh.id,
        tendangnhap: refresh.username,
        email: customers?.[0]?.email || null
      }));
    }

    return response.status(400).json({ error: "Thao tác xác thực không hợp lệ." });
  } catch (error) {
    if (statusFor(error) >= 500) console.error("Customer password authentication failed:", error.message);
    const message = statusFor(error) === 409 && action === "signup"
      ? "Tên đăng nhập có thể đã được sử dụng. Hãy chọn tên khác."
      : error.message;
    return response.status(statusFor(error)).json({
      error: message,
      ...(error.code ? { code: error.code } : {})
    });
  }
};
