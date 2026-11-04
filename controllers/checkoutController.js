import {
  getStoreProducts, readCart, saveCart
} from "../models/storefrontModel.js";
import { getCustomerSession } from "../models/customerAuthModel.js";
import {
  addCustomerAddress, getCustomerAccount, getCustomerOrderQuote, placeCustomerOrder
} from "../models/customerAccountModel.js";
import {
  formatVietnamAddress, initializeVietnamAddressFields, readVietnamAddressForm, renderVietnamAddressFields
} from "../models/vietnamAddressModel.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const formatMoney = value => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(value);

function selectedPromotionValue(promotion) {
  return promotion ? JSON.stringify(promotion) : "";
}

function renderOrderSummary(items, quote) {
  const promotions = quote.promotions || [];
  return `
    <h2>Tóm tắt đơn hàng</h2>
    <label class="store-field store-promotion-picker">
      <span>Chọn tối đa một khuyến mãi (không bắt buộc)</span>
      <select id="checkout-promotion">
        <option value="" ${quote.selectedPromotion ? "" : "selected"}>Không áp dụng khuyến mãi</option>
        ${promotions.map(promotion => {
          const value = selectedPromotionValue({ type: promotion.type, id: promotion.id });
          const typeLabel = promotion.type === "product"
            ? "Theo sản phẩm"
            : promotion.type === "invoice"
              ? "Theo hóa đơn"
              : "Voucher";
          const availability = promotion.available === undefined ? "" : ` · Còn ${promotion.available}`;
          return `<option value="${escapeHtml(value)}" ${value === selectedPromotionValue(quote.selectedPromotion) ? "selected" : ""}>
            ${escapeHtml(promotion.name)} · ${typeLabel} · Giảm ${escapeHtml(promotion.discountPercentLabel || "0%")} (${formatMoney(promotion.discount)})${availability}
          </option>`;
        }).join("")}
      </select>
    </label>
    <p class="store-promotion-note">Mỗi đơn chỉ áp dụng một khuyến mãi. Bạn tự chọn ưu đãi muốn sử dụng.</p>
    <div class="store-checkout-summary">
      ${items.map(({ product, quantity, quoteLine }) => `<div class="store-checkout-item">
        <span>${escapeHtml(product.name)} × ${quantity}${quoteLine.productDiscount
          ? `<small>Giảm ${Number(quoteLine.productDiscountPercent)}% (${formatMoney(quoteLine.productDiscount)}) · ${escapeHtml(quoteLine.productPromotionName)}</small>`
          : ""}</span>
        <strong>${formatMoney(quoteLine.subtotal)}</strong>
      </div>`).join("")}
    </div>
    <div class="store-checkout-total"><span>Tạm tính</span><strong>${formatMoney(quote.subtotal)}</strong></div>
    <div class="store-checkout-total">
      <span>Khuyến mãi${quote.selectedPromotionName ? `<small>${escapeHtml(quote.selectedPromotionName)}</small>` : ""}</span>
      <strong>${quote.totalDiscount ? `−${formatMoney(quote.totalDiscount)}` : formatMoney(0)}</strong>
    </div>
    <div class="store-checkout-total"><span>Tổng thanh toán</span><strong>${formatMoney(quote.total)}</strong></div>`;
}

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
  const defaultAddress = account.addresses.find(address => Number(address.macdinh) === 1);
  const initialAddress = defaultAddress || account.addresses[0];
  const addressOptions = account.addresses.map(address =>
    `<option value="${Number(address.id_diachi)}" ${address === initialAddress ? "selected" : ""}>
      ${Number(address.macdinh) === 1 ? "Mặc định · " : ""}${escapeHtml(address.displayAddress)}
    </option>`
  ).join("");
  document.querySelector("#checkout-content").innerHTML = `
    <div class="store-checkout-layout">
      <form class="store-checkout-form" id="checkout-form">
        <div class="store-checkout-customer">
          <strong>${escapeHtml(account.profile.hoten)}</strong>
          <span>${escapeHtml(account.profile.sdt || "Chưa có số điện thoại")}</span>
        </div>
        <label class="store-field"><span>Địa chỉ giao hàng</span>
          <select name="savedAddress">
            ${addressOptions}
            <option value="new" ${initialAddress ? "" : "selected"}>Thêm địa chỉ mới</option>
          </select>
        </label>
        <div id="checkout-new-address" ${initialAddress ? "hidden" : ""}>
          <p class="store-checkout-note">Địa chỉ mới sẽ được lưu vào hồ sơ và liên kết với hóa đơn.</p>
          ${renderVietnamAddressFields("checkout-address")}
          <p class="store-form-message" id="checkout-address-error" data-address-error role="alert" hidden></p>
        </div>
        <div class="store-payment-method"><span>Phương thức thanh toán</span><strong>Thanh toán tiền mặt khi nhận hàng (COD)</strong></div>
        <p class="store-checkout-note">Giá và tồn kho sẽ được kiểm tra lại trước khi tạo đơn hàng.</p>
        <button class="store-button" type="submit">Xác nhận đặt hàng COD</button>
        <p class="store-form-message" id="checkout-message" role="alert" hidden></p>
      </form>
      <aside class="store-checkout-order" id="checkout-order-summary" aria-label="Tóm tắt đơn hàng">
        ${renderOrderSummary(items, quote)}
      </aside>
    </div>`;

  const form = document.querySelector("#checkout-form");
  const savedAddress = form.elements.savedAddress;
  const newAddressFields = document.querySelector("#checkout-new-address");
  const summary = document.querySelector("#checkout-order-summary");
  const addressInputs = [...newAddressFields.querySelectorAll(
    '[name="tinhThanh"], [name="phuongXa"], [name="duong"], [name="macDinh"]'
  )];
  const setAddressInputsDisabled = disabled => {
    addressInputs.forEach(input => {
      input.disabled = disabled;
    });
  };
  let addressFieldsReady = false;
  let addressFieldsPromise = null;
  const initializeNewAddressFields = () => {
    if (addressFieldsReady) {
      setAddressInputsDisabled(false);
      form.elements.phuongXa.disabled = !form.elements.tinhThanh.value;
      form.querySelector('[type="submit"]').disabled = false;
      return;
    }
    if (addressFieldsPromise) return;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    addressFieldsPromise = initializeVietnamAddressFields(form)
      .then(() => {
        addressFieldsReady = true;
        const isNewAddress = savedAddress.value === "new";
        setAddressInputsDisabled(!isNewAddress);
        const ward = form.elements.phuongXa;
        ward.disabled = !isNewAddress || !form.elements.tinhThanh.value;
        submitButton.disabled = false;
      })
      .catch(error => {
        const message = form.querySelector("#checkout-address-error");
        message.textContent = error.message;
        message.hidden = false;
        submitButton.disabled = savedAddress.value === "new";
        addressFieldsPromise = null;
      });
  };
  if (savedAddress.value === "new") {
    initializeNewAddressFields();
  } else {
    setAddressInputsDisabled(true);
  }
  savedAddress.addEventListener("change", () => {
    const isNewAddress = savedAddress.value === "new";
    newAddressFields.hidden = !isNewAddress;
    if (isNewAddress) {
      initializeNewAddressFields();
    } else {
      setAddressInputsDisabled(true);
      form.querySelector('[type="submit"]').disabled = false;
    }
  });
  let activeQuote = quote;
  form.addEventListener("submit", event => submitCheckout(event, () => activeQuote));
  summary.addEventListener("change", async event => {
    if (event.target.id !== "checkout-promotion") return;
    const selector = event.target;
    const promotion = selector.value ? JSON.parse(selector.value) : null;
    const submitButton = form.querySelector('[type="submit"]');
    selector.disabled = true;
    submitButton.disabled = true;
    document.querySelector("#checkout-message").hidden = true;
    try {
      activeQuote = await getCustomerOrderQuote(readCart(), promotion);
      summary.innerHTML = renderOrderSummary(items, activeQuote);
    } catch (error) {
      document.querySelector("#checkout-message").textContent = error.message;
      document.querySelector("#checkout-message").hidden = false;
      selector.value = selectedPromotionValue(activeQuote.selectedPromotion);
    } finally {
      const currentSelector = document.querySelector("#checkout-promotion");
      if (currentSelector) currentSelector.disabled = false;
      submitButton.disabled = false;
    }
  });
}

async function submitCheckout(event, getQuote) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const promotionSelect = document.querySelector("#checkout-promotion");
  const message = document.querySelector("#checkout-message");
  const savedAddressId = form.elements.savedAddress.value;
  button.disabled = true;
  promotionSelect.disabled = true;
  message.hidden = true;
  try {
    let addressId;
    if (savedAddressId === "new") {
      const address = readVietnamAddressForm(form);
      const saved = await addCustomerAddress(address);
      addressId = Number(saved.id_diachi);
      if (!Number.isSafeInteger(addressId) || addressId < 1) {
        throw new Error("Địa chỉ đã gửi nhưng máy chủ không trả về mã địa chỉ.");
      }
    } else {
      addressId = Number(savedAddressId);
    }
    const order = await placeCustomerOrder(readCart(), addressId, getQuote());
    saveCart([]);
    window.location.assign(`order-success.html?id=${encodeURIComponent(order.id_hoadon)}`);
  } catch (error) {
    message.textContent = savedAddressId === "new"
      ? `Không thể hoàn tất đơn hàng. Nếu địa chỉ đã được lưu, bạn có thể chọn lại địa chỉ đó khi thử lại. ${error.message}`
      : error.message;
    message.hidden = false;
  } finally {
    button.disabled = false;
    promotionSelect.disabled = false;
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
    await Promise.all(account.addresses.map(async address => {
      address.displayAddress = await formatVietnamAddress(address);
    }));
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
window.addEventListener("woodcraft-cart-expired", () => {
  window.location.replace("cart.html?expired=1");
});
loadCheckout();
