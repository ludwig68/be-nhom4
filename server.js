/**
 * =============================================================
 * FILE: backend/server.js
 * MÔ TẢ: Entry point chính của ứng dụng backend
 * 
 * LUỒNG HOẠT ĐỘNG:
 * 1. Tải biến môi trường từ file .env
 * 2. Kiểm tra các biến bắt buộc (PORT, DB_HOST, JWT_SECRET, ...)
 * 3. Khởi tạo ứng dụng Express từ file app.js
 * 4. Lắng nghe trên cổng được chỉ định
 * 
 * CẤU TRÚC:
 * - server.js: Khởi động server (chỉ làm nhiệm vụ listen)
 * - app.js: Cấu hình middleware + routes (business logic)
 * 
 * Tại sao tách riêng?
 * - Dễ test unit test (import app mà không cần listen)
 * - Dễ deploy (có thể import app vào serverless function)
 * =============================================================
 */

// Nạp biến môi trường từ file:
// - local: .env hoặc .env.local
// - production/cPanel: .env.production hoặc ENV_FILE được chỉ định
require('./src/utils/load-env')();

// Import các hàm kiểm tra biến môi trường bắt buộc
const { REQUIRED_ENV_KEYS, validateRequiredEnv } = require('./src/utils/env');

// Validate tất cả biến môi trường cần thiết trước khi khởi động server
// Nếu thiếu biến nào → throw Error → process.exit(1) → server không chạy
try {
  validateRequiredEnv(REQUIRED_ENV_KEYS);
} catch (error) {
  // In lỗi ra console để developer biết thiếu biến gì
  console.error(error.message);
  process.exit(1); // Thoát ngay lập tức, không cho server chạy
}

// Import ứng dụng Express đã cấu hình sẵn (routes, middleware, CORS)
const app = require('./src/app');

// Lấy port từ biến môi trường, mặc định 3000 nếu không có
const PORT = process.env.PORT || 3000;
const HOST = process.env.IP || '0.0.0.0';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
});

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

// Khởi động server: lắng nghe kết nối HTTP trên cổng PORT
const server = app.listen(PORT, HOST, () => {
  console.log(`Backend chạy tại ${HOST}:${PORT}`);
});

server.on('error', (error) => {
  console.error('SERVER LISTEN ERROR:', error);
  process.exit(1);
});
