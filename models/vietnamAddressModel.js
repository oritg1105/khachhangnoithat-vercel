const API_BASE = "https://provinces.open-api.vn/api/v2";
let provincesPromise;
const wardsByProvince = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function getJson(url, label) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(`Không thể tải ${label} (${response.status}). Vui lòng thử lại.`);
  }
  return payload;
}

export function getVietnamProvinces() {
  if (!provincesPromise) {
    provincesPromise = getJson(`${API_BASE}/p/?depth=1`, "danh sách tỉnh/thành")
      .catch(error => {
        provincesPromise = null;
        throw error;
      });
  }
  return provincesPromise;
}

export function getVietnamWards(provinceCode) {
  const code = Number(provinceCode);
  if (!Number.isSafeInteger(code) || code < 1) {
    return Promise.reject(new Error("Mã tỉnh/thành không hợp lệ."));
  }
  if (!wardsByProvince.has(code)) {
    const request = getJson(
      `${API_BASE}/w/?province_code=${encodeURIComponent(code)}`,
      "danh sách phường/xã"
    ).catch(error => {
      wardsByProvince.delete(code);
      throw error;
    });
    wardsByProvince.set(code, request);
  }
  return wardsByProvince.get(code);
}

export async function formatVietnamAddress(address) {
  if (!address) return "";
  const [provinces, wards] = await Promise.all([
    getVietnamProvinces(),
    getVietnamWards(address.tinhthanh)
  ]);
  const province = provinces.find(item => Number(item.code) === Number(address.tinhthanh));
  const ward = wards.find(item => Number(item.code) === Number(address.phuongxa));
  if (!province || !ward) {
    throw new Error("Không thể xác định tên tỉnh/thành hoặc phường/xã của địa chỉ đã lưu.");
  }
  return [address.duong, ward.name, province.name].filter(Boolean).join(", ");
}

export function renderVietnamAddressFields(prefix, address = {}) {
  return `
    <label class="store-field">
      <span>Tỉnh/thành phố</span>
      <select id="${prefix}-province" name="tinhThanh" required>
        <option value="">Đang tải tỉnh/thành...</option>
      </select>
    </label>
    <label class="store-field">
      <span>Phường/xã</span>
      <select id="${prefix}-ward" name="phuongXa" required disabled>
        <option value="">Chọn tỉnh/thành trước</option>
      </select>
    </label>
    <label class="store-field">
      <span>Số nhà, tên đường</span>
      <input name="duong" value="${String(address.duong || "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character])}" maxlength="300" required>
    </label>
    <label class="store-check-row">
      <input name="macDinh" type="checkbox" ${Number(address.macdinh) === 1 ? "checked" : ""}>
      Đặt làm địa chỉ mặc định
    </label>`;
}

export async function initializeVietnamAddressFields(form, address = {}) {
  const provinceSelect = form.elements.tinhThanh;
  const wardSelect = form.elements.phuongXa;
  const message = form.querySelector("[data-address-error]");
  const provinces = await getVietnamProvinces();
  provinceSelect.innerHTML = `<option value="">Chọn tỉnh/thành phố</option>${provinces.map(province =>
    `<option value="${Number(province.code)}">${escapeHtml(province.name)}</option>`
  ).join("")}`;
  if (address.tinhthanh != null) provinceSelect.value = String(address.tinhthanh);

  const loadWards = async (provinceCode, selectedWard = "") => {
    wardSelect.disabled = true;
    wardSelect.innerHTML = `<option value="">Đang tải phường/xã...</option>`;
    const wards = await getVietnamWards(provinceCode);
    if (String(provinceSelect.value) !== String(provinceCode)) return;
    wardSelect.innerHTML = `<option value="">Chọn phường/xã</option>${wards.map(ward =>
      `<option value="${Number(ward.code)}">${escapeHtml(ward.name)}</option>`
    ).join("")}`;
    wardSelect.value = String(selectedWard || "");
    wardSelect.disabled = false;
  };

  if (provinceSelect.value) await loadWards(provinceSelect.value, address.phuongxa);
  provinceSelect.addEventListener("change", async () => {
    message.hidden = true;
    if (!provinceSelect.value) {
      wardSelect.disabled = true;
      wardSelect.innerHTML = `<option value="">Chọn tỉnh/thành trước</option>`;
      return;
    }
    try {
      await loadWards(provinceSelect.value);
    } catch (error) {
      message.textContent = error.message;
      message.hidden = false;
      wardSelect.disabled = true;
    }
  });
  return provinces;
}

export function readVietnamAddressForm(form) {
  const data = new FormData(form);
  const tinhThanh = Number(data.get("tinhThanh"));
  const phuongXa = Number(data.get("phuongXa"));
  const duong = String(data.get("duong") || "").trim();
  if (!Number.isSafeInteger(tinhThanh) || tinhThanh < 1 ||
      !Number.isSafeInteger(phuongXa) || phuongXa < 1 ||
      duong.length < 2 || duong.length > 300) {
    throw new Error("Vui lòng chọn tỉnh/thành, phường/xã và nhập số nhà, tên đường hợp lệ.");
  }
  return { tinhThanh, phuongXa, duong, macDinh: data.has("macDinh") };
}
