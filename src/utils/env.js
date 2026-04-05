/**
 * =============================================================
 * FILE: backend/src/utils/env.js
 * MÔ TẢ: Tiện ích kiểm tra biến môi trường bắt buộc
 * 
 * MỤC ĐÍCH:
 * - Định nghĩa danh sách biến môi trường BẮT BUỘC phải có
 * - Cung cấp hàm validate để kiểm tra trước khi khởi động server
 * - Fail fast: nếu thiếu biến → báo lỗi ngay, không cho server chạy
 * 
 * TẠI SAO CẦN KIỂM TRA BIẾN MÔI TRƯỜNG?
 * - Tránh lỗi runtime (vd: query DB mà không có DB_HOST)
 * - Giúp developer biết ngay thiếu gì khi clone project mới
 * - Dễ debug hơn là để server crash giữa chừng
 * =============================================================
 */

/**
 * Danh sách các biến môi trường BẮT BUỘC phải có trong file .env
 * 
 * Giải thích từng biến:
 * - PORT: Cổng chạy server (vd: 3000)
 * - DB_HOST: Địa chỉ máy chủ MySQL (vd: localhost)
 * - DB_PORT: Cổng MySQL (vd: 3306)
 * - DB_USER: Username đăng nhập MySQL (vd: root)
 * - DB_PASSWORD: Password đăng nhập MySQL
 * - DB_NAME: Tên database (vd: db_bookroom)
 * - JWT_SECRET: Khóa bí mật để ký/verify JWT token
 * 
 * Lưu ý: JWT_SECRET nên là chuỗi ngẫu nhiên dài, khó đoán
 * Không bao giờ commit JWT_SECRET lên Git
 */
const REQUIRED_ENV_KEYS = [
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET'
];

/**
 * Kiểm tra xem tất cả biến môi trường bắt buộc có tồn tại không
 * 
 * @param {string[]} requiredKeys - Mảng tên biến cần kiểm tra
 * @throws {Error} Nếu có biến nào bị thiếu
 * 
 * Cách hoạt động:
 * 1. Lọc ra các biến trong requiredKeys mà process.env không có
 * 2. Nếu có biến thiếu → tạo Error với danh sách biến thiếu
 * 3. Throw Error → server.js bắt và thoát
 * 
 * Ví dụ usage:
 *   validateRequiredEnv(['DB_HOST', 'DB_USER'])
 *   → Nếu thiếu DB_HOST → Error: "Thiếu biến môi trường bắt buộc: DB_HOST"
 */
const validateRequiredEnv = (requiredKeys = REQUIRED_ENV_KEYS) => {
  // Lọc ra các biến môi trường bị thiếu
  // process.env[key] === undefined → biến không tồn tại trong .env
  // process.env[key] === null → biến tồn tại nhưng giá trị null
  const missing = requiredKeys.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === null;
  });

  // Nếu có biến thiếu → tạo và throw lỗi
  if (missing.length > 0) {
    const error = new Error(`Thiếu biến môi trường bắt buộc: ${missing.join(', ')}`);
    // Gắn thêm thông tin vào error object để debug dễ hơn
    error.missingKeys = missing;
    throw error;
  }
  
  // Nếu không thiếu gì → hàm kết thúc bình thường (không return gì)
};

// Export cả 2 để chỗ khác có thể dùng linh hoạt
module.exports = {
  REQUIRED_ENV_KEYS,    // Danh sách biến bắt buộc
  validateRequiredEnv   // Hàm kiểm tra
};
