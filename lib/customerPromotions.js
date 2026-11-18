const { customerDatabaseRequest } = require("./customerSession.js");

const roundMoney = amount => Math.round(amount);

function isActiveCampaign(campaign, today) {
  return Number(campaign.trangthai) === 1 &&
    Number(campaign.isdeleted) === 0 &&
    Boolean(campaign.ngaybd && campaign.ngaykt) &&
    campaign.ngaybd <= today &&
    campaign.ngaykt >= today;
}

function percentValue(value, label) {
  if (value == null || value === "") return null;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`Tỷ lệ giảm giá của chương trình ${label} không hợp lệ.`);
  }
  return percent;
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
    promotion.type !== "voucher" ||
    typeof promotion.id !== "string" || !promotion.id) {
    return null;
  }
  return promotionKey(promotion);
}

async function loadActiveCampaigns(config) {
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
  return (allCampaigns || []).filter(campaign => isActiveCampaign(campaign, today));
}

async function loadProductDiscounts(config, productIds, campaigns) {
  const campaignById = new Map(campaigns.map(campaign => [String(campaign.id_mactkm), campaign]));
  const campaignIds = [...campaignById.keys()];
  if (!campaignIds.length || !productIds.length) return new Map();
  const rows = await customerDatabaseRequest(config, `/rest/v1/kmtheosanpham?${new URLSearchParams({
    select: "id_mactkm,phantram,id_sanpham",
    id_mactkm: quotedIds(campaignIds),
    id_sanpham: quotedIds(productIds)
  })}`);
  const discounts = new Map();
  for (const row of rows || []) {
    const campaignId = String(row.id_mactkm);
    const campaign = campaignById.get(campaignId);
    const percent = percentValue(row.phantram, campaign?.tenctkm || campaignId);
    const productId = Number(row.id_sanpham);
    if (!campaign || percent == null || percent <= 0) continue;
    const previous = discounts.get(productId);
    if (!previous || percent > previous.percent) {
      discounts.set(productId, {
        percent,
        campaignId,
        campaignName: campaign.tenctkm || campaignId
      });
    }
  }
  return discounts;
}

async function getActiveProductDiscounts(config, products) {
  const campaigns = await loadActiveCampaigns(config);
  const productIds = (products || [])
    .map(product => Number(product.id_sanpham))
    .filter(Number.isSafeInteger);
  const discounts = await loadProductDiscounts(config, productIds, campaigns);
  return Object.fromEntries([...discounts].map(([productId, promotion]) => [productId, promotion]));
}

async function buildPromotionQuote(config, orderLines, selectedPromotion = null) {
  const campaigns = await loadActiveCampaigns(config);
  const campaignById = new Map(campaigns.map(campaign => [String(campaign.id_mactkm), campaign]));
  const campaignIds = [...campaignById.keys()];
  const [productDiscounts, voucherRows] = await Promise.all([
    loadProductDiscounts(config, orderLines.map(item => item.id_sanpham), campaigns),
    campaignIds.length
      ? customerDatabaseRequest(config, `/rest/v1/kmtheovoucher?${new URLSearchParams({
        select: "id_voucher,id_mactkm,phantram,soluonghientai",
        id_mactkm: quotedIds(campaignIds),
        soluonghientai: "gt.0"
      })}`)
      : []
  ]);

  const originalSubtotal = orderLines.reduce((sum, item) =>
    sum + roundMoney(item.price * item.soluong), 0);
  const lines = orderLines.map(item => {
    const promotion = productDiscounts.get(item.id_sanpham);
    const percent = promotion?.percent || 0;
    const originalLineSubtotal = roundMoney(item.price * item.soluong);
    const discountedUnitPrice = item.price * (1 - percent / 100);
    const discountedLineSubtotal = roundMoney(discountedUnitPrice * item.soluong);
    const productDiscount = Math.max(0, originalLineSubtotal - discountedLineSubtotal);
    return {
      ...item,
      originalSubtotal: originalLineSubtotal,
      subtotal: discountedLineSubtotal,
      productDiscount,
      productDiscountPercent: productDiscount ? percent : null,
      discountedUnitPrice,
      productPromotionId: productDiscount ? promotion.campaignId : null,
      productPromotionName: productDiscount ? promotion.campaignName : null,
      amountAfterProductDiscount: discountedLineSubtotal
    };
  });
  const subtotal = lines.reduce((sum, item) => sum + item.subtotal, 0);
  const productDiscount = lines.reduce((sum, item) => sum + item.productDiscount, 0);
  const promotionOptions = [];

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
        description: `${campaign.tenctkm || campaignId} · giảm ${formatPercent(percent)}%`,
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

  const voucherDiscount = selected?.discount || 0;
  const invoiceDiscount = 0;
  const totalDiscount = productDiscount + voucherDiscount;
  const total = Math.max(0, subtotal - voucherDiscount);

  return {
    lines,
    subtotal,
    originalSubtotal,
    productDiscount,
    invoiceDiscount,
    voucherDiscount,
    totalDiscount,
    total,
    promotionOptions,
    selectedPromotion: selected ? { type: selected.type, id: selected.id } : null,
    selectedPromotionName: selected?.name || null,
    promotionCampaignId: null,
    invoicePromotionId: null,
    voucherId: selected?.id || null,
    invoicePromotionName: null
  };
}

module.exports = { buildPromotionQuote, getActiveProductDiscounts };
