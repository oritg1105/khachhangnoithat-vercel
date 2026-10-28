import {
  getStoreProducts, readCart, saveCart
} from "../models/storefrontModel.js";
import { getCustomerSession } from "../models/customerAuthModel.js";
import {
  addCustomerAddress, getCustomerAccount, getCustomerOrderQuote, placeCustomerOrder
} from "../models/customerAccountModel.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const formatMoney = value => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(value);

function renderShell() {
  const session = getCustomerSession();
  document.querySelector("#checkout-app").innerHTML = `
    <header class="store-header">
      <a class="store-brand" href="/">WOODCRAFT<span>NỘI THẤT GỖ · CỬA HÀNG</span></a>
      <nav class="store-nav" aria-label="Điều hướng chính">
        <a href="/">Sản phẩm</a>
        <a class="store-cart-link" href="cart.html">Giỏ hàng</a>
        ${session
          ? `<a class="store-cart-link" href="account.html">${escapeHtml(session.user.username)}</a>`
          : `<a class="store-cart-link" href="customer-login.html">Đăng nhập</a>`}
      </nav>
    </header>
    <main class="store-page-main">
      <a class="store-page-back" href="cart.html">← Quay lại giỏ hàng</a>
      <section class="store-checkout-page" aria-labelledby="checkout-title">
        <div class="store-section-heading">
          <div><div class="store-eyebrow">Thanh toán khi nhận hàng</div><h1 id="checkout-title">Xác nhận đơn hàng</h1></div>
        </div>
        <div id="checkout-content" aria-live="polite"><div class="store-cart-empty">Đang tải thông tin thanh toán...</div></div>
      </section>
    </main>
    <footer class="store-footer">Woodcraft · Nội thất gỗ cho không gian sống của bạn</footer>`;
}

function renderCheckout(account, items, quote) {
  const addressOptions = account.addresses.map(address =>
    `<option value="${escapeHtml(address)}">${escapeHtml(address)}</option>`
  ).join("");
  document.querySelector("#checkout-content").innerHTML = `
    <div class="store-checkout-layout">
      <form class="store-checkout-form" id="checkout-form">
        <div class="store-checkout-customer">
          <strong>${escapeHtml(account.profile.hoten)}</strong>
          <span>${escapeHtml(account.profile.sdt || "Chưa có số điện thoại")}</span>
        </div>
        ${addressOptions ? `<label class="store-field"><span>Chọn địa chỉ đã lưu</span><select name="savedAddress"><option value="">Nhập địa chỉ mới</option>${addressOptions}</select></label>` : ""}
        <label class="store-field"><span>Địa chỉ giao hàng</span><textarea name="address" minlength="5" maxlength="500" required></textarea></label>
        <label class="store-check-row"><input name="saveAddress" type="checkbox"> Lưu địa chỉ mới vào hồ sơ</label>
        <div class="store-payment-method"><span>Phương thức thanh toán</span><strong>Thanh toán tiền mặt khi nhận hàng (COD)</strong></div>
        <p class="store-checkout-note">Giá và tồn kho sẽ được kiểm tra lại trước khi tạo đơn hàng.</p>
        <button class="store-button" type="submit">Xác nhận đặt hàng COD</button>
        <p class="store-form-message" id="checkout-message" role="alert" hidden></p>
      </form>
      <aside class="store-checkout-order" aria-label="Tóm tắt đơn hàng">
        <h2>Tóm tắt đơn hàng</h2>
        <div class="store-checkout-summary">
          ${items.map(({ product, quantity, quoteLine }) => `<div class="store-checkout-item">
            <span>${escapeHtml(product.name)} × ${quantity}${quoteLine.productDiscount
              ? `<small>Giảm ${formatMoney(quoteLine.productDiscount)} · ${escapeHtml(quoteLine.productPromotionName)}</small>`
              : ""}</span>
            <strong>${formatMoney(quoteLine.subtotal)}</strong>
          </div>`).join("")}
        </div>
        <div class="store-checkout-total"><span>Tạm tính</span><strong>${formatMoney(quote.subtotal)}</strong></div>
        <div class="store-checkout-total">
          <span>Giảm giá sản phẩm</span>
          <strong>${quote.productDiscount ? `−${formatMoney(quote.productDiscount)}` : formatMoney(0)}</strong>
        </div>
        <div class="store-checkout-total">
          <span>Khuyến mãi hóa đơn${quote.invoicePromotionName
            ? `<small>${escapeHtml(quote.invoicePromotionName)}</small>`
            : ""}</span>
          <strong>${quote.invoiceDiscount ? `−${formatMoney(quote.invoiceDiscount)}` : formatMoney(0)}</strong>
        </div>
        <div class="store-checkout-total"><span>Tổng thanh toán</span><strong>${formatMoney(quote.total)}</strong></div>
      </aside>
    </div>`;

  const form = document.querySelector("#checkout-form");
  const addressInput = form.elements.address;
  const savedAddress = form.elements.savedAddress;
  const saveAddress = form.elements.saveAddress;
  savedAddress?.addEventListener("change", event => {
    addressInput.value = event.target.value;
    addressInput.required = !event.target.value;
    saveAddress.checked = false;
    saveAddress.disabled = Boolean(event.target.value);
  });
  addressInput.addEventListener("input", () => {
    if (savedAddress?.value && addressInput.value !== savedAddress.value) {
      savedAddress.value = "";
      addressInput.required = true;
      saveAddress.disabled = false;
    }
  });
  form.addEventListener("submit", event => submitCheckout(event, account, quote));
}

async function submitCheckout(event, account, quote) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const message = document.querySelector("#checkout-message");
  const address = String(new FormData(form).get("address") || "").trim();
  button.disabled = true;
  message.hidden = true;
  try {
    const order = await placeCustomerOrder(readCart(), address, quote);
    saveCart([]);
    if (form.elements.saveAddress.checked && !form.elements.saveAddress.disabled &&
        !account.addresses.includes(address)) {
      try {
        await addCustomerAddress(address);
      } catch (error) {
        console.warn("Đơn đã tạo nhưng không lưu được địa chỉ:", error.message);
      }
    }
    window.location.assign(`order-success.html?id=${encodeURIComponent(order.id_hoadon)}`);
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function loadCheckout() {
  if (!getCustomerSession()) {
    window.location.replace("customer-login.html?next=checkout.html");
    return;
  }
  try {
    const cart = readCart();
    if (!cart.length) {
      window.location.assign("cart.html");
      return;
    }
    const [account, products, quote] = await Promise.all([
      getCustomerAccount(),
      getStoreProducts(),
      getCustomerOrderQuote(cart)
    ]);
    const productsById = new Map(products.map(product => [product.rawId, product]));
    const items = quote.lines.map(quoteLine => ({
      product: productsById.get(Number(quoteLine.id_sanpham)),
      quantity: Number(quoteLine.soluong),
      quoteLine
    }));
    if (!items.length || items.some(item => !item.product)) {
      throw new Error("Không còn sản phẩm hợp lệ trong giỏ hàng. Vui lòng kiểm tra lại.");
    }
    renderCheckout(account, items, quote);
  } catch (error) {
    document.querySelector("#checkout-content").innerHTML = `
      <div class="store-empty">
        <p>Không thể tải trang thanh toán. ${escapeHtml(error.message)}</p>
        ${error.code?.startsWith("CUSTOMER_SESSION_") || error.code === "CUSTOMER_ACCOUNT_NOT_LINKED"
          ? `<p>Mã chẩn đoán: ${escapeHtml(error.code)}</p><a class="store-button" href="customer-login.html?next=checkout.html">Đăng nhập lại</a>`
          : ""}
        <a class="store-button" href="cart.html">Quay lại giỏ hàng</a>
      </div>`;
  }
}

renderShell();
loadCheckout();
