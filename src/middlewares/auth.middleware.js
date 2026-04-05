/**
 * =============================================================
 * FILE: backend/src/middlewares/auth.middleware.js
 * MÔ TẢ: Middleware xác thực JWT token
 * 
 * MIDDLEWARE LÀ GÌ?
 * - Là hàm chạy TRƯỚC controller, xử lý request trước khi vào logic chính
 * - Có thể chặn request (trả lỗi) hoặc cho qua (gọi next())
 * - Dùng để: xác thực, phân quyền, logging, validation, ...
 * 
 * LUỒNG HOẠT ĐỘNG:
 * 1. Client gửi request với header: Authorization: Bearer <token>
 * 2. Middleware cắt lấy token từ header
 * 3. Verify token bằng jwt.verify()
 * 4. Nếu hợp lệ → gán thông tin user vào req.user → cho qua (next())
 * 5. Nếu không hợp lệ → trả lỗi 401 Unauthorized
 * 
 * CÁCH DÙNG:
 *   router.get('/me', authMiddleware, authController.me);
 *   → authMiddleware chạy trước → nếu token hợp lệ mới tới controller
 * =============================================================
 */

// Import hàm tạo response lỗi chuẩn
const { errorResponse } = require('../utils/response');
// Import hàm verify JWT token
const { verifyAccessToken } = require('../utils/jwt');

/**
 * Middleware xác thực JWT token
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Hàm gọi để chuyển sang middleware/controller tiếp theo
 * 
 * LUỒNG XỬ LÝ:
 * 1. Kiểm tra header Authorization có tồn tại và đúng format 'Bearer <token>'
 * 2. Cắt lấy token (phần sau 'Bearer ')
 * 3. Verify token → lấy payload (userId, username, roleId, roleName)
 * 4. Gán payload vào req.user → controller sau có thể dùng req.user.userId
 * 5. Nếu token sai/hết hạn → trả lỗi 401
 * 
 * Ví dụ:
 *   Request header: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Sau middleware: req.user = { userId: 'abc', username: 'test', roleId: 3, roleName: 'USER' }
 */
const authMiddleware = (req, res, next) => {
  // Lấy header Authorization từ request
  const authHeader = req.headers.authorization;

  // Kiểm tra header có tồn tại và bắt đầu bằng 'Bearer '
  // Format chuẩn: 'Bearer <token>'
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(
      res,
      'Bạn chưa đăng nhập',
      ['Missing access token'],
      401 // 401 Unauthorized
    );
  }

  // Cắt lấy token: 'Bearer eyJhbG...' → 'eyJhbG...'
  const token = authHeader.split(' ')[1];

  // Thử verify token
  try {
    // jwt.verify() sẽ:
    // - Kiểm tra chữ ký (signature) bằng JWT_SECRET
    // - Kiểm tra hạn sử dụng (expiresIn)
    // - Giải mã payload → trả về object
    const decoded = verifyAccessToken(token);
    
    // Gán thông tin user đã giải mã vào req.user
    // Controller sau có thể truy cập: req.user.userId, req.user.roleId, ...
    req.user = decoded;
    
    // Cho request đi tiếp sang controller
    next();
  } catch (error) {
    // Lỗi có thể là:
    // - TokenExpiredError: token hết hạn
    // - JsonWebTokenError: token sai format hoặc chữ ký sai
    // - NotBeforeError: token chưa đến thời gian hiệu lực
    return errorResponse(
      res,
      'Token không hợp lệ hoặc đã hết hạn',
      [error.message], // Chi tiết lỗi cụ thể
      401 // 401 Unauthorized
    );
  }
};

module.exports = authMiddleware;
