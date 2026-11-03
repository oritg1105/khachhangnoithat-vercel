const CART_KEY = "woodcraft-customer-cart";
const CART_UPDATED_AT_KEY = "woodcraft-customer-cart-updated-at";
const CART_TTL_MS = 5 * 60 * 1000;
let cartExpirationTimer;

function clearStoredCart(notify = false) {
  const hadCart = Boolean(localStorage.getItem(CART_KEY));
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(CART_UPDATED_AT_KEY);
  clearTimeout(cartExpirationTimer);
  if (notify && hadCart && typeof window !== "undefined") {
    window.dispatchEvent(new Event("woodcraft-cart-expired"));
  }
}

function scheduleCartExpiration(updatedAt) {
  clearTimeout(cartExpirationTimer);
  const remaining = updatedAt + CART_TTL_MS - Date.now();
  cartExpirationTimer = setTimeout(() => {
    const storedUpdatedAt = Number(localStorage.getItem(CART_UPDATED_AT_KEY));
    if (storedUpdatedAt !== updatedAt) return;
    if (Date.now() - storedUpdatedAt >= CART_TTL_MS) {
      clearStoredCart(true);
    } else {
      scheduleCartExpiration(storedUpdatedAt);
    }
  }, Math.max(0, remaining));
}

function normalizeCart(items) {
  return items
    .filter(item => Number.isInteger(Number(item.id)) &&
      Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0)
    .map(item => ({ id: Number(item.id), quantity: Number(item.quantity) }));
}

export async function getStoreProducts() {
  const response = await fetch("/api/customer-data");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Không thể tải sản phẩm (${response.status}).`);

  const data = payload.data || {};
  const categories = data.LOAISP || [];
  const styles = data.KIEUDANG || [];
  const woods = data.LOAIGO || [];
  return (data.SANPHAM || [])
    .filter(item => Number(item.trangthai ?? 1) === 1 && Number(item.soluong) > 0)
    .map(item => {
      const style = styles.find(entry => Number(entry.id_kieudang) === Number(item.id_kieudang)) || {};
      return {
        rawId: Number(item.id_sanpham),
        id: `SP${String(item.id_sanpham).padStart(3, "0")}`,
        name: item.tensanpham || "",
        detail: item.mota || "",
        description: item.mota || "",
        moTa: item.mota || "",
        image: item.hinhanh || "",
        hinhAnh: item.hinhanh || "",
        style: styles.find(entry => Number(entry.id_kieudang) === Number(item.id_kieudang))?.tenkieudang || "",
        styleId: item.id_kieudang,
        categoryId: style.id_loaisp,
        woodId: item.id_mago,
        category: categories.find(entry => Number(entry.id_loaisp) === Number(style.id_loaisp))?.tenloai || "",
        wood: woods.find(entry => Number(entry.id_mago) === Number(item.id_mago))?.tengo || "",
        price: Math.max(0, Number(item.dongia) || 0),
        stock: Math.max(0, Number(item.soluong) || 0),
        status: Number(item.trangthai ?? 1) === 0 ? "Đã khóa" : "Đang sử dụng",
        trangThai: Number(item.trangthai ?? 1)
      };
    });
}

export function readCart() {
  const stored = localStorage.getItem(CART_KEY);
  if (!stored) {
    localStorage.removeItem(CART_UPDATED_AT_KEY);
    clearTimeout(cartExpirationTimer);
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Giỏ hàng không hợp lệ.");
    const cart = normalizeCart(parsed);
    if (!cart.length) {
      localStorage.removeItem(CART_UPDATED_AT_KEY);
      clearTimeout(cartExpirationTimer);
      return [];
    }
    let updatedAt = Number(localStorage.getItem(CART_UPDATED_AT_KEY));
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
      updatedAt = Date.now();
      localStorage.setItem(CART_UPDATED_AT_KEY, String(updatedAt));
    }
    if (Date.now() - updatedAt >= CART_TTL_MS) {
      clearStoredCart();
      return [];
    }
    scheduleCartExpiration(updatedAt);
    return cart;
  } catch {
    clearStoredCart();
    return [];
  }
}

export function saveCart(cart) {
  const normalizedCart = normalizeCart(cart);
  const serializedCart = JSON.stringify(normalizedCart);
  const previousCart = localStorage.getItem(CART_KEY);
  localStorage.setItem(CART_KEY, serializedCart);
  if (!normalizedCart.length) {
    localStorage.removeItem(CART_UPDATED_AT_KEY);
    clearTimeout(cartExpirationTimer);
    return;
  }
  let updatedAt = Number(localStorage.getItem(CART_UPDATED_AT_KEY));
  if (previousCart !== serializedCart || !Number.isFinite(updatedAt) || updatedAt <= 0) {
    updatedAt = Date.now();
    localStorage.setItem(CART_UPDATED_AT_KEY, String(updatedAt));
  }
  scheduleCartExpiration(updatedAt);
}

export function getCartDetails(cart, products) {
  return cart.map(item => {
    const product = products.find(entry => entry.rawId === item.id);
    if (!product || product.stock < 1) return null;
    return { product, quantity: Math.min(item.quantity, product.stock) };
  }).filter(Boolean);
}
