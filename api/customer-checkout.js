const {
  customerDatabaseRequest, getAuthenticatedCustomer, getCustomerConfig, statusFor
} = require("../lib/customerSession.js");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  let config;
  let context;
  try {
    config = getCustomerConfig();
    context = await getAuthenticatedCustomer(request, config);
  } catch (error) {
    return response.status(statusFor(error)).json({ error: error.message });
  }

  const items = request.body?.items;
  const address = String(request.body?.address || "").trim();
  if (!Array.isArray(items) || items.length < 1 || items.length > 30 ||
      items.some(item => !item || typeof item !== "object" ||
        !Number.isInteger(Number(item.id_sanPham)) ||
        !Number.isInteger(Number(item.soLuong)) || Number(item.soLuong) < 1 || Number(item.soLuong) > 100) ||
      address.length < 5 || address.length > 500) {
    return response.status(400).json({ error: "Giỏ hàng hoặc địa chỉ giao hàng không hợp lệ." });
  }

  try {
    const result = await customerDatabaseRequest(config, "/rest/v1/rpc/place_customer_password_order", {
      method: "POST",
      body: {
        p_customer_id: context.user.id,
        p_items: items.map(item => ({
          id_sanpham: Number(item.id_sanPham),
          soluong: Number(item.soLuong)
        })),
        p_address: address
      }
    });
    return response.status(201).json({ data: result });
  } catch (error) {
    console.error("Customer checkout failed:", error.message);
    return response.status(statusFor(error)).json({ error: error.message });
  }
};
