const { customerDatabaseRequest, getCustomerPublicConfig } = require("../lib/customerSession.js");

const TABLES = [
  ["SANPHAM", "sanpham?select=id_sanpham,tensanpham,dongia,soluong,id_kieudang,id_mago,hinhanh,mota,trangthai"],
  ["LOAISP", "loaisp?select=id_loaisp,tenloai,trangthai"],
  ["KIEUDANG", "kieudang?select=id_kieudang,id_loaisp,tenkieudang,trangthai"],
  ["LOAIGO", "loaigo?select=id_mago,tengo,trangthai"]
];

const CATALOG_CACHE_TTL_MS = 30_000;
let catalogCache;
let catalogCacheExpiresAt = 0;
let catalogRequest;

async function loadCatalog(config) {
  if (catalogCache && Date.now() < catalogCacheExpiresAt) return catalogCache;
  if (catalogRequest) return catalogRequest;

  catalogRequest = Promise.all(TABLES.map(async ([name, endpoint]) => [
    name,
    await customerDatabaseRequest(config, `/rest/v1/${endpoint}`)
  ])).then(entries => {
    catalogCache = Object.fromEntries(entries);
    catalogCacheExpiresAt = Date.now() + CATALOG_CACHE_TTL_MS;
    return catalogCache;
  }).finally(() => {
    catalogRequest = null;
  });

  return catalogRequest;
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const config = getCustomerPublicConfig();
    const data = await loadCatalog(config);
    response.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json({ data });
  } catch (error) {
    console.error("Customer storefront catalog request failed:", error.message);
    return response.status(error.status || 500).json({ error: error.message });
  }
};
