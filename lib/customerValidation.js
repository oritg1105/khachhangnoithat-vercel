function normalizeCustomerName(value) {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120 ||
      !/^\p{L}[\p{L}\p{M}]*(?:[ '’-]\p{L}[\p{L}\p{M}]*)*$/u.test(name)) {
    return null;
  }
  return name;
}

function normalizeVietnamesePhone(value) {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("+84")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("84")) phone = `0${phone.slice(2)}`;
  return /^0(?:(?:3|5|7|8|9)\d{8}|2\d{8,9})$/.test(phone) ? phone : null;
}

module.exports = { normalizeCustomerName, normalizeVietnamesePhone };
