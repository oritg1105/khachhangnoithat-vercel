import { getProducts } from "./productsModel.js";

const CART_KEY = "woodcraft-customer-cart";

export async function getStoreProducts() {
  const products = await getProducts({ throwOnFailure: true });
  return products
    .filter(product => product.trangThai === 1)
    .map(product => ({
      ...product,
      rawId: Number(product.rawId),
      stock: Math.max(0, Number(product.stock) || 0),
      price: Math.max(0, Number(product.price) || 0)
    }));
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
