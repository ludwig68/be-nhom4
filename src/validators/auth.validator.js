/**
 * =============================================================
 * FILE: backend/src/validators/auth.validator.js
 * MÔ TẢ: Validate dữ liệu đầu vào cho các API auth
 * 
 * TẠI SAO CẦN VALIDATE?
 * - Bảo vệ database khỏi dữ liệu sai/không hợp lệ
 * - Bảo vệ khỏi SQL injection, XSS attack
 * - Trả lỗi rõ ràng cho frontend trước khi xử lý
 * - Giảm tải cho server (không cần query DB nếu dữ liệu sai)
 * 
 * LUỒNG HOẠT ĐỘNG:
 * 1. Controller nhận req.body từ client
 * 2. Gọi hàm validate tương ứng
 * 3. Nếu có lỗi → trả errorResponse 400 ngay
 * 4. Nếu không lỗi → gọi service xử lý
 * =============================================================
 */

/**
 * Kiểm tra xem một chuỗi có phải là email hợp lệ không
 * 
 * @param {string} value - Chuỗi cần kiểm tra
 * @returns {boolean} true nếu đúng format email
 * 
 * Regex giải thích:
 * - ^[^\s@]+  : Bắt đầu bằng 1+ ký tự không phải space/@
 * - @         : Có ký tự @
 * - [^\s@]+   : 1+ ký tự không phải space/@ (tên domain)
 * - \.        : Có dấu chấm
 * - [^\s@]+$  : 1+ ký tự không phải space/@ (đuôi domain)
 * 
 * Ví dụ: test@gmail.com ✓, @gmail.com ✗, test@ ✗
 */
const isEmail = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

/**
 * Validate dữ liệu đăng ký tài khoản
 * 
 * @param {object} body - req.body từ client
 * @returns {string[]} Mảng thông báo lỗi (rỗng = hợp lệ)
 * 
 * Các trường kiểm tra:
 * - username: tối thiểu 3 ký tự
 * - password: tối thiểu 6 ký tự
 * - fullName: tối thiểu 2 ký tự
 * - email: đúng format email
 * - phone: 9-15 số (nếu có cung cấp)
 */
const validateRegister = (body) => {
  const errors = [];
  const { username, password, fullName, email, phone } = body;

  // Kiểm tra username
  if (!username || username.trim().length < 3) {
    errors.push('username tối thiểu 3 ký tự');
  }

  // Kiểm tra password
  if (!password || password.length < 6) {
    errors.push('password tối thiểu 6 ký tự');
  }

  // Kiểm tra họ tên
  if (!fullName || fullName.trim().length < 2) {
    errors.push('fullName tối thiểu 2 ký tự');
  }

  // Kiểm tra email
  if (!email || !isEmail(email)) {
    errors.push('email không hợp lệ');
  }

  // Kiểm tra số điện thoại (nếu có)
  // ^[0-9]{9,15}$ : chỉ chứa số, độ dài 9-15
  if (phone && !/^[0-9]{9,15}$/.test(phone)) {
    errors.push('phone không hợp lệ');
  }

  return errors;
};

/**
 * Validate dữ liệu đăng nhập
 * 
 * @param {object} body - req.body từ client
 * @returns {string[]} Mảng thông báo lỗi
 * 
 * Chỉ kiểm tra username và password có tồn tại
 * Không kiểm tra độ dài ở đây vì service sẽ xử lý
 */
const validateLogin = (body) => {
  const errors = [];
  const { username, password } = body;

  if (!username || username.trim() === '') {
    errors.push('username là bắt buộc');
  }

  if (!password || password.trim() === '') {
    errors.push('password là bắt buộc');
  }

  return errors;
};

/**
 * Validate yêu cầu quên mật khẩu (gửi OTP)
 * 
 * @param {object} body - req.body từ client
 * @returns {string[]} Mảng thông báo lỗi
 * 
 * Chỉ cần email hợp lệ
 */
const validateForgotPasswordRequest = (body) => {
  const errors = [];
  const { email } = body;

  if (!email || !isEmail(email)) {
    errors.push('email không hợp lệ');
  }

  return errors;
};

/**
 * Validate đặt lại mật khẩu bằng OTP
 * 
 * @param {object} body - req.body từ client
 * @returns {string[]} Mảng thông báo lỗi
 * 
 * Kiểm tra:
 * - email hợp lệ
 * - mã OTP không trống
 * - mật khẩu mới tối thiểu 6 ký tự
 */
const validateForgotPasswordReset = (body) => {
  const errors = [];
  const { email, code, newPassword } = body;

  if (!email || !isEmail(email)) {
    errors.push('email không hợp lệ');
  }

  if (!code || String(code).trim() === '') {
    errors.push('code là bắt buộc');
  }

  if (!newPassword || newPassword.length < 6) {
    errors.push('newPassword tối thiểu 6 ký tự');
  }

  return errors;
};

/**
 * Validate đổi mật khẩu (khi đã đăng nhập)
 * 
 * @param {object} body - req.body từ client
 * @returns {string[]} Mảng thông báo lỗi
 * 
 * Kiểm tra:
 * - oldPassword không trống
 * - newPassword tối thiểu 6 ký tự
 * - newPassword khác oldPassword
 */
const validateChangePassword = (body) => {
  const errors = [];
  const { oldPassword, newPassword } = body;

  if (!oldPassword || oldPassword.trim() === '') {
    errors.push('oldPassword là bắt buộc');
  }

  if (!newPassword || newPassword.length < 6) {
    errors.push('newPassword tối thiểu 6 ký tự');
  }

  // Không cho phép đặt mật khẩu mới trùng mật khẩu cũ
  if (oldPassword && newPassword && oldPassword === newPassword) {
    errors.push('Mật khẩu mới không được trùng mật khẩu cũ');
  }

  return errors;
};

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPasswordRequest,
  validateForgotPasswordReset,
  validateChangePassword
};
