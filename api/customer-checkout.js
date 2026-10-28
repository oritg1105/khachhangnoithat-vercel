const {
  createHttpError, customerDatabaseRequest, getAuthenticatedCustomer, getCustomerConfig, statusFor
} = require("../lib/customerSession.js");
const { buildPromotionQuote } = require("../lib/customerPromotions.js");

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
    return response.status(statusFor(error)).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {})
    });
  }

  const requestedItems = request.body?.items;
  const isQuoteRequest = request.body?.action === "quote";
  const address = String(request.body?.address || "").trim();
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 30 ||
      requestedItems.some(item => !item || typeof item !== "object" ||
        !Number.isSafeInteger(Number(item.id_sanPham)) || Number(item.id_sanPham) < 1 ||
        !Number.isInteger(Number(item.soLuong)) || Number(item.soLuong) < 1 || Number(item.soLuong) > 100) ||
      (!isQuoteRequest && (address.length < 5 || address.length > 500))) {
    return response.status(400).json({ error: "Giỏ hàng hoặc địa chỉ giao hàng không hợp lệ." });
  }
  const quantities = new Map();
  for (const item of requestedItems) {
    const rawId = item.id_sanPham;
    const rawQuantity = item.soLuong;
    const id = typeof rawId === "number" || (typeof rawId === "string" && /^\d+$/.test(rawId))
      ? Number(rawId)
      : NaN;
    const itemQuantity = typeof rawQuantity === "number" || (typeof rawQuantity === "string" && /^\d+$/.test(rawQuantity))
      ? Number(rawQuantity)
      : NaN;
    const quantity = (quantities.get(id) || 0) + itemQuantity;
    if (!Number.isSafeInteger(id) || id < 1 ||
        !Number.isInteger(itemQuantity) || itemQuantity < 1 || itemQuantity > 100) {
      return response.status(400).json({ error: "Mã hoặc số lượng sản phẩm không hợp lệ." });
    }
    if (quantity > 100) {
      return response.status(400).json({ error: "Số lượng mỗi sản phẩm không được vượt quá 100." });
    }
    quantities.set(id, quantity);
  }
  const items = [...quantities].map(([id_sanpham, soluong]) => ({ id_sanpham, soluong }));
  if (!isQuoteRequest && request.body?.expectedItems !== undefined) {
    const expectedItems = request.body.expectedItems;
    const expectedQuantities = new Map();
    if (!Array.isArray(expectedItems) || expectedItems.length > 30 ||
        expectedItems.some(item => !item || typeof item !== "object" ||
          !Number.isSafeInteger(Number(item.id_sanPham)) || Number(item.id_sanPham) < 1 ||
          !Number.isInteger(Number(item.soLuong)) || Number(item.soLuong) < 1 || Number(item.soLuong) > 100)) {
      return response.status(409).json({ error: "Giỏ hàng đã thay đổi. Vui lòng tải lại trang thanh toán." });
    }
    for (const item of expectedItems) {
      const id = Number(item.id_sanPham);
      expectedQuantities.set(id, (expectedQuantities.get(id) || 0) + Number(item.soLuong));
    }
    const expected = [...expectedQuantities]
      .map(([id_sanpham, soluong]) => ({ id_sanpham, soluong }))
      .sort((left, right) => left.id_sanpham - right.id_sanpham);
    const actual = [...quantities]
      .map(([id_sanpham, soluong]) => ({ id_sanpham, soluong }))
      .sort((left, right) => left.id_sanpham - right.id_sanpham);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      return response.status(409).json({ error: "Giỏ hàng đã thay đổi. Vui lòng tải lại trang thanh toán." });
    }
  }

  let reservedProducts = [];
  let orderId = null;
  try {
    const productIds = items.map(item => item.id_sanpham).sort((left, right) => left - right);
    const productQuery = new URLSearchParams({
      select: "id_sanpham,dongia,soluong,trangthai",
      id_sanpham: `in.(${productIds.join(",")})`
    });
    const products = await customerDatabaseRequest(config, `/rest/v1/sanpham?${productQuery}`);
    const productsById = new Map((products || []).map(product => [Number(product.id_sanpham), product]));
    const orderLines = items.map(item => {
      const product = productsById.get(item.id_sanpham);
      const price = Number(product?.dongia);
      const stock = Number(product?.soluong);
      if (!product || Number(product.trangthai ?? 1) !== 1 ||
          !Number.isSafeInteger(stock) || stock < item.soluong ||
          !Number.isFinite(price) || price < 0) {
        throw createHttpError(409, "Sản phẩm không còn đủ hàng hoặc đã ngừng bán. Vui lòng kiểm tra lại giỏ hàng.");
      }
      return { ...item, price, stock };
    });

    const quote = await buildPromotionQuote(config, orderLines);
    if (!Number.isSafeInteger(quote.total) || !Number.isSafeInteger(quote.subtotal)) {
      throw createHttpError(400, "Tổng tiền đơn hàng vượt quá giới hạn hợp lệ.");
    }
    if (isQuoteRequest) {
      return response.status(200).json({
        data: {
          subtotal: quote.subtotal,
          productDiscount: quote.productDiscount,
          invoiceDiscount: quote.invoiceDiscount,
          totalDiscount: quote.totalDiscount,
          total: quote.total,
          invoicePromotionName: quote.invoicePromotionName,
          lines: quote.lines.map(item => ({
            id_sanpham: item.id_sanpham,
            soluong: item.soluong,
            subtotal: item.subtotal,
            productDiscount: item.productDiscount,
            productPromotionName: item.productPromotionName,
            total: item.amountAfterProductDiscount
          }))
        }
      });
    }
    if (request.body?.expectedTotal !== undefined &&
        (!Number.isSafeInteger(Number(request.body.expectedTotal)) || Number(request.body.expectedTotal) !== quote.total)) {
      throw createHttpError(409, "Giá hoặc khuyến mãi vừa thay đổi. Vui lòng tải lại trang thanh toán để xác nhận lại.");
    }

    for (const item of orderLines) {
      const query = new URLSearchParams({
        id_sanpham: `eq.${item.id_sanpham}`,
        soluong: `eq.${item.stock}`,
        trangthai: "eq.1"
      });
      const updated = await customerDatabaseRequest(
        config,
        `/rest/v1/sanpham?${query}`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: { soluong: item.stock - item.soluong }
        }
      );
      if (!updated?.[0]) {
        throw createHttpError(409, "Tồn kho vừa thay đổi. Vui lòng tải lại giỏ hàng và thử lại.");
      }
      reservedProducts.push({
        id: item.id_sanpham,
        previousStock: item.stock,
        reservedStock: item.stock - item.soluong
      });
    }

    const invoices = await customerDatabaseRequest(config, "/rest/v1/hoadon", {
      method: "POST",
      prefer: "return=representation",
      body: {
        ngaydat: new Date().toISOString().slice(0, 10),
        dichigiaohang: address,
        tongtien: quote.total,
        trangthai: 1,
        cccd_nhanvien: null,
        id_khachhang: context.user.id,
        id_mactkm: quote.invoicePromotionId,
        id_voucher: null
      }
    });
    orderId = Number(invoices?.[0]?.id_hoadon);
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      throw new Error("Database không trả về mã hóa đơn sau khi tạo đơn hàng.");
    }

    const promotionByProductId = new Map(quote.lines.map(line => [line.id_sanpham, line]));
    await customerDatabaseRequest(config, "/rest/v1/chitiethoadon", {
      method: "POST",
      prefer: "return=minimal",
      body: orderLines.map(item => ({
        id_sanpham: item.id_sanpham,
        id_hoadon: orderId,
        soluong: item.soluong,
        dongia: item.price,
        thanhtien: promotionByProductId.get(item.id_sanpham).amountAfterProductDiscount,
        id_mactkm: promotionByProductId.get(item.id_sanpham).productPromotionId
      }))
    });
    return response.status(201).json({
      data: {
        id_hoadon: orderId,
        tongtien: quote.total,
        giamgia: quote.totalDiscount
      }
    });
  } catch (error) {
    console.error("Customer checkout failed:", error.message);
    const rollbackErrors = [];

    if (orderId) {
      try {
        const detailQuery = new URLSearchParams({ id_hoadon: `eq.${orderId}` });
        await customerDatabaseRequest(config, `/rest/v1/chitiethoadon?${detailQuery}`, { method: "DELETE" });
        const invoiceQuery = new URLSearchParams({ id_hoadon: `eq.${orderId}` });
        await customerDatabaseRequest(config, `/rest/v1/hoadon?${invoiceQuery}`, { method: "DELETE" });
      } catch (rollbackError) {
        rollbackErrors.push(`hóa đơn ${orderId}: ${rollbackError.message}`);
      }
    }

    for (const product of reservedProducts.reverse()) {
      try {
        const query = new URLSearchParams({
          id_sanpham: `eq.${product.id}`,
          soluong: `eq.${product.reservedStock}`
        });
        const restored = await customerDatabaseRequest(
          config,
          `/rest/v1/sanpham?${query}`,
          {
            method: "PATCH",
            prefer: "return=representation",
            body: { soluong: product.previousStock }
          }
        );
        if (!restored?.[0]) {
          rollbackErrors.push(`tồn kho sản phẩm ${product.id} đã thay đổi, không thể hoàn tác tự động`);
        }
      } catch (rollbackError) {
        rollbackErrors.push(`tồn kho sản phẩm ${product.id}: ${rollbackError.message}`);
      }
    }

    if (rollbackErrors.length) {
      console.error("Customer checkout rollback failed:", rollbackErrors.join("; "));
      return response.status(502).json({
        error: "Không thể hoàn tất đơn hàng và có lỗi khi hoàn tác. Vui lòng liên hệ cửa hàng để kiểm tra."
      });
    }

    return response.status(statusFor(error)).json({ error: error.message });
  }
};
