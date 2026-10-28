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

function quotedIds(ids) {
  return `in.(${ids.map(id => `"${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

async function buildPromotionQuote(config, orderLines) {
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

  const productPromotions = [];
  const invoicePromotions = [];
  if (campaignIds.length) {
    const activeCampaignFilter = quotedIds(campaignIds);
    const productQuery = new URLSearchParams({
      select: "id_mactkm,phantram,id_sanpham",
      id_mactkm: activeCampaignFilter,
      id_sanpham: quotedIds(productIds)
    });
    const invoiceQuery = new URLSearchParams({
      select: "id_mactkm,muctienkm,phantram",
      id_mactkm: activeCampaignFilter
    });
    const [productRows, invoiceRows] = await Promise.all([
      customerDatabaseRequest(config, `/rest/v1/kmtheosanpham?${productQuery}`),
      customerDatabaseRequest(config, `/rest/v1/kmtheohd?${invoiceQuery}`)
    ]);
    productPromotions.push(...(productRows || []));
    invoicePromotions.push(...(invoiceRows || []));
  }

  const bestProductPromoById = new Map();
  for (const promotion of productPromotions) {
    const campaignId = String(promotion.id_mactkm);
    const campaign = campaignById.get(campaignId);
    const percent = percentValue(promotion.phantram, campaign?.tenctkm || campaignId);
    if (!campaign || percent == null || percent === 0) continue;

    const productId = Number(promotion.id_sanpham);
    const current = bestProductPromoById.get(productId);
    if (!current || percent > current.percent ||
        (percent === current.percent && campaignId < current.id)) {
      bestProductPromoById.set(productId, {
        id: campaignId,
        name: campaign.tenctkm || campaignId,
        percent
      });
    }
  }

  const lines = orderLines.map(item => {
    const subtotal = roundMoney(item.price * item.soluong);
    const promotion = bestProductPromoById.get(item.id_sanpham);
    const productDiscount = promotion ? Math.min(subtotal, roundMoney(subtotal * promotion.percent / 100)) : 0;
    return {
      ...item,
      subtotal,
      productDiscount,
      productPromotionId: productDiscount ? promotion.id : null,
      productPromotionName: productDiscount ? promotion.name : null,
      amountAfterProductDiscount: subtotal - productDiscount
    };
  });
  const productDiscountTotal = lines.reduce((sum, item) => sum + item.productDiscount, 0);
  const afterProductDiscount = lines.reduce((sum, item) => sum + item.amountAfterProductDiscount, 0);

  let bestInvoicePromotion = null;
  for (const promotion of invoicePromotions) {
    const campaignId = String(promotion.id_mactkm);
    const campaign = campaignById.get(campaignId);
    if (!campaign) continue;
    const fixedAmount = positiveMoneyValue(promotion.muctienkm, campaign.tenctkm || campaignId);
    const percent = percentValue(promotion.phantram, campaign.tenctkm || campaignId);
    if (fixedAmount == null && percent == null) continue;

    const fixedDiscount = fixedAmount == null ? 0 : Math.min(afterProductDiscount, roundMoney(fixedAmount));
    const percentDiscount = percent == null
      ? 0
      : Math.min(afterProductDiscount, roundMoney(afterProductDiscount * percent / 100));
    const discount = Math.max(fixedDiscount, percentDiscount);
    if (discount > 0 && (!bestInvoicePromotion || discount > bestInvoicePromotion.discount ||
        (discount === bestInvoicePromotion.discount && campaignId < bestInvoicePromotion.id))) {
      bestInvoicePromotion = {
        id: campaignId,
        name: campaign.tenctkm || campaignId,
        discount
      };
    }
  }

  const invoiceDiscount = bestInvoicePromotion?.discount || 0;
  return {
    lines,
    subtotal: lines.reduce((sum, item) => sum + item.subtotal, 0),
    productDiscount: productDiscountTotal,
    invoiceDiscount,
    totalDiscount: productDiscountTotal + invoiceDiscount,
    total: Math.max(0, afterProductDiscount - invoiceDiscount),
    invoicePromotionId: bestInvoicePromotion?.id || null,
    invoicePromotionName: bestInvoicePromotion?.name || null
  };
}

module.exports = { buildPromotionQuote };
