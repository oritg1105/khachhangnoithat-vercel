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
  return `<a class="store-customer-profile" href="account.html">${username}</a>
    <button class="store-customer-logout" type="button" data-customer-signout>Đăng xuất</button>`;
}

export function renderStoreNavigation(session, primaryLinks, secondaryLinks, menuId) {
  return `<nav class="store-nav" aria-label="Điều hướng chính">
    <div class="store-nav-primary">${primaryLinks}</div>
    <button class="store-menu-toggle" type="button" aria-label="Mở menu điều hướng" aria-expanded="false" aria-controls="${menuId}">
      <span></span><span></span><span></span>
    </button>
    <div class="store-nav-secondary" id="${menuId}">
      ${secondaryLinks}
      ${renderCustomerMenu(session)}
    </div>
  </nav>`;
}

export function initializeStoreNavigation(container) {
  const toggle = container.querySelector(".store-menu-toggle");
  const closeMenu = () => {
    container.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const isOpen = container.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
  container.querySelectorAll(".store-nav-secondary a").forEach(link =>
    link.addEventListener("click", closeMenu)
  );
  document.addEventListener("click", event => {
    if (!container.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });
  container.querySelectorAll("[data-customer-signout]").forEach(button => {
    button.addEventListener("click", () => {
      signOutCustomer();
      window.location.assign("/");
    });
  });
}