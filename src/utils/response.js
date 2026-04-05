/**
 * =============================================================
 * FILE: backend/src/utils/response.js
 * MÔ TẢ: Tiện ích tạo response JSON chuẩn cho tất cả API
 * 
 * MỤC ĐÍCH:
 * - Đảm bảo tất cả API trả về cùng 1 định dạng JSON
 * - Frontend chỉ cần parse 1 kiểu response duy nhất
 * - Dễ maintain: thay đổi format thì sửa 1 chỗ
 * 
 * ĐỊNH DẠNG RESPONSE THÀNH CÔNG:
 * {
 *   "success": true,
 *   "message": "Lấy danh sách thành công",
 *   "data": { ... }
 * }
 * 
 * ĐỊNH DẠNG RESPONSE LỖI:
 * {
 *   "success": false,
 *   "message": "Dữ liệu không hợp lệ",
 *   "errors": ["username tối thiểu 3 ký tự", ...]
 * }
 * =============================================================
 */

/**
 * Tạo response JSON cho trường hợp THÀNH CÔNG
 * 
 * @param {object} res - Express response object
 * @param {string} message - Thông báo thành công
 * @param {*} data - Dữ liệu trả về (object, array, null)
 * @param {number} status - HTTP status code (mặc định 200)
 * @returns {object} Express response
 * 
 * Ví dụ:
 *   successResponse(res, 'Đăng ký thành công', { userId: 'abc' }, 201)
 *   → { success: true, message: 'Đăng ký thành công', data: { userId: 'abc' } }
 */
const successResponse = (res, message, data = null, status = 200) => {
  return res.status(status).json({
    success: true,   // Cờ báo thành công → frontend kiểm tra res.data.success
    message,         // Thông báo hiển thị cho user
    data             // Dữ liệu thực tế (user, danh sách, ...)
  });
};

/**
 * Tạo response JSON cho trường hợp LỖI
 * 
 * @param {object} res - Express response object
 * @param {string} message - Thông báo lỗi chung
 * @param {string[]} errors - Mảng chi tiết lỗi (từ validator, DB, ...)
 * @param {number} status - HTTP status code (mặc định 400)
 * @returns {object} Express response
 * 
 * HTTP Status codes thường dùng:
 * - 400: Bad Request (dữ liệu đầu vào sai)
 * - 401: Unauthorized (chưa đăng nhập / token sai)
 * - 403: Forbidden (không có quyền)
 * - 404: Not Found (không tìm thấy tài nguyên)
 * - 409: Conflict (trùng lặp, vd: username đã tồn tại)
 * - 500: Internal Server Error (lỗi server)
 * 
 * Ví dụ:
 *   errorResponse(res, 'Đăng ký thất bại', ['Username đã tồn tại'], 409)
 *   → { success: false, message: 'Đăng ký thất bại', errors: ['Username đã tồn tại'] }
 */
const errorResponse = (res, message, errors = [], status = 400) => {
  return res.status(status).json({
    success: false,  // Cờ báo lỗi
    message,         // Thông báo lỗi chung
    errors           // Chi tiết từng lỗi (dùng để hiển thị dưới form)
  });
};

module.exports = {
  successResponse,
  errorResponse
};
