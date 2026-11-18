const {
  customerDatabaseRequest, getAuthenticatedCustomer, getCustomerConfig, statusFor
} = require("../lib/customerSession.js");
const { normalizeCustomerName, normalizeVietnamesePhone } = require("../lib/customerValidation.js");

async function loadCustomer(config, customerId) {
  const rows = await customerDatabaseRequest(
    config,
    `/rest/v1/khachhang?select=id_khachhang,hoten,sdt,email&id_khachhang=eq.${customerId}&limit=1`
  );
  const customer = rows?.[0];
  if (!customer) {
    const error = new Error("Không tìm thấy hồ sơ khách hàng.");
    error.status = 404;
    throw error;
  }
  return customer;
}

async function loadAddresses(config, customerId) {
  const rows = await customerDatabaseRequest(
    config,
    `/rest/v1/diachigiaohang?select=id_diachi,id_khachhang,tinhthanh,phuongxa,duong,macdinh&id_khachhang=eq.${customerId}&order=macdinh.desc,id_diachi.desc`
  );
  return rows || [];
}

async function loadOrders(config, customerId, addresses) {
  const orders = await customerDatabaseRequest(
    config,
    `/rest/v1/hoadon?select=id_hoadon,ngaydat,id_diachigiaohang,ngaygiao,tongtien,trangthai&id_khachhang=eq.${customerId}&order=id_hoadon.desc&limit=50`
  );
  if (!orders?.length) return [];
  const ids = orders.map(order => Number(order.id_hoadon)).filter(Number.isInteger);
  const addressIds = [...new Set(orders.map(order => Number(order.id_diachigiaohang)).filter(Number.isSafeInteger))];
  const addressMap = new Map((addresses || []).map(address => [Number(address.id_diachi), address]));
  const missingAddressIds = addressIds.filter(id => !addressMap.has(id));
  const [details, products, missingAddresses] = await Promise.all([
    customerDatabaseRequest(
      config,
      `/rest/v1/chitiethoadon?select=id_hoadon,id_sanpham,soluong,dongia,thanhtien&id_hoadon=in.(${ids.join(",")})`
    ),
    customerDatabaseRequest(config, "/rest/v1/sanpham?select=id_sanpham,tensanpham"),
    missingAddressIds.length
      ? customerDatabaseRequest(config, `/rest/v1/diachigiaohang?select=id_diachi,tinhthanh,phuongxa,duong,macdinh&id_khachhang=eq.${customerId}&id_diachi=in.(${missingAddressIds.join(",")})`)
      : []
  ]);
  for (const address of missingAddresses || []) addressMap.set(Number(address.id_diachi), address);
  return orders.map(order => ({
    id: Number(order.id_hoadon),
    date: order.ngaydat,
    address: addressMap.get(Number(order.id_diachigiaohang)) || null,
    deliveredAt: order.ngaygiao,
    total: Number(order.tongtien || 0),
    status: Number(order.trangthai) === 0
      ? "Đã hủy"
      : Number(order.trangthai) === 2 || order.ngaygiao
        ? "Đã hoàn thành"
        : "Đang duyệt",
    items: (details || [])
      .filter(detail => Number(detail.id_hoadon) === Number(order.id_hoadon))
      .map(detail => ({
        name: products?.find(product => Number(product.id_sanpham) === Number(detail.id_sanpham))?.tensanpham ||
          `Sản phẩm #${detail.id_sanpham}`,
        quantity: Number(detail.soluong || 0),
        price: Number(detail.dongia || 0),
        total: Number(detail.thanhtien || 0)
      }))
  }));
}

function parseAddress(body) {
  const address = {
    tinhthanh: Number(body?.tinhThanh),
    phuongxa: Number(body?.phuongXa),
    duong: String(body?.duong || "").trim(),
    macdinh: body?.macDinh === true
  };
  if (!Number.isSafeInteger(address.tinhthanh) || address.tinhthanh < 1 ||
      !Number.isSafeInteger(address.phuongxa) || address.phuongxa < 1 ||
      address.duong.length < 2 || address.duong.length > 300) {
    return null;
  }
  return address;
}

async function setDefaultAddress(config, customerId, addressId) {
  const clearQuery = new URLSearchParams({
    id_khachhang: `eq.${customerId}`,
    macdinh: "eq.1"
  });
  await customerDatabaseRequest(config, `/rest/v1/diachigiaohang?${clearQuery}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { macdinh: 0 }
  });
  const defaultQuery = new URLSearchParams({
    id_khachhang: `eq.${customerId}`,
    id_diachi: `eq.${addressId}`
  });
  const updated = await customerDatabaseRequest(config, `/rest/v1/diachigiaohang?${defaultQuery}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { macdinh: 1 }
  });
  if (!updated?.[0]) {
    const error = new Error("Không thể đặt địa chỉ mặc định.");
    error.status = 409;
    throw error;
  }
  return updated[0];
}

module.exports = async function handler(request, response) {
  if (!["GET", "PATCH", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, PATCH, POST");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  let config;
  let context;
  try {
    config = getCustomerConfig();
    context = await getAuthenticatedCustomer(request, config);
  } catch (error) {
    console.error("Customer account authorization failed:", error.message);
    return response.status(statusFor(error)).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {})
    });
  }

  const customerId = context.user.id;
  const action = request.body?.action;
  try {
    if (request.method === "GET") {
      const [profile, addresses] = await Promise.all([
        loadCustomer(config, customerId),
        loadAddresses(config, customerId)
      ]);
      const orders = await loadOrders(config, customerId, addresses);
      return response.status(200).json({
        data: { profile, addresses, orders, username: context.user.username }
      });
    }

    if (request.method === "PATCH" && action === "profile") {
      const field = request.body?.field;
      const fullName = normalizeCustomerName(request.body?.fullName);
      const phoneText = typeof request.body?.phone === "string" ? request.body.phone.trim() : "";
      let updates;
      if (field === "fullName") {
        if (!fullName) {
          return response.status(400).json({ error: "Họ tên cần từ 2 đến 120 ký tự chữ, cách nhau bằng khoảng trắng, dấu nháy hoặc gạch nối." });
        }
        updates = { hoten: fullName };
      } else if (field === "phone") {
        const phone = normalizeVietnamesePhone(phoneText);
        if (!phone) {
          return response.status(400).json({ error: "Số điện thoại Việt Nam không hợp lệ. Hãy nhập số di động 10 số hoặc số cố định đầu 02." });
        }
        updates = { sdt: phone };
      } else {
        const phone = phoneText ? normalizeVietnamesePhone(phoneText) : null;
        if (!fullName || (phoneText && !phone)) {
          return response.status(400).json({ error: "Họ tên hoặc số điện thoại không đúng định dạng." });
        }
        updates = { hoten: fullName, sdt: phone };
      }
      const result = await customerDatabaseRequest(
        config,
        `/rest/v1/khachhang?id_khachhang=eq.${customerId}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: updates
        }
      );
      if (!result?.[0]) return response.status(403).json({ error: "Không thể cập nhật hồ sơ khách hàng." });
      return response.status(200).json({ data: result[0] });
    }

    if (request.method === "POST" && action === "address") {
      const address = parseAddress(request.body);
      if (!address) {
        return response.status(400).json({ error: "Vui lòng chọn tỉnh/thành, phường/xã và nhập số nhà, tên đường hợp lệ." });
      }
      const currentAddresses = await loadAddresses(config, customerId);
      const result = await customerDatabaseRequest(config, "/rest/v1/diachigiaohang", {
        method: "POST",
        prefer: "return=representation",
        body: {
          tinhthanh: address.tinhthanh,
          phuongxa: address.phuongxa,
          duong: address.duong,
          macdinh: address.macdinh || currentAddresses.length === 0 ? 1 : 0,
          id_khachhang: customerId
        }
      });
      if (!result?.[0]) return response.status(403).json({ error: "Không thể lưu địa chỉ giao hàng." });
      const saved = address.macdinh && currentAddresses.length
        ? await setDefaultAddress(config, customerId, result[0].id_diachi)
        : result[0];
      return response.status(201).json({ data: saved });
    }

    if (request.method === "PATCH" && action === "update-address") {
      const addressId = Number(request.body?.addressId);
      const address = parseAddress(request.body);
      if (!Number.isSafeInteger(addressId) || addressId < 1 || !address) {
        return response.status(400).json({ error: "Địa chỉ giao hàng không hợp lệ." });
      }
      const query = new URLSearchParams({
        id_khachhang: `eq.${customerId}`,
        id_diachi: `eq.${addressId}`
      });
      const result = await customerDatabaseRequest(
        config,
        `/rest/v1/diachigiaohang?${query}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            tinhthanh: address.tinhthanh,
            phuongxa: address.phuongxa,
            duong: address.duong,
            macdinh: address.macdinh ? 1 : 0
          }
        }
      );
      if (!result?.length) return response.status(404).json({ error: "Không tìm thấy địa chỉ giao hàng cần sửa." });
      const saved = address.macdinh
        ? await setDefaultAddress(config, customerId, addressId)
        : result[0];
      return response.status(200).json({ data: saved });
    }

    if (request.method === "POST" && action === "delete-address") {
      const addressId = Number(request.body?.addressId);
      if (!Number.isSafeInteger(addressId) || addressId < 1) {
        return response.status(400).json({ error: "Mã địa chỉ cần xóa không hợp lệ." });
      }
      const invoiceQuery = new URLSearchParams({
        id_khachhang: `eq.${customerId}`,
        id_diachigiaohang: `eq.${addressId}`,
        select: "id_hoadon",
        limit: "1"
      });
      const linkedOrders = await customerDatabaseRequest(config, `/rest/v1/hoadon?${invoiceQuery}`);
      if (linkedOrders?.length) {
        return response.status(409).json({
          error: "Địa chỉ đã được dùng cho đơn hàng nên không thể xóa. Bạn có thể sửa địa chỉ hoặc chọn địa chỉ khác."
        });
      }
      const query = new URLSearchParams({
        id_khachhang: `eq.${customerId}`,
        id_diachi: `eq.${addressId}`
      });
      const result = await customerDatabaseRequest(
        config,
        `/rest/v1/diachigiaohang?${query}`,
        { method: "DELETE", prefer: "return=representation" }
      );
      if (!result?.length) return response.status(404).json({ error: "Không tìm thấy địa chỉ giao hàng cần xóa." });
      if (Number(result[0].macdinh) === 1) {
        const remainingAddresses = await loadAddresses(config, customerId);
        if (remainingAddresses.length) {
          await setDefaultAddress(config, customerId, remainingAddresses[0].id_diachi);
        }
      }
      return response.status(200).json({ data: true });
    }

    return response.status(400).json({ error: "Thao tác tài khoản không hợp lệ." });
  } catch (error) {
    console.error("Customer account request failed:", error.message);
    return response.status(statusFor(error)).json({ error: error.message });
  }
};
