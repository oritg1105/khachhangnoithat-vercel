import { getCustomerSession } from "../models/customerAuthModel.js";
import { getCustomerAccount } from "../models/customerAccountModel.js";

const root = document.querySelector("#order-success");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatMoney(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency", currency: "VND", maximumFractionDigits: 0
  }).format(value);
}

function renderError(message) {
  root.innerHTML = `
    <div class="store-eyebrow">Woodcraft · Đơn hàng</div>
    <h1>Chưa thể tải thông tin đơn hàng</h1>
    <p class="store-order-success-error">${escapeHtml(message)}</p>
    <div class="store-order-success-actions">
      <a class="store-button" href="/">Quay lại cửa hàng</a>
      <a class="store-button secondary" href="account.html">Xem tài khoản</a>
    </div>`;
}

async function renderOrder() {
  if (!getCustomerSession()) {
    window.location.replace("customer-login.html");
    return;
  }

  const rawId = new URLSearchParams(window.location.search).get("id");
  const orderId = /^\d+$/.test(rawId || "") ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    renderError("Mã đơn hàng không hợp lệ.");
    return;
  }

  try {
    const account = await getCustomerAccount();
    const order = account.orders.find(item => item.id === orderId);
    if (!order) {
      renderError("Không tìm thấy đơn hàng trong tài khoản của bạn.");
      return;
    }

    root.innerHTML = `
      <div class="store-order-success-icon" aria-hidden="true">✓</div>
      <div class="store-eyebrow">Woodcraft · Xác nhận đơn hàng</div>
      <h1>Đặt hàng thành công</h1>
      <p>Cảm ơn ${escapeHtml(account.profile.hoten || account.username)} đã mua sắm tại Woodcraft. Đơn hàng của bạn đã được ghi nhận.</p>
      <article class="store-order">
        <div class="store-order-heading"><strong>Hóa đơn HD${order.id}</strong><span>${escapeHtml(order.status)}</span></div>
        <p>Ngày đặt: ${escapeHtml(String(order.date || "").slice(0, 10))}</p>
        <p>Giao đến: ${escapeHtml(order.address)}</p>
        <ul>${order.items.map(item => `<li>${escapeHtml(item.name)} × ${item.quantity}<span>${formatMoney(item.total)}</span></li>`).join("")}</ul>
        <div class="store-order-total">Thanh toán khi nhận hàng: <strong>${formatMoney(order.total)}</strong></div>
      </article>
      <div class="store-order-success-actions">
        <a class="store-button" href="/">Tiếp tục mua sắm</a>
        <a class="store-button secondary" href="account.html">Xem tài khoản</a>
      </div>`;
  } catch (error) {
    renderError(error.message);
  }
}

renderOrder();
