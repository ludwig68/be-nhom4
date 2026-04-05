/**
 * =============================================================
 * FILE: backend/src/config/db.js
 * MÔ TẢ: Cấu hình kết nối database MySQL
 * 
 * CÔNG NGHỆ: mysql2/promise (hỗ trợ async/await thay vì callback)
 * 
 * CONNECTION POOL LÀ GÌ?
 * - Thay vì tạo kết nối mới mỗi lần query (chậm), pool tạo sẵn
 *   một nhóm kết nối và tái sử dụng
 * - connectionLimit: 10 → tối đa 10 kết nối đồng thời
 * - waitForConnections: true → nếu pool đầy, request sẽ chờ
 *   thay vì báo lỗi ngay
 * - queueLimit: 0 → số request chờ không giới hạn
 * 
 * TẠI SAO DÙNG POOL THAY VÌ CREATE CONNECTION?
 * - Hiệu suất cao hơn (không cần handshake mỗi lần query)
 * - Quản lý kết nối tự động (tự reconnect khi mất kết nối)
 * - Giới hạn số kết nối đồng thời (tránh quá tải database)
 * =============================================================
 */

// Import module mysql2 phiên bản Promise (hỗ trợ async/await)
// Phiên bản callback là 'mysql2' (không có /promise)
const mysql = require('mysql2/promise');

// Tạo connection pool - nhóm kết nối được quản lý tự động
const pool = mysql.createPool({
  // Địa chỉ máy chủ database (localhost nếu cùng máy)
  host: process.env.DB_HOST,
  
  // Tên đăng nhập database (thường là root trên localhost)
  user: process.env.DB_USER,
  
  // Mật khẩu database (lưu trong .env, không hardcode)
  password: process.env.DB_PASSWORD,
  
  // Cổng kết nối MySQL (mặc định 3306)
  // Number() ép kiểu vì process.env luôn là string
  port: Number(process.env.DB_PORT),
  
  // Tên database cần kết nối
  database: process.env.DB_NAME,
  
  // Nếu pool đã đạt connectionLimit, request mới sẽ chờ
  // thay vì báo lỗi "no connections available"
  waitForConnections: true,
  
  // Số kết nối tối đa trong pool (cùng lúc)
  // Tăng số này nếu có nhiều request đồng thời
  // Nhưng đừng quá cao vì MySQL có giới hạn max_connections
  connectionLimit: 10,
  
  // Số request chờ tối đa khi pool đầy
  // 0 = không giới hạn (chờ mãi)
  queueLimit: 0
});

// Export pool để các service khác import và query
// Ví dụ: const [rows] = await pool.query('SELECT ...', [params])
module.exports = pool;
