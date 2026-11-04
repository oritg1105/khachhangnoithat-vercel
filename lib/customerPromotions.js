const { customerDatabaseRequest } = require("./customerSession.js");

const roundMoney = amount => Math.round(amount);

function isActiveCampaign(campaign, today) {
  return Number(campaign.trangthai) === 1 &&
    Number(campaign.isdeleted) === 0 &&
    (!campaign.ngaybd || campaign.ngaybd <= today) &&
    (!campaign.ngaykt || campaign.ngaykt >= today);
}

function percentValue(value, label) {
  if (value == null || value === "") return null;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`Tỷ lệ giảm giá của chương trình ${label} không hợp lệ.`);
  }
  return percent;
}

function positiveMoneyValue(value, label) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Mức giảm giá của chương trình ${label} không hợp lệ.`);
  }
  return amount;
}

function formatPercent(value) {
  return Number(value.toFixed(2)).toString();
}

function quotedIds(ids) {
  return `in.(${ids.map(id => `"${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

function promotionKey(promotion) {
  return JSON.stringify([promotion.type, String(promotion.id)]);
}

function requestedPromotionKey(promotion) {
  if (!promotion || typeof promotion !== "object" ||
      !["product", "invoice", "voucher"].includes(promotion.type) ||
      typeof promotion.id !== "string" || !promotion.id) {
    return null;
  }
  return promotionKey(promotion);
}

async function buildPromotionQuote(config, orderLines, selectedPromotion = null) {
  const today = new Date().toISOString().slice(0, 10);
  const campaignQuery = new URLSearchParams({
    select: "id_mactkm,tenctkm,ngaybd,ngaykt,isdeleted,trangthai",
    trangthai: "eq.1",
    isdeleted: "eq.0"
  });
  const allCampaigns = await customerDatabaseRequest(
    config,
    `/rest/v1/chuongtrinhkhuyenmai?${campaignQuery}`
  );
  const campaigns = (allCampaigns || []).filter(campaign => isActiveCampaign(campaign, today));
  const campaignById = new Map(campaigns.map(campaign => [String(campaign.id_mactkm), campaign]));
  const campaignIds = [...campaignById.keys()];
  const productIds = orderLines.map(item => item.id_sanpham);

  const [productRows, invoiceRows, voucherRows] = campaignIds.length
    ? await Promise.all([
      customerDatabaseRequest(config, `/rest/v1/kmtheosanpham?${new URLSearchParams({
        select: "id_mactkm,phantram,id_sanpham",
        id_mactkm: quotedIds(campaignIds),
        id_sanpham: quotedIds(productIds)
      })}`),
      customerDatabaseRequest(config, `/rest/v1/kmtheohd?${new URLSearchParams({
        select: "id_mactkm,muctienkm,phantram",
        id_mactkm: quotedIds(campaignIds)
      })}`),
      customerDatabaseRequest(config, `/rest/v1/kmtheovoucher?${new URLSearchParams({
        select: "id_voucher,id_mactkm,phantram,soluonghientai",
        id_mactkm: quotedIds(campaignIds),
        soluonghientai: "gt.0"
      })}`)
    ])
    : [[], [], []];

  const subtotal = orderLines.reduce((sum, item) => sum + roundMoney(item.price * item.soluong), 0);
  const productRowsByCampaign = new Map();
  for (const row of productRows || []) {
    const campaignId = String(row.id_mactkm);
    const campaign = campaignById.get(campaignId);
    const percent = percentValue(row.phantram, campaign?.tenctkm || campaignId);
    const productId = Number(row.id_sanpham);
    if (!campaign || percent == null || percent === 0) continue;
    const rows = productRowsByCampaign.get(campaignId) || new Map();
    rows.set(productId, percent);
    productRowsByCampaign.set(campaignId, rows);
  }

  const promotionOptions = [];
  for (const [campaignId, discountsByProduct] of productRowsByCampaign) {
    const applicableLines = orderLines.filter(item => discountsByProduct.has(item.id_sanpham));
    const applicableSubtotal = applicableLines.reduce((sum, item) =>
      sum + roundMoney(item.price * item.soluong), 0);
    const discount = applicableLines.reduce((sum, item) => {
      const percent = discountsByProduct.get(item.id_sanpham);
      return sum + (percent
        ? Math.min(roundMoney(item.price * item.soluong), roundMoney(item.price * item.soluong * percent / 100))
        : 0);
    }, 0);
    if (discount > 0) {
      const campaign = campaignById.get(campaignId);
      const percentages = [...new Set(applicableLines
        .map(item => discountsByProduct.get(item.id_sanpham))
        .filter(percent => percent > 0))]
        .sort((left, right) => left - right);
      promotionOptions.push({
        type: "product",
        id: campaignId,
        campaignId,
        name: campaign.tenctkm || campaignId,
        description: "Giảm giá áp dụng cho sản phẩm thuộc chương trình",
        discount,
        discountPercent: discount / applicableSubtotal * 100,
        discountPercentLabel: percentages.map(formatPercent).join("% / ") + "%"
      });
    }
  }

  for (const row of invoiceRows || []) {
    const campaignId = String(row.id_mactkm);
    const campaign = campaignById.get(campaignId);
    if (!campaign) continue;
    const fixedAmount = positiveMoneyValue(row.muctienkm, campaign.tenctkm || campaignId);
    const percent = percentValue(row.phantram, campaign.tenctkm || campaignId);
    if (fixedAmount == null && percent == null) continue;
    const fixedDiscount = fixedAmount == null ? 0 : Math.min(subtotal, roundMoney(fixedAmount));
    const percentDiscount = percent == null ? 0 : Math.min(subtotal, roundMoney(subtotal * percent / 100));
    const discount = Math.max(fixedDiscount, percentDiscount);
    if (discount > 0) {
      promotionOptions.push({
        type: "invoice",
        id: campaignId,
        campaignId,
        name: campaign.tenctkm || campaignId,
        description: "Giảm giá trên tổng giá trị đơn hàng",
        discount,
        discountPercent: percent != null && percentDiscount >= fixedDiscount
          ? percent
          : subtotal > 0 ? discount / subtotal * 100 : 0,
        discountPercentLabel: `${formatPercent(percent != null && percentDiscount >= fixedDiscount
          ? percent
          : subtotal > 0 ? discount / subtotal * 100 : 0)}%`
      });
    }
  }

  for (const row of voucherRows || []) {
    const campaignId = String(row.id_mactkm);
    const campaign = campaignById.get(campaignId);
    const voucherId = String(row.id_voucher);
    const percent = percentValue(row.phantram, voucherId);
    if (!campaign || !voucherId || percent == null || percent === 0 ||
        !Number.isSafeInteger(Number(row.soluonghientai)) || Number(row.soluonghientai) < 1) continue;
    const discount = Math.min(subtotal, roundMoney(subtotal * percent / 100));
    if (discount > 0) {
      promotionOptions.push({
        type: "voucher",
        id: voucherId,
        campaignId,
        name: voucherId,
        description: `${campaign.tenctkm || campaignId} · giảm ${percent}%`,
        discount,
        discountPercent: percent,
        discountPercentLabel: `${formatPercent(percent)}%`,
        available: Number(row.soluonghientai)
      });
    }
  }

  promotionOptions.sort((left, right) =>
    left.name.localeCompare(right.name, "vi") || left.type.localeCompare(right.type)
  );
  const selectedKey = selectedPromotion == null ? null : requestedPromotionKey(selectedPromotion);
  if (selectedPromotion != null && !selectedKey) {
    const error = new Error("Lựa chọn khuyến mãi không hợp lệ.");
    error.status = 400;
    throw error;
  }
  const selected = selectedKey
    ? promotionOptions.find(option => promotionKey(option) === selectedKey)
    : null;
  if (selectedKey && !selected) {
    const error = new Error("Khuyến mãi đã hết hạn hoặc không còn áp dụng cho giỏ hàng.");
    error.status = 409;
    throw error;
  }

  const selectedProductRows = selected?.type === "product"
    ? productRowsByCampaign.get(selected.campaignId)
    : null;
  const lines = orderLines.map(item => {
    const lineSubtotal = roundMoney(item.price * item.soluong);
    const percent = selectedProductRows?.get(item.id_sanpham);
    const productDiscount = percent
      ? Math.min(lineSubtotal, roundMoney(lineSubtotal * percent / 100))
      : 0;
    return {
      ...item,
      subtotal: lineSubtotal,
      productDiscount,
      productDiscountPercent: productDiscount ? percent : null,
      productPromotionId: productDiscount ? selected.campaignId : null,
      productPromotionName: productDiscount ? selected.name : null,
      amountAfterProductDiscount: lineSubtotal - productDiscount
    };
  });
  const productDiscount = selected?.type === "product" ? selected.discount : 0;
  const invoiceDiscount = selected && selected.type !== "product" ? selected.discount : 0;
  const totalDiscount = productDiscount + invoiceDiscount;
  const total = Math.max(0, subtotal - totalDiscount);

  return {
    lines,
    subtotal,
    productDiscount,
    invoiceDiscount,
    totalDiscount,
    total,
    promotionOptions,
    selectedPromotion: selected ? { type: selected.type, id: selected.id } : null,
    selectedPromotionName: selected?.name || null,
    promotionCampaignId: selected?.campaignId || null,
    invoicePromotionId: selected?.type === "invoice" ? selected.campaignId : null,
    voucherId: selected?.type === "voucher" ? selected.id : null,
    invoicePromotionName: selected?.type === "invoice" ? selected.name : null
  };
}

module.exports = { buildPromotionQuote };
