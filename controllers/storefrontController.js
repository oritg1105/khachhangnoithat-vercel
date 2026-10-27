import {
  getCartDetails, getStoreProducts, readCart, saveCart
} from "../models/storefrontModel.js";
import {
  getCustomerSession, signOutCustomer
} from "../models/customerAuthModel.js";
import {
  addCustomerAddress, deleteCustomerAddress,
  getCustomerAccount, placeCustomerOrder, updateCustomerProfile
} from "../models/customerAccountModel.js";

let products = [];
let cart = readCart();
let searchText = "";
let selectedCategory = "";
let selectedWood = "";
let catalogLoaded = false;
let customerAccount = null;
let customerAccountError = "";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const formatMoney = value => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(value);

function showDialog(id) {
  const dialog = document.querySelector(id);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = document.querySelector(id);
  if (dialog.open) dialog.close();
}

function renderCustomerHeader() {
  const session = getCustomerSession();
  const control = document.querySelector("#store-account-control");
  control.innerHTML = session
    ? `<button class="store-cart-link" id="store-account-button" type="button">${escapeHtml(customerAccount?.profile?.hoten || session.user.username)}</button>`
    : `<div class="store-auth-actions">
        <a class="store-cart-link" href="customer-login.html">Đăng nhập</a>
        <a class="store-cart-link store-register-link" href="customer-register.html">Đăng ký</a>
      </div>`;
  document.querySelector("#store-account-button")?.addEventListener("click", openCustomerAccount);
}

async function openCustomerAccount() {
  try {
    customerAccount = await getCustomerAccount();
    customerAccountError = "";
  } catch (error) {
    customerAccount = null;
    customerAccountError = error.message;
    if (error.status !== 409) {
      renderCustomerAccountError(error.message);
      showDialog("#store-account-dialog");
      return;
    }
  }
  openCustomerAccountView();
}

function renderCustomerAccountError(message) {
  document.querySelector("#store-account-content").innerHTML = `
    <button class="store-dialog-close" type="button" data-close="store-account-dialog" aria-label="Đóng">×</button>
    <div class="store-eyebrow">Tài khoản khách hàng</div><h2>Không thể tải tài khoản</h2>
    <p>${escapeHtml(message)}</p>
    <button class="store-button" id="store-account-retry" type="button">Thử lại</button>
    <button class="store-text-button" id="store-account-signout" type="button">Đăng xuất</button>`;
  document.querySelector("[data-close='store-account-dialog']").onclick = () => closeDialog("#store-account-dialog");
  document.querySelector("#store-account-retry").onclick = openCustomerAccount;
  document.querySelector("#store-account-signout").onclick = signOut;
}

function openCustomerAccountView() {
  renderCustomerAccountDialog();
  showDialog("#store-account-dialog");
}

function renderCustomerAccountDialog(message = "") {
  const content = document.querySelector("#store-account-content");
  const session = getCustomerSession();
  if (!session) {
    content.innerHTML = `<button class="store-dialog-close" type="button" data-close="store-account-dialog" aria-label="Đóng">×</button>
      <h2>Đăng nhập để xem tài khoản</h2><a class="store-button" href="customer-login.html">Đăng nhập</a>`;
    content.querySelector("[data-close]").onclick = () => closeDialog("#store-account-dialog");
    return;
  }

  if (!customerAccount) {
    content.innerHTML = `<button class="store-dialog-close" type="button" data-close="store-account-dialog" aria-label="Đóng">×</button>
      <div class="store-eyebrow">Tài khoản khách hàng</div><h2>Không thể tải hồ sơ</h2>
      <p>${escapeHtml(customerAccountError || "Không tìm thấy hồ sơ khách hàng liên kết với tài khoản này.")}</p>
      <button class="store-button" id="store-account-retry" type="button">Thử lại</button>
      <button class="store-text-button" id="store-account-signout" type="button">Đăng xuất</button>`;
    content.querySelector("[data-close]").onclick = () => closeDialog("#store-account-dialog");
    content.querySelector("#store-account-retry").onclick = openCustomerAccount;
    content.querySelector("#store-account-signout").onclick = signOut;
    return;
  }

  const profile = customerAccount.profile;
  content.innerHTML = `<button class="store-dialog-close" type="button" data-close="store-account-dialog" aria-label="Đóng">×</button>
    <div class="store-eyebrow">Tài khoản khách hàng</div><h2>Xin chào, ${escapeHtml(profile.hoten || "")}</h2>
    <div class="store-account-meta">Tên đăng nhập: ${escapeHtml(session.user.username)}${profile.email ? ` · ${escapeHtml(profile.email)}` : ""}</div>
    <div class="store-account-tabs">
      <button type="button" data-account-tab="profile">Thông tin</button>
      <button type="button" data-account-tab="orders">Đơn hàng (${customerAccount.orders.length})</button>
      <button type="button" data-account-tab="addresses">Địa chỉ (${customerAccount.addresses.length})</button>
    </div>
    <div id="store-account-panel"></div>
    <button class="store-text-button" id="store-account-signout" type="button">Đăng xuất</button>`;
  content.querySelector("[data-close]").onclick = () => closeDialog("#store-account-dialog");
  content.querySelector("#store-account-signout").onclick = signOut;
  content.querySelectorAll("[data-account-tab]").forEach(button =>
    button.addEventListener("click", () => renderAccountTab(button.dataset.accountTab))
  );
  renderAccountTab("profile");
}

function renderAccountTab(tab) {
  const panel = document.querySelector("#store-account-panel");
  if (!panel) return;
  if (tab === "profile") {
    panel.innerHTML = `<form id="store-profile-form">
      <label class="store-field"><span>Họ và tên</span><input name="fullName" maxlength="120" value="${escapeHtml(customerAccount.profile.hoten || "")}" required></label>
      <label class="store-field"><span>Số điện thoại</span><input name="phone" maxlength="30" value="${escapeHtml(customerAccount.profile.sdt || "")}"></label>
      <label class="store-field"><span>Email đăng nhập</span><input value="${escapeHtml(customerAccount.profile.email || "")}" disabled></label>
      <button class="store-button" type="submit">Lưu thông tin</button><p class="store-form-message" id="store-profile-message" role="status" hidden></p>
    </form>`;
    panel.querySelector("#store-profile-form").onsubmit = submitProfileUpdate;
    return;
  }
  if (tab === "addresses") {
    panel.innerHTML = `<form id="store-address-form">
      <label class="store-field"><span>Thêm địa chỉ giao hàng</span><input name="address" maxlength="500" minlength="5" required></label>
      <button class="store-button" type="submit">Lưu địa chỉ</button><p class="store-form-message" id="store-address-message" role="status" hidden></p>
    </form>
    <div class="store-address-list">${customerAccount.addresses.length ? customerAccount.addresses.map((address, index) =>
      `<div class="store-address-row"><span>${escapeHtml(address)}</span><button class="store-remove" type="button" data-delete-address="${index}">Xóa</button></div>`
    ).join("") : `<p>Chưa lưu địa chỉ giao hàng.</p>`}</div>`;
    panel.querySelector("#store-address-form").onsubmit = submitAddress;
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
      <ul>${order.items.map(item => `<li>${escapeHtml(item.name)} × ${item.quantity} <span>${formatMoney(item.total)}</span></li>`).join("")}</ul>
      <div class="store-order-total">Tổng cộng: <strong>${formatMoney(order.total)}</strong></div>
    </article>`).join("") : `<p>Bạn chưa có đơn hàng nào.</p>`;
}

async function submitProfileUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#store-profile-message");
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    await updateCustomerProfile(values.fullName, values.phone);
    customerAccount = await getCustomerAccount();
    renderCustomerHeader();
    renderAccountTab("profile");
    const status = document.querySelector("#store-profile-message");
    status.textContent = "Đã cập nhật thông tin.";
    status.classList.add("success");
    status.hidden = false;
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  }
}

async function submitAddress(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#store-address-message");
  const address = new FormData(form).get("address");
  try {
    await addCustomerAddress(address);
    customerAccount = await getCustomerAccount();
    renderAccountTab("addresses");
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  }
}

async function deleteAddress(index) {
  const address = customerAccount.addresses[index];
  if (!address || !window.confirm("Xóa địa chỉ giao hàng này?")) return;
  try {
    await deleteCustomerAddress(address);
    customerAccount = await getCustomerAccount();
    renderAccountTab("addresses");
  } catch (error) {
    window.alert(error.message);
  }
}

function signOut() {
  signOutCustomer();
  customerAccount = null;
  customerAccountError = "";
  renderCustomerHeader();
  closeDialog("#store-account-dialog");
}

async function openCheckout() {
  if (!getCustomerSession()) {
    window.location.assign("customer-login.html");
    return;
  }
  if (!customerAccount) {
    try {
      customerAccount = await getCustomerAccount();
      customerAccountError = "";
    } catch (error) {
      if (error.status !== 409) {
        window.alert(error.message);
        return;
      }
      customerAccountError = error.message;
      renderCustomerAccountDialog();
      showDialog("#store-account-dialog");
      return;
    }
  }
  const addressOptions = customerAccount.addresses.map(address =>
    `<option value="${escapeHtml(address)}">${escapeHtml(address)}</option>`
  ).join("");
  document.querySelector("#store-checkout-content").innerHTML = `
    <button class="store-dialog-close" type="button" data-close="store-checkout-dialog" aria-label="Đóng">×</button>
    <div class="store-eyebrow">Thanh toán khi nhận hàng</div><h2>Thông tin giao hàng</h2>
    <p>Khách hàng: ${escapeHtml(customerAccount.profile.hoten)} · ${escapeHtml(customerAccount.profile.sdt || "")}</p>
    <form id="store-checkout-form">
      ${addressOptions ? `<label class="store-field"><span>Địa chỉ đã lưu</span><select name="savedAddress"><option value="">Nhập địa chỉ mới</option>${addressOptions}</select></label>` : ""}
      <label class="store-field"><span>Địa chỉ giao hàng</span><textarea name="address" minlength="5" maxlength="500" required></textarea></label>
      <label class="store-check-row"><input name="saveAddress" type="checkbox"> Lưu địa chỉ vào sổ địa chỉ</label>
      <div class="store-checkout-total"><span>Tổng thanh toán (COD)</span><strong>${formatMoney(getCartDetails(cart, products).reduce((sum, item) => sum + item.product.price * item.quantity, 0))}</strong></div>
      <button class="store-button" type="submit">Xác nhận đặt hàng</button><p class="store-form-message" id="store-checkout-message" role="alert" hidden></p>
    </form>`;
  document.querySelector("[data-close='store-checkout-dialog']").onclick = () => closeDialog("#store-checkout-dialog");
  const form = document.querySelector("#store-checkout-form");
  const addressInput = form.elements.address;
  form.elements.savedAddress?.addEventListener("change", event => {
    addressInput.value = event.target.value;
    addressInput.required = !event.target.value;
  });
  form.onsubmit = submitCheckout;
  showDialog("#store-checkout-dialog");
}

async function submitCheckout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const message = document.querySelector("#store-checkout-message");
  const address = String(new FormData(form).get("address") || "").trim();
  button.disabled = true;
  message.hidden = true;
  try {
    const order = await placeCustomerOrder(cart, address);
    cart = [];
    saveCart(cart);
    closeDialog("#store-checkout-dialog");
    window.alert(`Đặt hàng thành công! Mã hóa đơn HD${order.id_hoadon}.`);
    if (form.elements.saveAddress.checked && !customerAccount.addresses.includes(address)) {
      try {
        await addCustomerAddress(address);
      } catch (error) {
        console.warn("Đơn đã tạo nhưng không lưu được địa chỉ:", error.message);
      }
    }
    try {
      products = await getStoreProducts();
      renderProductCards();
      renderCart();
    } catch (error) {
      console.warn("Đơn đã tạo nhưng không tải lại được danh mục:", error.message);
    }
    try {
      customerAccount = await getCustomerAccount();
      renderCustomerHeader();
      renderCustomerAccountDialog();
      showDialog("#store-account-dialog");
      renderAccountTab("orders");
    } catch (error) {
      console.warn("Đơn đã tạo nhưng không tải lại được lịch sử đơn:", error.message);
    }
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
}

function distinctValues(key) {
  return [...new Set(products.map(product => product[key]).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "vi"));
}

function filteredProducts() {
  const needle = searchText.toLocaleLowerCase("vi");
  return products.filter(product => {
    const searchable = [product.name, product.id, product.category, product.wood, product.style, product.description]
      .join(" ").toLocaleLowerCase("vi");
    return (!needle || searchable.includes(needle)) &&
      (!selectedCategory || product.category === selectedCategory) &&
      (!selectedWood || product.wood === selectedWood);
  });
}

function renderProductCards() {
  const shown = filteredProducts();
  const categories = distinctValues("category");
  const woods = distinctValues("wood");
  const categoryFilter = document.querySelector("#store-category");
  const woodFilter = document.querySelector("#store-wood");
  categoryFilter.innerHTML = `<option value="">Tất cả danh mục</option>${categories.map(value =>
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ).join("")}`;
  woodFilter.innerHTML = `<option value="">Tất cả chất liệu</option>${woods.map(value =>
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ).join("")}`;
  categoryFilter.value = selectedCategory;
  woodFilter.value = selectedWood;
  document.querySelector("#store-result-count").textContent = `${shown.length} sản phẩm`;

  document.querySelector("#store-products").innerHTML = shown.length ? shown.map(product => `
    <article class="store-card">
      <div class="store-card-image-wrap">
        ${product.image
          ? `<img class="store-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">`
          : `<div class="store-image-placeholder">WOODCRAFT</div>`}
        <span class="store-stock-badge ${product.stock < 1 ? "out" : ""}">${product.stock > 0 ? `Còn ${product.stock} sản phẩm` : "Tạm hết hàng"}</span>
      </div>
      <div class="store-card-body">
        <div class="store-card-category">${escapeHtml(product.category || "Nội thất gỗ")}${product.wood ? ` · ${escapeHtml(product.wood)}` : ""}</div>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="store-card-detail">${escapeHtml(product.style || "Thiết kế Woodcraft")}</p>
        <div class="store-card-bottom">
          <span class="store-price">${formatMoney(product.price)}</span>
          <div class="store-card-actions">
            <button class="store-button secondary" type="button" data-details="${product.rawId}">Chi tiết</button>
            <button class="store-button" type="button" data-add="${product.rawId}" ${product.stock < 1 ? "disabled" : ""}>Thêm giỏ</button>
          </div>
        </div>
      </div>
    </article>`).join("") : `<p class="store-empty">Không tìm thấy sản phẩm phù hợp với lựa chọn của bạn.</p>`;

  document.querySelectorAll("[data-add]").forEach(button =>
    button.addEventListener("click", () => changeQuantity(Number(button.dataset.add), 1))
  );
  document.querySelectorAll("[data-details]").forEach(button =>
    button.addEventListener("click", () => showProductDetails(Number(button.dataset.details)))
  );
  document.querySelectorAll(".store-image").forEach(image => image.addEventListener("error", () => {
    const placeholder = document.createElement("div");
    placeholder.className = "store-image-placeholder";
    placeholder.textContent = "WOODCRAFT";
    image.replaceWith(placeholder);
  }, { once: true }));
}

function showProductDetails(id) {
  const product = products.find(entry => entry.rawId === id);
  if (!product) return;
  document.querySelector("#store-detail-content").innerHTML = `
    <button class="store-dialog-close" type="button" aria-label="Đóng">×</button>
    <div class="store-eyebrow">${escapeHtml(product.category || "Nội thất gỗ")}</div>
    <h2>${escapeHtml(product.name)}</h2>
    ${product.image ? `<img class="store-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">` : ""}
    <p>${escapeHtml(product.description || "Sản phẩm nội thất gỗ Woodcraft.")}</p>
    <p>${product.style ? `Kiểu dáng: ${escapeHtml(product.style)}<br>` : ""}${product.wood ? `Chất liệu: ${escapeHtml(product.wood)}<br>` : ""}Tồn kho: ${product.stock}</p>
    <p class="store-dialog-price">${formatMoney(product.price)}</p>
    <button class="store-button" type="button" data-detail-add="${product.rawId}" ${product.stock < 1 ? "disabled" : ""}>Thêm vào giỏ hàng</button>`;
  const dialog = document.querySelector("#store-detail-dialog");
  dialog.querySelector(".store-image")?.addEventListener("error", event => {
    const placeholder = document.createElement("div");
    placeholder.className = "store-image-placeholder";
    placeholder.textContent = "WOODCRAFT";
    event.currentTarget.replaceWith(placeholder);
  }, { once: true });
  dialog.querySelector(".store-dialog-close").onclick = () => dialog.close();
  dialog.querySelector("[data-detail-add]")?.addEventListener("click", () => {
    changeQuantity(id, 1);
    dialog.close();
  });
  dialog.showModal();
}

function normalizedCart() {
  return getCartDetails(cart, products).map(({ product, quantity }) => ({
    id: product.rawId, quantity
  }));
}

function changeQuantity(id, delta) {
  const product = products.find(entry => entry.rawId === id);
  if (!product || product.stock < 1) return;
  const current = cart.find(item => item.id === id)?.quantity || 0;
  const next = Math.max(0, Math.min(product.stock, current + delta));
  cart = cart.filter(item => item.id !== id);
  if (next) cart.push({ id, quantity: next });
  saveCart(cart);
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart(cart);
  renderCart();
}

function renderCart() {
  if (!catalogLoaded) {
    const pendingCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelector("#store-header-count").textContent = String(pendingCount);
    document.querySelector("#store-cart-count").textContent = `${pendingCount} sản phẩm`;
    document.querySelector("#store-cart-total").textContent = "—";
    document.querySelector("#store-cart-contents").innerHTML = `<div class="store-cart-empty">Giỏ hàng sẽ hiển thị sau khi tải được danh mục sản phẩm.</div>`;
    document.querySelector("#store-checkout-button").disabled = true;
    return;
  }
  const items = getCartDetails(cart, products);
  cart = normalizedCart();
  saveCart(cart);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  document.querySelector("#store-header-count").textContent = String(totalQuantity);
  document.querySelector("#store-cart-count").textContent = `${totalQuantity} sản phẩm`;
  document.querySelector("#store-cart-total").textContent = formatMoney(total);
  document.querySelector("#store-checkout-button").disabled = !items.length;
  document.querySelector("#store-cart-contents").innerHTML = items.length ? `
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
    button.addEventListener("click", () => changeQuantity(Number(button.dataset.cartChange), Number(button.dataset.delta)))
  );
  document.querySelectorAll("[data-remove]").forEach(button =>
    button.addEventListener("click", () => removeFromCart(Number(button.dataset.remove)))
  );
}

function renderPage() {
  document.querySelector("#store-app").innerHTML = `
    <header class="store-header">
      <a class="store-brand" href="store.html">WOODCRAFT<span>NỘI THẤT GỖ · CỬA HÀNG</span></a>
      <nav class="store-nav" aria-label="Điều hướng chính">
        <a href="#store-catalog">Sản phẩm</a>
        <a href="#store-footer">Về Woodcraft</a>
        <a class="store-cart-link" href="#store-cart">Giỏ hàng (<span id="store-header-count">0</span>)</a>
        <span id="store-account-control"></span>
      </nav>
    </header>
    <main class="store-main">
      <section class="store-hero">
        <div class="store-hero-content">
          <div class="store-eyebrow">Woodcraft · Sống cùng chất gỗ</div>
          <h1>Chạm vào vẻ đẹp tự nhiên</h1>
          <p>Khám phá nội thất gỗ được chọn lọc cho không gian sống ấm áp, tiện nghi và bền đẹp theo thời gian.</p>
          <a class="store-hero-button" href="#store-catalog">Khám phá sản phẩm</a>
        </div>
      </section>
      <section class="store-benefits" aria-label="Cam kết Woodcraft">
        <div class="store-benefit"><strong>Chất liệu chọn lọc</strong><span>Thông tin gỗ và sản phẩm rõ ràng</span></div>
        <div class="store-benefit"><strong>Thiết kế tinh tế</strong><span>Đa dạng kiểu dáng cho tổ ấm</span></div>
        <div class="store-benefit"><strong>Đồng hành tận tâm</strong><span>Hỗ trợ khách hàng trong từng lựa chọn</span></div>
      </section>
      <section id="store-catalog" aria-labelledby="store-catalog-title">
        <div class="store-catalog-heading">
          <div><div class="store-eyebrow">Bộ sưu tập</div><h2 id="store-catalog-title">Sản phẩm nội thất</h2></div>
          <span class="store-result-count" id="store-result-count">Đang tải...</span>
        </div>
        <div class="store-toolbar">
          <div class="store-eyebrow">Tìm món đồ phù hợp với bạn</div>
          <div class="store-filters">
            <input id="store-search" type="search" placeholder="Tìm tên sản phẩm..." aria-label="Tìm sản phẩm">
            <select id="store-category" aria-label="Lọc theo loại sản phẩm"><option value="">Tất cả danh mục</option></select>
            <select id="store-wood" aria-label="Lọc theo chất liệu"><option value="">Tất cả chất liệu</option></select>
          </div>
        </div>
        <div class="store-products" id="store-products" aria-live="polite"><p class="store-empty">Đang tải sản phẩm...</p></div>
      </section>
      <section class="store-cart-section" id="store-cart" aria-labelledby="store-cart-title">
        <div class="store-section-heading">
          <div><div class="store-eyebrow">Lựa chọn của bạn</div><h2 id="store-cart-title">Giỏ hàng</h2></div>
          <span class="store-cart-count" id="store-cart-count">0 sản phẩm</span>
        </div>
        <div id="store-cart-contents" aria-live="polite"></div>
        <div class="store-cart-summary"><span>Tạm tính</span><strong id="store-cart-total">0 ₫</strong></div>
        <button class="store-button" id="store-checkout-button" type="button" disabled>Tiến hành đặt hàng COD</button>
        <p class="store-checkout-note">Giá và tồn kho được kiểm tra lại khi đặt hàng. Thanh toán bằng tiền mặt khi nhận hàng.</p>
      </section>
    </main>
    <footer class="store-footer" id="store-footer">Woodcraft · Nội thất gỗ cho không gian sống của bạn</footer>
    <dialog class="store-dialog" id="store-detail-dialog"><div class="store-dialog-content" id="store-detail-content"></div></dialog>
    <dialog class="store-dialog store-account-dialog" id="store-account-dialog"><div class="store-dialog-content" id="store-account-content"></div></dialog>
    <dialog class="store-dialog" id="store-checkout-dialog"><div class="store-dialog-content" id="store-checkout-content"></div></dialog>`;

  document.querySelector("#store-search").addEventListener("input", event => {
    searchText = event.target.value.trim();
    renderProductCards();
  });
  document.querySelector("#store-category").addEventListener("change", event => {
    selectedCategory = event.target.value;
    renderProductCards();
  });
  document.querySelector("#store-wood").addEventListener("change", event => {
    selectedWood = event.target.value;
    renderProductCards();
  });
  document.querySelector("#store-detail-dialog").addEventListener("click", event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelector("#store-checkout-button").addEventListener("click", openCheckout);
  renderCustomerHeader();
}

async function startStorefront() {
  renderPage();
  renderCart();
  try {
    products = await getStoreProducts();
    catalogLoaded = true;
    renderProductCards();
    renderCart();
    const storedSession = getCustomerSession();
    if (storedSession) {
      getCustomerAccount().then(account => {
        customerAccount = account;
        renderCustomerHeader();
        if (new URLSearchParams(window.location.search).get("account") === "setup") {
          renderCustomerAccountDialog();
          showDialog("#store-account-dialog");
          window.history.replaceState(null, "", window.location.pathname);
        }
      }).catch(error => {
        customerAccount = null;
        customerAccountError = error.message;
        if (error.status === 401) signOutCustomer();
        renderCustomerHeader();
        if (error.status === 409 && new URLSearchParams(window.location.search).get("account") === "setup") {
          renderCustomerAccountDialog();
          showDialog("#store-account-dialog");
          window.history.replaceState(null, "", window.location.pathname);
        }
      });
    }
  } catch (error) {
    console.error("Không thể tải dữ liệu sản phẩm cửa hàng:", error);
    document.querySelector("#store-result-count").textContent = "Không tải được dữ liệu";
    document.querySelector("#store-products").innerHTML = `<p class="store-empty">Chưa thể tải danh mục. Hãy kiểm tra API dữ liệu và quyền đọc (RLS) trên Supabase. Chi tiết: ${escapeHtml(error.message)}</p>`;
  }
}

startStorefront();
