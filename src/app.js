/**
 * =============================================================
 * FILE: backend/src/app.js
 * MÔ TẢ: Cấu hình chính của ứng dụng Express
 * 
 * NHIỆM VỤ:
 * - Cấu hình CORS (cho phép frontend gọi API từ domain/port khác)
 * - Cấu hình middleware parse JSON body
 * - Định nghĩa route mặc định (trang chủ API)
 * - Gắn các router con vào các prefix tương ứng
 * 
 * LUỒNG REQUEST:
 * Client → CORS middleware → JSON parser → Router → Controller → Service → DB
 * =============================================================
 */

// Import thư viện Express (framework web cho Node.js)
const express = require('express');
// Import middleware CORS (Cross-Origin Resource Sharing)
// Cho phép frontend (port khác) gọi API backend
const cors = require('cors');

// Import 4 router con, mỗi router quản lý 1 nhóm API liên quan
const authRoutes = require('./routes/auth.routes');       // Đăng ký, đăng nhập, quên mật khẩu
const branchRoutes = require('./routes/branch.routes');   // Danh sách chi nhánh
const roomRoutes = require('./routes/room.routes');       // Quản lý phòng
const bookingRoutes = require('./routes/booking.routes'); // Đặt phòng
const feedbackRoutes = require('./routes/feedback.routes'); // Đánh giá

// Khởi tạo ứng dụng Express
const app = express();

// =============================================================
// CẤU HÌNH MIDDLEWARE TOÀN CỤC
// =============================================================

// Cấu hình CORS: cho phép tất cả origin gọi API
// origin: '*' nghĩa là chấp nhận mọi domain/port (chỉ nên dùng khi dev)
// Production: nên thay '*' bằng URL frontend cụ thể, vd: 'http://localhost:5173'
app.use(cors({ origin: '*' }));

// Middleware parse request body dạng JSON
// Khi client gửi POST/PUT với header 'Content-Type: application/json'
// → req.body sẽ chứa object JS đã parse sẵn
app.use(express.json());

// =============================================================
// ROUTE MẶC ĐỊNH (trang chủ API)
// =============================================================
// Khi truy cập http://localhost:3000/ → trả về danh sách endpoint
// Mục đích: kiểm tra server có đang chạy không, biết được API nào có sẵn
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Auth API local đang chạy',
    data: {
      endpoints: [
        // Auth endpoints
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/forgot-password/request',
        'POST /api/auth/forgot-password/reset',
        'POST /api/auth/change-password',
        'GET /api/auth/me',
        'PUT /api/auth/profile',
        // Branch endpoints
        'GET /api/branches',
        'GET /api/branches/:id',
        // Room endpoints
        'GET /api/rooms',
        'GET /api/rooms/meta',
        'GET /api/rooms/:id',
        'POST /api/rooms',
        'PUT /api/rooms/:id',
        'DELETE /api/rooms/:id',
        // Booking endpoints
        'GET /api/bookings/available-rooms',
        'GET /api/bookings/services',
        'POST /api/bookings/quote',
        'POST /api/bookings',
        'GET /api/bookings/my-bookings',
        'GET /api/bookings/:id',
        'POST /api/bookings/:id/confirm',
        'POST /api/bookings/:id/cancel',
        'POST /api/bookings/:id/check-in',
        'POST /api/bookings/:id/check-out',
        // Feedback endpoints
        'POST /api/feedbacks',
        'GET /api/feedbacks/my-feedbacks',
        'GET /api/feedbacks/eligible',
        'GET /api/feedbacks/:id',
        'PUT /api/feedbacks/:id',
        'DELETE /api/feedbacks/:id'
      ]
    }
  });
});

// =============================================================
// GẮN CÁC ROUTER CON VÀO PREFIX
// =============================================================
// app.use(prefix, router) → tất cả route trong router sẽ có prefix này
// Ví dụ: authRoutes có route '/login' → thành '/api/auth/login'

// Tất cả API liên quan đến tài khoản → prefix /api/auth
app.use('/api/auth', authRoutes);

// Tất cả API liên quan đến chi nhánh → prefix /api/branches
app.use('/api/branches', branchRoutes);

// Tất cả API liên quan đến phòng → prefix /api/rooms
app.use('/api/rooms', roomRoutes);

// Tất cả API liên quan đến đặt phòng → prefix /api/bookings
app.use('/api/bookings', bookingRoutes);

// Tất cả API liên quan đến đánh giá → prefix /api/feedbacks
app.use('/api/feedbacks', feedbackRoutes);

// Xuất đối tượng app để server.js có thể import và khởi động server
module.exports = app;
