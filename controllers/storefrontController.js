import {
  getStoreProducts, readCart, saveCart
} from "../models/storefrontModel.js";
import { getCustomerSession } from "../models/customerAuthModel.js";
import { initializeStoreNavigation, renderStoreNavigation } from "../models/customerMenuModel.js";

let products = [];
let cart = readCart();
let searchText = "";
let selectedCategory = "";
let selectedWood = "";
let selectedStyle = "";
let minPrice = "";
let maxPrice = "";
let sortOrder = "";
let toastTimer;

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const formatMoney = value => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(value);

function showToast(message) {
  const toast = document.querySelector("#store-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function distinctValues(key) {
  return [...new Set(products.map(product => product[key]).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "vi"));
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function hasInvalidPriceRange() {
  const minimum = minPrice === "" ? null : Number(minPrice);
  const maximum = maxPrice === "" ? null : Number(maxPrice);
  return minimum !== null && maximum !== null && minimum > maximum;
}

function filteredProducts() {
  const terms = normalizeSearchText(searchText).split(/\s+/).filter(Boolean);
  const minimum = minPrice === "" ? null : Number(minPrice);
  const maximum = maxPrice === "" ? null : Number(maxPrice);
  const invalidPriceRange = hasInvalidPriceRange();
  const shown = products.filter(product => {
    const searchable = [product.name, product.id, product.category, product.wood, product.style, product.description]
      .join(" ");
    const normalizedSearchable = normalizeSearchText(searchable);
    return !invalidPriceRange && terms.every(term => normalizedSearchable.includes(term)) &&
      (!selectedCategory || product.category === selectedCategory) &&
      (!selectedWood || product.wood === selectedWood) &&
      (!selectedStyle || product.style === selectedStyle) &&
      (minimum === null || product.price >= minimum) &&
      (maximum === null || product.price <= maximum);
  });
  const compareName = (left, right) => left.name.localeCompare(right.name, "vi");
  if (sortOrder === "price-asc") shown.sort((left, right) => left.price - right.price || compareName(left, right));
  if (sortOrder === "price-desc") shown.sort((left, right) => right.price - left.price || compareName(left, right));
  if (sortOrder === "name-asc") shown.sort(compareName);
  if (sortOrder === "stock-desc") shown.sort((left, right) => right.stock - left.stock || compareName(left, right));
  return shown;
}

function renderProductCards() {
  const shown = filteredProducts();
  const categories = distinctValues("category");
  const woods = distinctValues("wood");
  const styles = distinctValues("style");
  const categoryFilter = document.querySelector("#store-category");
  const woodFilter = document.querySelector("#store-wood");
  const styleFilter = document.querySelector("#store-style");
  categoryFilter.innerHTML = `<option value="">Tất cả danh mục</option>${categories.map(value =>
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ).join("")}`;
  woodFilter.innerHTML = `<option value="">Tất cả chất liệu</option>${woods.map(value =>
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ).join("")}`;
  styleFilter.innerHTML = `<option value="">Tất cả kiểu dáng</option>${styles.map(value =>
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ).join("")}`;
  categoryFilter.value = selectedCategory;
  woodFilter.value = selectedWood;
  styleFilter.value = selectedStyle;
  document.querySelector("#store-sort").value = sortOrder;
  document.querySelector("#store-result-count").textContent = hasInvalidPriceRange()
    ? "Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa"
    : `${shown.length} sản phẩm`;

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
    button.addEventListener("click", () => {
      const id = Number(button.dataset.add);
      const product = products.find(entry => entry.rawId === id);
      if (changeQuantity(id, 1) && product) showToast(`Đã thêm "${product.name}" vào giỏ hàng.`);
    })
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
    if (changeQuantity(id, 1)) showToast(`Đã thêm "${product.name}" vào giỏ hàng.`);
    dialog.close();
  });
  dialog.showModal();
}

function changeQuantity(id, delta) {
  const product = products.find(entry => entry.rawId === id);
  if (!product || product.stock < 1) return false;
  const current = cart.find(item => item.id === id)?.quantity || 0;
  const next = Math.max(0, Math.min(product.stock, current + delta));
  if (delta > 0 && next === current) {
    showToast("Số lượng trong giỏ đã đạt mức tồn kho.");
    return false;
  }
  cart = cart.filter(item => item.id !== id);
  if (next) cart.push({ id, quantity: next });
  saveCart(cart);
  renderCart();
  return next > current;
}

function renderCart() {
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const count = document.querySelector("#store-header-count");
  if (count) count.textContent = String(totalQuantity);
}

function renderPage() {
  document.querySelector("#store-app").innerHTML = `
    <header class="store-header">
      <a class="store-brand" href="/">WOODCRAFT<span>NỘI THẤT GỖ · CỬA HÀNG</span></a>
      ${renderStoreNavigation(getCustomerSession(), `
        <a href="#store-catalog">Sản phẩm</a>
        <a class="store-cart-link" href="cart.html">Giỏ hàng (<span id="store-header-count">0</span>)</a>
      `, `
        <a href="#store-footer">Về Woodcraft</a>
      `, "store-navigation-menu")}
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
          <div class="store-eyebrow">Tìm kiếm sản phẩm</div>
          <div class="store-search-fields">
            <label class="store-field store-search-keyword"><span>Từ khóa</span>
              <input id="store-search" type="search" placeholder="Tên, mã, mô tả, chất liệu...">
            </label>
            <label class="store-field"><span>Danh mục</span><select id="store-category"><option value="">Tất cả danh mục</option></select></label>
            <label class="store-field"><span>Chất liệu</span><select id="store-wood"><option value="">Tất cả chất liệu</option></select></label>
            <label class="store-field"><span>Kiểu dáng</span><select id="store-style"><option value="">Tất cả kiểu dáng</option></select></label>
            <label class="store-field"><span>Giá từ (₫)</span><input id="store-min-price" type="number" min="0" step="1000" inputmode="numeric" placeholder="Không giới hạn"></label>
            <label class="store-field"><span>Giá đến (₫)</span><input id="store-max-price" type="number" min="0" step="1000" inputmode="numeric" placeholder="Không giới hạn"></label>
            <label class="store-field"><span>Sắp xếp</span>
              <select id="store-sort">
                <option value="">Mặc định</option>
                <option value="price-asc">Giá thấp đến cao</option>
                <option value="price-desc">Giá cao đến thấp</option>
                <option value="name-asc">Tên A–Z</option>
                <option value="stock-desc">Tồn kho nhiều nhất</option>
              </select>
            </label>
            <button class="store-button secondary" id="store-clear-filters" type="button">Xóa bộ lọc</button>
          </div>
        </div>
        <div class="store-products" id="store-products" aria-live="polite"><p class="store-empty">Đang tải sản phẩm...</p></div>
      </section>
    </main>
    <footer class="store-footer" id="store-footer">Woodcraft · Nội thất gỗ cho không gian sống của bạn</footer>
    <div class="store-toast" id="store-toast" role="status" aria-live="polite" hidden></div>
    <dialog class="store-dialog" id="store-detail-dialog"><div class="store-dialog-content" id="store-detail-content"></div></dialog>
  `;

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
  document.querySelector("#store-style").addEventListener("change", event => {
    selectedStyle = event.target.value;
    renderProductCards();
  });
  document.querySelector("#store-min-price").addEventListener("input", event => {
    minPrice = event.target.value;
    renderProductCards();
  });
  document.querySelector("#store-max-price").addEventListener("input", event => {
    maxPrice = event.target.value;
    renderProductCards();
  });
  document.querySelector("#store-sort").addEventListener("change", event => {
    sortOrder = event.target.value;
    renderProductCards();
  });
  document.querySelector("#store-clear-filters").addEventListener("click", () => {
    searchText = "";
    selectedCategory = "";
    selectedWood = "";
    selectedStyle = "";
    minPrice = "";
    maxPrice = "";
    sortOrder = "";
    document.querySelector("#store-search").value = "";
    document.querySelector("#store-min-price").value = "";
    document.querySelector("#store-max-price").value = "";
    renderProductCards();
  });
  document.querySelector("#store-detail-dialog").addEventListener("click", event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  window.addEventListener("storage", event => {
    if (event.key === "woodcraft-customer-cart") {
      cart = readCart();
      renderCart();
    }
  });
  window.addEventListener("woodcraft-cart-expired", () => {
    cart = [];
    renderCart();
    showToast("Giỏ hàng đã được xóa sau 5 phút.");
  });
  initializeStoreNavigation(document.querySelector(".store-nav"));
}

async function startStorefront() {
  renderPage();
  renderCart();
  await loadStoreProducts();
}

async function loadStoreProducts() {
  try {
    products = await getStoreProducts();
    renderProductCards();
    renderCart();
  } catch (error) {
    console.error("Không thể tải dữ liệu sản phẩm cửa hàng:", error);
    document.querySelector("#store-result-count").textContent = "Không tải được dữ liệu";
    document.querySelector("#store-products").innerHTML = `
      <div class="store-empty">
        <p>Chưa thể tải danh mục. Hãy kiểm tra cấu hình Supabase và quyền đọc dữ liệu. Chi tiết: ${escapeHtml(error.message)}</p>
        <button class="store-button" id="store-products-retry" type="button">Thử tải lại</button>
      </div>`;
    document.querySelector("#store-products-retry").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = "Đang tải...";
      await loadStoreProducts();
    });
  }
}

startStorefront();
