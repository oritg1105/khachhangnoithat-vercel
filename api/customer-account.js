const {
  customerDatabaseRequest, getAuthenticatedCustomer, getCustomerConfig, statusFor
} = require("../lib/customerSession.js");

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
    `/rest/v1/diachigiaohang?select=dichi&id_khachhang=eq.${customerId}&order=dichi.asc`
  );
  return (rows || []).map(row => row.dichi);
}

async function loadOrders(config, customerId) {
  const orders = await customerDatabaseRequest(
    config,
    `/rest/v1/hoadon?select=id_hoadon,ngaydat,dichigiaohang,ngaygiao,tongtien,trangthai&id_khachhang=eq.${customerId}&order=id_hoadon.desc&limit=50`
  );
  if (!orders?.length) return [];
  const ids = orders.map(order => Number(order.id_hoadon)).filter(Number.isInteger);
  const [details, products] = await Promise.all([
    customerDatabaseRequest(
      config,
      `/rest/v1/chitiethoadon?select=id_hoadon,id_sanpham,soluong,dongia,thanhtien&id_hoadon=in.(${ids.join(",")})`
    ),
    customerDatabaseRequest(config, "/rest/v1/sanpham?select=id_sanpham,tensanpham")
  ]);
  return orders.map(order => ({
    id: Number(order.id_hoadon),
    date: order.ngaydat,
    address: order.dichigiaohang || "",
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
      const [profile, addresses, orders] = await Promise.all([
        loadCustomer(config, customerId),
        loadAddresses(config, customerId),
        loadOrders(config, customerId)
      ]);
      return response.status(200).json({
        data: { profile, addresses, orders, username: context.user.username }
      });
    }

    if (request.method === "PATCH" && action === "profile") {
      const fullName = String(request.body?.fullName || "").trim();
      const phone = String(request.body?.phone || "").trim();
      if (!fullName || fullName.length > 120 || phone.length > 30) {
        return response.status(400).json({ error: "Họ tên bắt buộc; số điện thoại tối đa 30 ký tự." });
      }
      const result = await customerDatabaseRequest(
        config,
        `/rest/v1/khachhang?id_khachhang=eq.${customerId}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: { hoten: fullName, sdt: phone || null }
        }
      );
      if (!result?.[0]) return response.status(403).json({ error: "Không thể cập nhật hồ sơ khách hàng." });
      return response.status(200).json({ data: result[0] });
    }

    if (request.method === "POST" && action === "address") {
      const address = String(request.body?.address || "").trim();
      if (address.length < 5 || address.length > 500) {
        return response.status(400).json({ error: "Địa chỉ cần từ 5 đến 500 ký tự." });
      }
      const result = await customerDatabaseRequest(config, "/rest/v1/diachigiaohang", {
        method: "POST",
        prefer: "return=representation",
        body: { dichi: address, id_khachhang: customerId }
      });
      if (!result?.[0]) return response.status(403).json({ error: "Không thể lưu địa chỉ giao hàng." });
      return response.status(201).json({ data: result[0] });
    }

    if (request.method === "PATCH" && action === "update-address") {
      const currentAddress = String(request.body?.currentAddress || "").trim();
      const address = String(request.body?.address || "").trim();
      if (!currentAddress || address.length < 5 || address.length > 500) {
        return response.status(400).json({ error: "Địa chỉ cần từ 5 đến 500 ký tự." });
      }
      const query = new URLSearchParams({
        id_khachhang: `eq.${customerId}`,
        dichi: `eq.${currentAddress}`
      });
      const result = await customerDatabaseRequest(
        config,
        `/rest/v1/diachigiaohang?${query}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: { dichi: address }
        }
      );
      if (!result?.length) return response.status(404).json({ error: "Không tìm thấy địa chỉ giao hàng cần sửa." });
      return response.status(200).json({ data: result[0] });
    }

    if (request.method === "POST" && action === "delete-address") {
      const address = String(request.body?.address || "").trim();
      if (!address) return response.status(400).json({ error: "Thiếu địa chỉ cần xóa." });
      const query = new URLSearchParams({
        id_khachhang: `eq.${customerId}`,
        dichi: `eq.${address}`
      });
      const result = await customerDatabaseRequest(
        config,
        `/rest/v1/diachigiaohang?${query}`,
        { method: "DELETE", prefer: "return=representation" }
      );
      if (!result?.length) return response.status(404).json({ error: "Không tìm thấy địa chỉ giao hàng cần xóa." });
      return response.status(200).json({ data: true });
    }

    return response.status(400).json({ error: "Thao tác tài khoản không hợp lệ." });
  } catch (error) {
    console.error("Customer account request failed:", error.message);
    return response.status(statusFor(error)).json({ error: error.message });
  }
};
