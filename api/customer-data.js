const { customerDatabaseRequest, getCustomerPublicConfig } = require("../lib/customerSession.js");

const TABLES = [
  ["SANPHAM", "sanpham?select=id_sanpham,tensanpham,dongia,soluong,id_kieudang,id_mago,hinhanh,mota,trangthai"],
  ["LOAISP", "loaisp?select=id_loaisp,tenloai,trangthai"],
  ["KIEUDANG", "kieudang?select=id_kieudang,id_loaisp,tenkieudang,trangthai"],
  ["LOAIGO", "loaigo?select=id_mago,tengo,trangthai"]
];

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const config = getCustomerPublicConfig();
    const entries = await Promise.all(TABLES.map(async ([name, endpoint]) => [
      name,
      await customerDatabaseRequest(config, `/rest/v1/${endpoint}`)
    ]));
    return response.status(200).json({ data: Object.fromEntries(entries) });
  } catch (error) {
    console.error("Customer storefront catalog request failed:", error.message);
    return response.status(error.status || 500).json({ error: error.message });
  }
};
