import { signInCustomer, signUpCustomer } from "../models/customerAuthModel.js";

const root = document.querySelector("#customer-auth-app");
const isRegistering = root.dataset.authMode === "signup";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderAuthPage() {
  const title = isRegistering ? "Tạo tài khoản khách hàng" : "Đăng nhập khách hàng";
  const sessionExpired = !isRegistering &&
    new URLSearchParams(window.location.search).get("reason") === "session";
  root.innerHTML = `
    <a class="customer-auth-brand" href="/">WOODCRAFT<span>NỘI THẤT GỖ</span></a>
    <section class="customer-auth-card" aria-labelledby="customer-auth-title">
      <a class="customer-auth-back" href="/">← Quay lại cửa hàng</a>
      <div class="store-eyebrow">Tài khoản Woodcraft</div>
      <h1 id="customer-auth-title">${title}</h1>
      <p class="customer-auth-intro">${isRegistering
        ? "Tạo tên đăng nhập và mật khẩu để quản lý đơn hàng COD."
        : "Đăng nhập bằng tên đăng nhập để quản lý thông tin và đặt hàng COD."}</p>
      ${sessionExpired ? `<p class="store-auth-notice" role="status">Phiên đăng nhập cũ không còn hợp lệ. Đăng nhập lại để tiếp tục thanh toán; không cần tạo secret mới.</p>` : ""}
      <form id="customer-auth-form">
        ${isRegistering ? `<label class="store-field"><span>Họ và tên</span><input name="fullName" autocomplete="name" maxlength="120" required></label>
          <label class="store-field"><span>Số điện thoại</span><input name="phone" type="tel" autocomplete="tel" maxlength="30"></label>
          <label class="store-field"><span>Tên đăng nhập</span><input name="username" autocomplete="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" required></label>
          <label class="store-field"><span>Email (không bắt buộc)</span><input name="email" type="email" autocomplete="email" maxlength="254"></label>` : `
          <label class="store-field"><span>Tên đăng nhập</span><input name="username" autocomplete="username" minlength="3" maxlength="40" required></label>`}
        <label class="store-field"><span>Mật khẩu</span><input name="password" type="password" autocomplete="${isRegistering ? "new-password" : "current-password"}" minlength="8" maxlength="128" required></label>
        <button class="store-button customer-auth-submit" type="submit">${isRegistering ? "Đăng ký" : "Đăng nhập"}</button>
        <p class="customer-auth-note">Hiện chưa hỗ trợ tự khôi phục mật khẩu. Hãy ghi nhớ mật khẩu.</p>
        <p class="store-form-message" id="customer-auth-message" role="alert" hidden></p>
      </form>
      <p class="customer-auth-switch">${isRegistering
        ? `Đã có tài khoản? <a href="customer-login.html">Đăng nhập</a>`
        : `Chưa có tài khoản? <a href="customer-register.html">Đăng ký</a>`}</p>
    </section>`;
  document.querySelector("#customer-auth-form").addEventListener("submit", submitAuth);
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  const message = document.querySelector("#customer-auth-message");
  const values = Object.fromEntries(new FormData(form).entries());
  submitButton.disabled = true;
  message.hidden = true;

  try {
    if (isRegistering) {
      await signUpCustomer(values);
      window.location.assign("account.html");
    } else {
      await signInCustomer(values.username, values.password);
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next === "checkout.html" ? "checkout.html" : "/");
    }
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
    submitButton.disabled = false;
  }
}

renderAuthPage();
