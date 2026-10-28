import {
  getCartDetails, getStoreProducts, readCart, saveCart
} from "../models/storefrontModel.js";
import { getCustomerSession } from "../models/customerAuthModel.js";

let products = [];
let cart = readCart();
let pendingRemovalId = null;
let toastTimer;

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const formatMoney = value => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(value);

function showToast(message) {
  const toast = document.querySelector("#cart-toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function renderPage() {
  const session = getCustomerSession();
  document.querySelector("#cart-app").innerHTML = `
    <header class="store-header">
      <a class="store-brand" href="/">WOODCRAFT<span>NỘI THẤT GỖ · CỬA HÀNG</span></a>
      <nav class="store-nav" aria-label="Điều hướng chính">
        <a href="/">Sản phẩm</a>
        <a class="store-cart-link" href="cart.html">Giỏ hàng (<span id="cart-header-count">0</span>)</a>
        ${session
          ? `<a class="store-cart-link" href="account.html">${escapeHtml(session.user.username)}</a>`
          : `<a class="store-cart-link" href="customer-login.html">Đăng nhập</a>`}
      </nav>
    </header>
    <main class="store-page-main">
      <a class="store-page-back" href="/">← Tiếp tục mua sắm</a>
      <section class="store-cart-section store-cart-page" aria-labelledby="cart-title">
        <div class="store-section-heading">
          <div><div class="store-eyebrow">Lựa chọn của bạn</div><h1 id="cart-title">Giỏ hàng</h1></div>
          <span class="store-cart-count" id="cart-count">0 sản phẩm</span>
        </div>
        <div id="cart-contents" aria-live="polite"><div class="store-cart-empty">Đang tải giỏ hàng...</div></div>
        <div class="store-cart-summary"><span>Tạm tính</span><strong id="cart-total">0 ₫</strong></div>
        <button class="store-button" id="cart-checkout-button" type="button" disabled>Tiến hành đặt hàng COD</button>
        <p class="store-checkout-note">Giá và tồn kho được kiểm tra lại khi đặt hàng. Thanh toán bằng tiền mặt khi nhận hàng.</p>
      </section>
    </main>
    <footer class="store-footer">Woodcraft · Nội thất gỗ cho không gian sống của bạn</footer>
    <div class="store-toast" id="cart-toast" role="status" aria-live="polite" hidden></div>
    <dialog class="store-dialog store-confirm-dialog" id="cart-remove-dialog" aria-labelledby="cart-remove-title">
      <div class="store-dialog-content">
        <div class="store-eyebrow">Xác nhận xóa</div>
        <h2 id="cart-remove-title">Bạn có chắc muốn xóa sản phẩm này khỏi giỏ hàng?</h2>
        <p id="cart-remove-product"></p>
        <div class="store-confirm-actions">
          <button class="store-button secondary" id="cart-remove-cancel" type="button">Không, giữ lại</button>
          <button class="store-button danger" id="cart-remove-confirm" type="button">Có, xóa sản phẩm</button>
        </div>
      </div>
    </dialog>
  `;

  document.querySelector("#cart-checkout-button").addEventListener("click", () => {
    if (cart.length) window.location.assign("checkout.html");
  });
  document.querySelector("#cart-remove-cancel").addEventListener("click", () => {
    document.querySelector("#cart-remove-dialog").close();
    pendingRemovalId = null;
  });
  document.querySelector("#cart-remove-confirm").addEventListener("click", confirmRemove);
  document.querySelector("#cart-remove-dialog").addEventListener("click", event => {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
      pendingRemovalId = null;
    }
  });
  document.querySelector("#cart-remove-dialog").addEventListener("cancel", () => {
    pendingRemovalId = null;
  });
}

function updateCart() {
  const items = getCartDetails(cart, products);
  cart = items.map(({ product, quantity }) => ({ id: product.rawId, quantity }));
  saveCart(cart);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  document.querySelector("#cart-header-count").textContent = String(totalQuantity);
  document.querySelector("#cart-count").textContent = `${totalQuantity} sản phẩm`;
  document.querySelector("#cart-total").textContent = formatMoney(total);
  document.querySelector("#cart-checkout-button").disabled = !items.length;
  document.querySelector("#cart-contents").innerHTML = items.length ? `
    <div class="store-cart-table-wrap"><table class="store-cart-table">
      <thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Tạm tính</th><th></th></tr></thead>
      <tbody>${items.map(({ product, quantity }) => `<tr>
        <td><div class="store-cart-product">
          ${product.image ? `<img class="store-cart-thumb" src="${escapeHtml(product.image)}" alt="">` : `<span class="store-cart-thumb"></span>`}
          <div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.id)}</span></div>
        </div></td>
        <td><div class="store-quantity">
          <button type="button" data-cart-change="${product.rawId}" data-delta="-1" aria-label="Giảm số lượng">−</button>
          <span>${quantity}</span>
          <button type="button" data-cart-change="${product.rawId}" data-delta="1" aria-label="Tăng số lượng" ${quantity >= product.stock ? "disabled" : ""}>+</button>
        </div></td>
        <td>${formatMoney(product.price * quantity)}</td>
        <td><button class="store-remove" type="button" data-remove="${product.rawId}">Xóa</button></td>
      </tr>`).join("")}</tbody>
    </table></div>` : `<div class="store-cart-empty">Giỏ hàng đang trống. Hãy chọn món đồ phù hợp cho không gian của bạn.</div>`;

  document.querySelectorAll("[data-cart-change]").forEach(button =>
    button.addEventListener("click", () => changeQuantity(
      Number(button.dataset.cartChange), Number(button.dataset.delta)
    ))
  );
  document.querySelectorAll("[data-remove]").forEach(button =>
    button.addEventListener("click", () => askRemove(Number(button.dataset.remove)))
  );
}

function renderPendingCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelector("#cart-header-count").textContent = String(count);
  document.querySelector("#cart-count").textContent = `${count} sản phẩm`;
  document.querySelector("#cart-total").textContent = "—";
  document.querySelector("#cart-contents").innerHTML =
    `<div class="store-cart-empty">Đang tải thông tin sản phẩm trong giỏ hàng...</div>`;
  document.querySelector("#cart-checkout-button").disabled = true;
}

function changeQuantity(id, delta) {
  const product = products.find(entry => entry.rawId === id);
  if (!product || product.stock < 1) return;
  const current = cart.find(item => item.id === id)?.quantity || 0;
  const next = Math.max(0, Math.min(product.stock, current + delta));
  if (next === current) {
    showToast("Số lượng trong giỏ đã đạt mức tồn kho.");
    return;
  }
  cart = cart.filter(item => item.id !== id);
  if (next) cart.push({ id, quantity: next });
  updateCart();
}

function askRemove(id) {
  const product = products.find(entry => entry.rawId === id);
  if (!product || !cart.some(item => item.id === id)) return;
  pendingRemovalId = id;
  document.querySelector("#cart-remove-product").textContent = product.name;
  document.querySelector("#cart-remove-dialog").showModal();
}

function confirmRemove() {
  const id = pendingRemovalId;
  const product = products.find(entry => entry.rawId === id);
  if (!product) return;
  cart = cart.filter(item => item.id !== id);
  updateCart();
  document.querySelector("#cart-remove-dialog").close();
  pendingRemovalId = null;
  showToast(`Đã xóa "${product.name}" khỏi giỏ hàng.`);
}

async function loadCartProducts() {
  try {
    products = await getStoreProducts();
    updateCart();
  } catch (error) {
    console.error("Không thể tải dữ liệu giỏ hàng:", error);
    document.querySelector("#cart-contents").innerHTML = `
      <div class="store-empty">
        <p>Chưa thể tải thông tin sản phẩm. Chi tiết: ${escapeHtml(error.message)}</p>
        <button class="store-button" id="cart-retry" type="button">Thử tải lại</button>
      </div>`;
    document.querySelector("#cart-retry").addEventListener("click", event => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = "Đang tải...";
      loadCartProducts();
    });
  }
}

renderPage();
renderPendingCart();
loadCartProducts();
