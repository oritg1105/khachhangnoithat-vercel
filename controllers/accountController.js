import { getCustomerSession, signOutCustomer } from "../models/customerAuthModel.js";
import {
  addCustomerAddress, deleteCustomerAddress, getCustomerAccount, updateCustomerAddress, updateCustomerProfile
} from "../models/customerAccountModel.js";
import { readCart } from "../models/storefrontModel.js";

let customerAccount = null;
const requestedTab = new URLSearchParams(window.location.search).get("tab");
let activeTab = ["profile", "orders", "addresses"].includes(requestedTab) ? requestedTab : "profile";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const formatMoney = value => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(value);

function renderShell() {
  const session = getCustomerSession();
  if (!session) {
    window.location.replace("customer-login.html");
    return false;
  }
  document.querySelector("#account-app").innerHTML = `
    <header class="store-header">
      <a class="store-brand" href="/">WOODCRAFT<span>NỘI THẤT GỖ · CỬA HÀNG</span></a>
      <nav class="store-nav" aria-label="Điều hướng chính">
        <a href="/">Sản phẩm</a>
        <a class="store-cart-link" href="cart.html">Giỏ hàng (<span id="account-cart-count">0</span>)</a>
        <a class="store-cart-link" href="account.html">Tài khoản</a>
      </nav>
    </header>
    <main class="store-profile-main">
      <a class="store-page-back" href="/">← Quay lại cửa hàng</a>
      <section class="store-profile-hero">
        <div class="store-profile-cover" aria-hidden="true"></div>
        <div class="store-profile-identity">
          <div class="store-profile-avatar" id="account-avatar" aria-hidden="true">W</div>
          <div class="store-profile-heading">
            <div class="store-eyebrow">Tài khoản khách hàng</div>
            <h1 id="account-greeting">Đang tải tài khoản...</h1>
            <p id="account-meta" class="store-account-meta"></p>
          </div>
          <button class="store-text-button" id="account-signout" type="button">Đăng xuất</button>
        </div>
      </section>
      <nav class="store-profile-tabs" role="tablist" aria-label="Các mục tài khoản">
        <button type="button" role="tab" data-account-tab="profile">Thông tin cá nhân</button>
        <button type="button" role="tab" data-account-tab="addresses">Địa chỉ giao hàng</button>
        <button type="button" role="tab" data-account-tab="orders">Lịch sử mua hàng</button>
      </nav>
      <section class="store-account-page" id="account-panel" role="tabpanel" aria-live="polite">
        <p>Đang tải...</p>
      </section>
    </main>
    <footer class="store-footer">Woodcraft · Nội thất gỗ cho không gian sống của bạn</footer>
    <div class="store-toast" id="account-toast" role="status" aria-live="polite" hidden></div>`;

  document.querySelectorAll("[data-account-tab]").forEach(button =>
    button.addEventListener("click", () => {
      renderAccountTab(button.dataset.accountTab);
    })
  );
  updateCartCount();
  window.addEventListener("storage", event => {
    if (event.key === "woodcraft-customer-cart") updateCartCount();
  });
  document.querySelector("#account-signout").addEventListener("click", () => {
    signOutCustomer();
    window.location.assign("/");
  });
  return true;
}

function showMessage(message, success = false) {
  const node = document.querySelector("#account-toast");
  node.textContent = message;
  node.classList.toggle("success", success);
  node.hidden = false;
  window.setTimeout(() => {
    node.hidden = true;
  }, 3000);
}

function renderAccountTab(tab, message = "") {
  activeTab = tab;
  const panel = document.querySelector("#account-panel");
  document.querySelectorAll("[data-account-tab]").forEach(button => {
    const active = button.dataset.accountTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.setAttribute("aria-controls", "account-panel");
  });

  if (tab === "profile") {
    panel.innerHTML = `<div class="store-profile-details">
      <h2>Chi tiết thông tin</h2>
      ${message ? `<p class="store-profile-success" role="status">${escapeHtml(message)}</p>` : ""}
      ${renderProfileRow("Họ và tên", "fullName", customerAccount.profile.hoten, true)}
      ${renderProfileRow("Email", "email", customerAccount.profile.email, false)}
      ${renderProfileRow("Số điện thoại", "phone", customerAccount.profile.sdt, true)}
    </div>`;
    panel.querySelectorAll("[data-profile-edit]").forEach(button =>
      button.addEventListener("click", () => renderProfileEditor(button.dataset.profileEdit))
    );
    return;
  }

  if (tab === "addresses") {
    panel.innerHTML = `<form id="account-address-form">
      <label class="store-field"><span>Thêm địa chỉ giao hàng</span><input name="address" maxlength="500" minlength="5" required></label>
      <button class="store-button" type="submit">Lưu địa chỉ</button>
      <p class="store-form-message" id="account-address-error" role="alert" hidden></p>
    </form>
    ${customerAccount.addresses.length ? `<div class="store-profile-details store-saved-addresses">
      <h2>Địa chỉ đã lưu</h2>
      ${customerAccount.addresses.map((address, index) => `
        <div class="store-profile-row store-address-row" data-address-row="${index}">
          <span class="store-profile-label">Địa chỉ ${index + 1}</span>
          <span class="store-profile-value">${escapeHtml(address)}</span>
          <span class="store-address-actions">
            <button class="store-profile-edit" type="button" data-edit-address="${index}" aria-label="Chỉnh sửa địa chỉ ${index + 1}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm17.7-10.2a.93.93 0 0 0 0-1.3l-2.7-2.7a.93.93 0 0 0-1.3 0l-1.7 1.7 3.5 3.5 2.2-1.2Z"/></svg>
            </button>
            <button class="store-address-delete" type="button" data-delete-address="${index}" aria-label="Xóa địa chỉ ${index + 1}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>
            </button>
          </span>
        </div>`).join("")}
    </div>` : `<p class="store-address-empty">Chưa lưu địa chỉ giao hàng.</p>`}`;
    panel.querySelector("#account-address-form").addEventListener("submit", submitAddress);
    panel.querySelectorAll("[data-edit-address]").forEach(button =>
      button.addEventListener("click", () => renderAddressEditor(Number(button.dataset.editAddress)))
    );
    panel.querySelectorAll("[data-delete-address]").forEach(button =>
      button.addEventListener("click", () => deleteAddress(Number(button.dataset.deleteAddress)))
    );
    return;
  }

  panel.innerHTML = customerAccount.orders.length ? customerAccount.orders.map(order => `
    <article class="store-order">
      <div class="store-order-heading"><strong>Hóa đơn HD${order.id}</strong><span>${escapeHtml(order.status)}</span></div>
      <p>Ngày đặt: ${escapeHtml(String(order.date || "").slice(0, 10))}</p>
      <p>Giao đến: ${escapeHtml(order.address)}</p>
      <ul>${order.items.map(item => `<li>${escapeHtml(item.name)} × ${item.quantity}<span>${formatMoney(item.total)}</span></li>`).join("")}</ul>
      <div class="store-order-total">Tổng cộng: <strong>${formatMoney(order.total)}</strong></div>
    </article>`).join("") : `<p>Bạn chưa có đơn hàng nào.</p>`;
}

async function refreshAccount() {
  customerAccount = await getCustomerAccount();
  const session = getCustomerSession();
  document.querySelector("#account-greeting").textContent = `Xin chào, ${customerAccount.profile.hoten || ""}`;
  document.querySelector("#account-meta").textContent =
    `Tên đăng nhập: ${session.user.username}${customerAccount.profile.email ? ` · ${customerAccount.profile.email}` : ""}`;
  const name = customerAccount.profile.hoten || "";
  const initials = name.trim().split(/\s+/).slice(-2).map(part => part[0]).join("").toLocaleUpperCase("vi") || "W";
  document.querySelector("#account-avatar").textContent = initials;
  document.querySelector('[data-account-tab="orders"]').textContent =
    `Lịch sử mua hàng (${customerAccount.orders.length})`;
  document.querySelector('[data-account-tab="addresses"]').textContent =
    `Địa chỉ giao hàng (${customerAccount.addresses.length})`;
  renderAccountTab(activeTab);
}

function updateCartCount() {
  const count = document.querySelector("#account-cart-count");
  if (count) count.textContent = String(readCart().reduce((sum, item) => sum + item.quantity, 0));
}

function renderProfileRow(label, field, value, editable) {
  const displayValue = value
    ? escapeHtml(value)
    : `<span class="store-profile-empty-value">Chưa cập nhật</span>`;
  return `<div class="store-profile-row">
    <span class="store-profile-label">${label}</span>
    <span class="store-profile-value">${displayValue}</span>
    ${editable
      ? `<button class="store-profile-edit" type="button" data-profile-edit="${field}" aria-label="Chỉnh sửa ${label}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm17.7-10.2a.93.93 0 0 0 0-1.3l-2.7-2.7a.93.93 0 0 0-1.3 0l-1.7 1.7 3.5 3.5 2.2-1.2Z"/></svg>
        </button>`
      : `<span class="store-profile-edit-placeholder" aria-hidden="true"></span>`}
  </div>`;
}

function renderProfileEditor(field) {
  if (!["fullName", "phone"].includes(field)) return;
  const isName = field === "fullName";
  const label = isName ? "Họ và tên" : "Số điện thoại";
  const currentValue = isName ? customerAccount.profile.hoten || "" : customerAccount.profile.sdt || "";
  const row = [...document.querySelectorAll(".store-profile-row")]
    .find(element => element.querySelector(`[data-profile-edit="${field}"]`));
  if (!row) return;
  row.outerHTML = `<form class="store-profile-row store-profile-edit-row" data-profile-form="${field}">
    <label class="store-profile-label" for="account-profile-${field}">${label}</label>
    <span class="store-profile-value">
      <input id="account-profile-${field}" name="value" value="${escapeHtml(currentValue)}"
        ${isName ? 'maxlength="120" required' : 'type="tel" maxlength="30"'} autocomplete="${isName ? "name" : "tel"}">
      <span class="store-form-message" role="alert" hidden></span>
    </span>
    <span class="store-profile-edit-actions">
      <button class="store-profile-save" type="submit" aria-label="Lưu ${label}">Lưu</button>
      <button class="store-profile-cancel" type="button" aria-label="Hủy chỉnh sửa ${label}">Hủy</button>
    </span>
  </form>`;
  const form = document.querySelector(`[data-profile-form="${field}"]`);
  form.querySelector("input").focus();
  form.addEventListener("submit", event => submitProfileUpdate(event, field));
  form.querySelector(".store-profile-cancel").addEventListener("click", () => renderAccountTab("profile"));
}

function renderAddressEditor(index) {
  const address = customerAccount.addresses[index];
  if (address === undefined) return;
  const row = document.querySelector(`[data-address-row="${index}"]`);
  if (!row) return;
  row.outerHTML = `<form class="store-profile-row store-profile-edit-row store-address-row" data-address-form="${index}">
    <label class="store-profile-label" for="account-address-${index}">Địa chỉ ${index + 1}</label>
    <span class="store-profile-value">
      <textarea id="account-address-${index}" name="address" minlength="5" maxlength="500" required>${escapeHtml(address)}</textarea>
      <span class="store-form-message" role="alert" hidden></span>
    </span>
    <span class="store-profile-edit-actions">
      <button class="store-profile-save" type="submit" aria-label="Lưu địa chỉ ${index + 1}">Lưu</button>
      <button class="store-profile-cancel" type="button" aria-label="Hủy sửa địa chỉ ${index + 1}">Hủy</button>
    </span>
  </form>`;
  const form = document.querySelector(`[data-address-form="${index}"]`);
  form.querySelector("textarea").focus();
  form.addEventListener("submit", event => submitAddressUpdate(event, address));
  form.querySelector(".store-profile-cancel").addEventListener("click", () => renderAccountTab("addresses"));
}

async function submitProfileUpdate(event, field) {
  event.preventDefault();
  const form = event.currentTarget;
  const value = String(new FormData(form).get("value") || "").trim();
  const messageNode = form.querySelector(".store-form-message");
  const button = form.querySelector('[type="submit"]');
  if (field === "fullName" && !value) {
    messageNode.textContent = "Họ và tên không được để trống.";
    messageNode.hidden = false;
    return;
  }
  const fullName = field === "fullName" ? value : customerAccount.profile.hoten || "";
  const phone = field === "phone" ? value : customerAccount.profile.sdt || "";
  button.disabled = true;
  try {
    await updateCustomerProfile(fullName, phone);
    await refreshAccount();
    renderAccountTab("profile", `Đã cập nhật ${field === "fullName" ? "họ tên" : "số điện thoại"}.`);
  } catch (error) {
    messageNode.textContent = error.message;
    messageNode.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function submitAddress(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = document.querySelector("#account-address-error");
  const button = form.querySelector('[type="submit"]');
  const address = String(new FormData(form).get("address") || "").trim();
  button.disabled = true;
  try {
    await addCustomerAddress(address);
    await refreshAccount();
  } catch (error) {
    errorNode.textContent = error.message;
    errorNode.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function submitAddressUpdate(event, currentAddress) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const message = form.querySelector(".store-form-message");
  const address = String(new FormData(form).get("address") || "").trim();
  button.disabled = true;
  try {
    await updateCustomerAddress(currentAddress, address);
    await refreshAccount();
    showMessage("Đã cập nhật địa chỉ giao hàng.", true);
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function deleteAddress(index) {
  const address = customerAccount.addresses[index];
  if (!address || !window.confirm("Xóa địa chỉ giao hàng này?")) return;
  try {
    await deleteCustomerAddress(address);
    await refreshAccount();
  } catch (error) {
    showMessage(error.message);
  }
}

async function startAccountPage() {
  if (!renderShell()) return;
  try {
    await refreshAccount();
  } catch (error) {
    if (error.status === 401) {
      signOutCustomer();
      window.location.replace("customer-login.html");
      return;
    }
    document.querySelector("#account-greeting").textContent = "Không thể tải tài khoản";
    document.querySelector("#account-panel").innerHTML = `
      <p class="store-form-message" role="alert">${escapeHtml(error.message)}</p>
      <button class="store-button" id="account-retry" type="button">Thử lại</button>`;
    document.querySelector("#account-retry").addEventListener("click", startAccountPage);
  }
}

startAccountPage();
