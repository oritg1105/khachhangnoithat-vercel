const SESSION_KEY = "woodcraft-customer-auth";

function saveSession(session) {
  if (!session?.access_token || !session?.refresh_token || !session?.user) {
    throw new Error("Supabase không trả về phiên đăng nhập hợp lệ.");
  }
  const saved = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Date.now() + Math.max(0, Number(session.expires_in || 3600) - 60) * 1000,
    user: session.user
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  return saved;
}

export function getCustomerSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return session?.access_token && session?.refresh_token && session?.user ? session : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

async function requestAuth(body) {
  const response = await fetch("/api/customer-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Không thể xác thực tài khoản.");
    error.status = response.status;
    throw error;
  }
  return saveSession(payload);
}

export async function getValidCustomerSession() {
  const session = getCustomerSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at > Date.now()) return session;
  try {
    return await requestAuth({ action: "refresh", refreshToken: session.refresh_token });
  } catch (error) {
    signOutCustomer();
    throw new Error(`Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục. ${error.message}`);
  }
}

export function signInCustomer(username, password) {
  return requestAuth({ action: "signin", username: username.trim(), password });
}

export function signUpCustomer({ username, email, password, fullName, phone }) {
  return requestAuth({
    action: "signup",
    username: username.trim(),
    email: String(email || "").trim(),
    password,
    fullName: fullName.trim(),
    phone: phone.trim()
  });
}

export function signOutCustomer() {
  sessionStorage.removeItem(SESSION_KEY);
}
