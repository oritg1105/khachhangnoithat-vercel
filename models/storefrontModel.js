const CART_KEY = "woodcraft-customer-cart";

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
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Giỏ hàng không hợp lệ.");
    return parsed
      .filter(item => Number.isInteger(Number(item.id)) && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0)
      .map(item => ({ id: Number(item.id), quantity: Number(item.quantity) }));
  } catch {
    localStorage.removeItem(CART_KEY);
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function getCartDetails(cart, products) {
  return cart.map(item => {
    const product = products.find(entry => entry.rawId === item.id);
    if (!product || product.stock < 1) return null;
    return { product, quantity: Math.min(item.quantity, product.stock) };
  }).filter(Boolean);
}
