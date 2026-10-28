import { getValidCustomerSession } from "./customerAuthModel.js";

async function requestAccount(method, body) {
  const session = await getValidCustomerSession();
  if (!session) throw new Error("Vui lòng đăng nhập để tiếp tục.");
  const response = await fetch("/api/customer-account", {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Không thể tải thông tin tài khoản khách.");
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload.data;
}

export function getCustomerAccount() {
  return requestAccount("GET");
}

export function updateCustomerProfile(fullName, phone) {
  return requestAccount("PATCH", { action: "profile", fullName, phone });
}

export function addCustomerAddress(address) {
  return requestAccount("POST", { action: "address", address });
}

export function updateCustomerAddress(currentAddress, address) {
  return requestAccount("PATCH", { action: "update-address", currentAddress, address });
}

export function deleteCustomerAddress(address) {
  return requestAccount("POST", { action: "delete-address", address });
}

export async function placeCustomerOrder(cart, address, expectedQuote) {
  const session = await getValidCustomerSession();
  if (!session) throw new Error("Vui lòng đăng nhập để đặt hàng.");
  const response = await fetch("/api/customer-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      address,
      expectedTotal: expectedQuote?.total,
      expectedItems: expectedQuote?.lines.map(item => ({
        id_sanPham: item.id_sanpham,
        soLuong: item.soluong
      })),
      items: cart.map(item => ({ id_sanPham: item.id, soLuong: item.quantity }))
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Không thể tạo đơn hàng.");
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload.data;
}

export async function getCustomerOrderQuote(cart) {
  const session = await getValidCustomerSession();
  if (!session) throw new Error("Vui lòng đăng nhập để tiếp tục.");
  const response = await fetch("/api/customer-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      action: "quote",
      items: cart.map(item => ({ id_sanPham: item.id, soLuong: item.quantity }))
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Không thể tính giá và khuyến mãi.");
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload.data;
}
