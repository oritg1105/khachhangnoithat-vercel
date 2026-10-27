import { initRemoteTable } from "./remoteTableController.js";
import { getCustomers, createCustomerWithAccount, updateCustomer, updateCustomerStatus } from "../models/customersModel.js";
import { isValidEmail, isValidPhone, showAddForm, showEditForm, showConfirmModal, showAlertModal } from "./shared.js";

export function initCustomers(query, rerender) {
  return initRemoteTable("customers", query, rerender, getCustomers, {
    onEdit: row => openEditCustomer(row),
    onLock: row => toggleCustomerLock(row),
    isLocked: row => row.trangThai === 0
  });
}

export function openAddCustomer() {
  showAddForm({
    title: "Thêm khách hàng",
    fields: [
      { name: "tenDangNhap", label: "Tên đăng nhập" },
      { name: "matKhau", label: "Mật khẩu", type: "password" },
      { name: "hoTen", label: "Họ và tên" },
      { name: "SDT", label: "Số điện thoại" },
      { name: "email", label: "Email", type: "email", required: false }
    ],
    onSubmit: data => {
      if (!isValidPhone(data.SDT)) throw new Error("Số điện thoại không hợp lệ.");
      if (data.email && !isValidEmail(data.email)) throw new Error("Email không hợp lệ.");
      return createCustomerWithAccount(
        { hoTen: data.hoTen, SDT: data.SDT, email: data.email },
        { tenDangNhap: data.tenDangNhap, matKhau: data.matKhau, loaiTaiKhoan: "KHACHHANG", trangThai: 1 }
      );
    }
  });
}

export async function openEditCustomer(customer) {
  showEditForm({
    title: "Cập nhật khách hàng",
    fields: [
      { name: "hoTen", label: "Họ và tên" },
      { name: "SDT", label: "Số điện thoại" },
      { name: "email", label: "Email", type: "email", required: false }
    ],
    initialValues: { hoTen: customer.name, SDT: customer.phone, email: customer.email },
    onSubmit: data => {
      if (!isValidPhone(data.SDT)) throw new Error("Số điện thoại không hợp lệ.");
      if (data.email && !isValidEmail(data.email)) throw new Error("Email không hợp lệ.");
      return updateCustomer(customer.rawId, { hoTen: data.hoTen, SDT: data.SDT, email: data.email });
    }
  });
}

export async function toggleCustomerLock(customer) {
  const locked = customer.trangThai === 0;
  const ok = await showConfirmModal(locked ? "Mở khóa khách hàng này?" : "Khóa khách hàng này?");
  if (!ok) return;
  try {
    await updateCustomerStatus(customer.rawId, locked ? 1 : 0);
    document.dispatchEvent(new CustomEvent("data-updated"));
    showAlertModal(locked ? "Đã mở khóa khách hàng." : "Đã khóa khách hàng.", "success");
  } catch (error) {
    showAlertModal(`Không thể cập nhật trạng thái: ${error.message}`, "error");
  }
}
