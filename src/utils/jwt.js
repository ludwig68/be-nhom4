/**
 * =============================================================
 * FILE: backend/src/utils/jwt.js
 * MÔ TẢ: Tiện ích tạo và xác thực JWT (JSON Web Token)
 * 
 * JWT LÀ GÌ?
 * - Là một chuỗi mã hóa chứa thông tin user (userId, role, ...)
 * - Dùng để xác thực user mà không cần session trên server
 * - Stateless: server không lưu trạng thái đăng nhập
 * 
 * CẤU TRÚC JWT:
 * Header.Payload.Signature
 * - Header: thuật toán ký (HS256)
 * - Payload: dữ liệu user (userId, username, roleId)
 * - Signature: chữ ký dùng JWT_SECRET để xác thực
 * 
 * LUỒNG HOẠT ĐỘNG:
 * 1. User login → server tạo JWT → gửi về client
 * 2. Client lưu JWT vào localStorage
 * 3. Mỗi request sau, client gửi JWT trong header Authorization
 * 4. Server verify JWT → lấy thông tin user từ payload
 * =============================================================
 */

// Import thư viện jsonwebtoken (tạo/verify JWT)
const jwt = require('jsonwebtoken');

/**
 * Tạo JWT token (Access Token) cho user sau khi đăng nhập thành công
 * 
 * @param {object} payload - Thông tin user cần nhúng vào token
 *   Ví dụ: { userId: 'abc', username: 'test', roleId: 3, roleName: 'USER' }
 * @returns {string} Chuỗi JWT token
 * 
 * Lưu ý:
 * - expiresIn: thời hạn token (mặc định 7 ngày từ .env)
 * - JWT_SECRET: khóa bí mật để ký token (lưu trong .env)
 * - Payload KHÔNG nên chứa thông tin nhạy cảm (password, ...)
 *   vì payload chỉ được base64 encode, không phải encrypt
 */
const signAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    // Thời hạn token: mặc định 7 ngày
    // Có thể override bằng biến JWT_EXPIRES_IN trong .env
    // Định dạng: '1h', '7d', '30d', ...
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

/**
 * Xác thực JWT token từ client gửi lên
 * 
 * @param {string} token - Chuỗi JWT token cần verify
 * @returns {object} Payload đã giải mã (userId, username, roleId, ...)
 * @throws {Error} Nếu token sai, hết hạn, hoặc bị giả mạo
 * 
 * Luồng hoạt động:
 * 1. Client gửi token trong header: Authorization: Bearer <token>
 * 2. auth.middleware.js cắt lấy token → gọi hàm này
 * 3. Nếu verify thành công → trả payload → gán vào req.user
 * 4. Nếu verify thất bại → throw Error → middleware trả 401
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = {
  signAccessToken,    // Tạo token
  verifyAccessToken   // Kiểm tra token
};
