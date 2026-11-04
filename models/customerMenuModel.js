import { signOutCustomer } from "./customerAuthModel.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function renderCustomerMenu(session) {
  if (!session) {
    return `<div class="store-auth-actions">
      <a class="store-cart-link" href="customer-login.html">Đăng nhập</a>
      <a class="store-cart-link store-register-link" href="customer-register.html">Đăng ký</a>
    </div>`;
  }

  const username = escapeHtml(session.user.username);
  return `<div class="store-customer-menu">
    <div class="store-customer-actions-desktop">
      <a class="store-customer-profile" href="account.html">${username}</a>
      <button class="store-customer-logout" type="button" data-customer-signout>Đăng xuất</button>
    </div>
    <details class="store-customer-dropdown">
      <summary aria-label="Mở menu tài khoản"><span>Tài khoản</span><span aria-hidden="true">⌄</span></summary>
      <div class="store-customer-dropdown-panel">
        <a href="account.html">Hồ sơ khách hàng</a>
        <button type="button" data-customer-signout>Đăng xuất</button>
      </div>
    </details>
  </div>`;
}

export function initializeCustomerMenu(container) {
  container.querySelectorAll("[data-customer-signout]").forEach(button => {
    button.addEventListener("click", () => {
      signOutCustomer();
      window.location.assign("/");
    });
  });
}
