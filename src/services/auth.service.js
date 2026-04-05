/**
 * =============================================================
 * FILE: backend/src/services/auth.service.js
 * MÔ TẢ: Xử lý logic nghiệp vụ cho module xác thực (Auth)
 * 
 * NHIỆM VỤ:
 * - Tương tác trực tiếp với database (MySQL)
 * - Chứa business logic (kiểm tra trùng, mã hóa, tạo token, ...)
 * - KHÔNG xử lý HTTP request/response (đó là việc của controller)
 * 
 * LUỒNG DATA:
 * Controller → Service → Database → Service → Controller
 * 
 * CÁC CHỨC NĂNG:
 * 1. register: Đăng ký tài khoản mới
 * 2. login: Đăng nhập, tạo JWT token
 * 3. logout: Đăng xuất (stateless, chỉ trả message)
 * 4. forgotPasswordRequest: Tạo mã OTP quên mật khẩu
 * 5. forgotPasswordReset: Đặt lại mật khẩu bằng OTP
 * 6. changePassword: Đổi mật khẩu (khi đã login)
 * 7. updateProfile: Cập nhật thông tin cá nhân
 * 8. getUserById: Lấy thông tin user theo ID
 * =============================================================
 */

// Thư viện bcrypt: mã hóa mật khẩu (hash 1 chiều, không thể giải ngược)
const bcrypt = require('bcryptjs');

// Thư viện uuid: tạo ID ngẫu nhiên duy nhất cho mỗi user
// UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
const { v4: uuidv4 } = require('uuid');

// Pool kết nối database
const pool = require('../config/db');

// Hàm tạo JWT token
const { signAccessToken } = require('../utils/jwt');

/**
 * ID của role "USER" (khách hàng bình thường)
 * 
 * Bảng roles trong DB:
 * - role_id = 1: ADMIN (quản trị viên)
 * - role_id = 2: STAFF (nhân viên)
 * - role_id = 3: USER (khách hàng) ← mặc định khi đăng ký
 * 
 * Tại sao hardcode? Vì role USER luôn là 3 trong seed data
 * Production: nên dùng constant hoặc lấy từ DB
 */
const USER_ROLE_ID = 3;

// =============================================================
// CÁC HÀM TRỢ GIÚP (helper functions)
// =============================================================

/**
 * Tìm user theo username (tên đăng nhập)
 * 
 * @param {string} username - Tên đăng nhập cần tìm
 * @returns {object|null} Thông tin user hoặc null nếu không tìm thấy
 * 
 * SQL giải thích:
 * - LEFT JOIN roles: lấy cả user không có role (role_id = NULL)
 * - WHERE username = ?: tìm chính xác username (? là placeholder chống SQL injection)
 * - LIMIT 1: chỉ lấy 1 kết quả (username là UNIQUE)
 * 
 * Placeholder (?) là gì?
 * - Thay vì nối chuỗi: 'WHERE username = ' + username (DỄ BỊ SQL INJECTION)
 * - Dùng placeholder: 'WHERE username = ?' và truyền [username] riêng
 * - mysql2 tự động escape ký tự đặc biệt → an toàn
 */
const getUserByUsername = async (username) => {
  const [rows] = await pool.query(
    `
      SELECT u.user_id, u.username, u.password, u.full_name, u.email, u.phone, u.address,
             u.role_id, u.is_active, r.role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.username = ?
      LIMIT 1
    `,
    [username] // Giá trị thay thế cho dấu ?
  );
  // rows[0] = object user đầu tiên, hoặc undefined nếu không có
  return rows[0] || null;
};

/**
 * Tìm user theo địa chỉ email
 * 
 * @param {string} email - Email cần tìm
 * @returns {object|null} Thông tin user hoặc null
 * 
 * Dùng để kiểm tra email đã tồn tại chưa khi đăng ký
 * và để tìm user khi quên mật khẩu
 */
const getUserByEmail = async (email) => {
  const [rows] = await pool.query(
    `
      SELECT u.user_id, u.username, u.password, u.full_name, u.email, u.phone, u.address,
             u.role_id, u.is_active, r.role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.email = ?
      LIMIT 1
    `,
    [email]
  );
  return rows[0] || null;
};

/**
 * Lấy thông tin user theo ID (ẩn password)
 * 
 * @param {string} userId - UUID của user
 * @returns {object|null} Thông tin user (không có password) hoặc null
 * 
 * Lưu ý: KHÔNG SELECT password → tránh lộ mật khẩu hash
 * Dùng khi: lấy profile, trả thông tin user sau login, ...
 */
const getUserById = async (userId) => {
  const [rows] = await pool.query(
    `
      SELECT u.user_id, u.username, u.full_name, u.email, u.phone, u.address,
             u.role_id, u.is_active, u.created_at, r.role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
};

// =============================================================
// CÁC HÀM NGHIỆP VỤ CHÍNH (business logic)
// =============================================================

/**
 * Đăng ký tài khoản mới
 * 
 * @param {object} payload - Dữ liệu đăng ký từ client
 * @returns {object} Thông tin user vừa tạo
 * @throws {object} Lỗi nếu username/email đã tồn tại
 * 
 * LUỒNG XỬ LÝ:
 * 1. Kiểm tra username đã tồn tại → báo lỗi 409
 * 2. Kiểm tra email đã tồn tại → báo lỗi 409
 * 3. Tạo UUID ngẫu nhiên cho user_id
 * 4. Mã hóa mật khẩu bằng bcrypt (hash 10 rounds)
 * 5. INSERT vào bảng users với role_id = 3 (USER)
 * 6. Trả về thông tin user vừa tạo
 * 
 * Bcrypt hash là gì?
 * - Biến password '123456' → '$2b$10$abc...' (chuỗi 60 ký tự)
 * - Không thể giải ngược từ hash → password gốc
 * - Khi login: hash(password nhập) so sánh với hash trong DB
 * - Rounds = 10: độ mạnh (càng cao càng chậm nhưng càng bảo mật)
 */
const register = async (payload) => {
  const { username, password, fullName, email, phone, address } = payload;

  // Bước 1: Kiểm tra username đã có ai dùng chưa
  const existingUsername = await getUserByUsername(username);
  if (existingUsername) {
    // 409 Conflict: tài nguyên đã tồn tại
    throw { status: 409, message: 'Username đã tồn tại', errors: ['username already exists'] };
  }

  // Bước 2: Kiểm tra email đã có ai dùng chưa
  const existingEmail = await getUserByEmail(email);
  if (existingEmail) {
    throw { status: 409, message: 'Email đã tồn tại', errors: ['email already exists'] };
  }

  // Bước 3: Tạo ID duy nhất cho user mới
  const userId = uuidv4();
  // Ví dụ: '550e8400-e29b-41d4-a716-446655440000'

  // Bước 4: Mã hóa mật khẩu trước khi lưu vào DB
  // bcrypt.hash() trả về Promise → cần await
  // Round 10 = cân bằng giữa bảo mật và hiệu suất
  const hashedPassword = await bcrypt.hash(password, 10);

  // Bước 5: INSERT user mới vào database
  // Các giá trị NULL/undefined sẽ được mysql2 chuyển thành NULL
  await pool.query(
    `
      INSERT INTO users
      (user_id, username, password, full_name, email, phone, address, role_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,                        // user_id: UUID ngẫu nhiên
      username.trim(),               // username: xóa khoảng trắng đầu/cuối
      hashedPassword,                // password: đã mã hóa
      fullName.trim(),               // full_name
      email.trim(),                  // email
      phone || null,                 // phone: nếu không có → NULL
      address || null,               // address: nếu không có → NULL
      USER_ROLE_ID,                  // role_id: 3 = USER
      1                              // is_active: 1 = tài khoản hoạt động
    ]
  );

  // Bước 6: Trả về thông tin user vừa tạo (không có password)
  return await getUserById(userId);
};

/**
 * Đăng nhập: xác thực username/password và tạo JWT token
 * 
 * @param {object} payload - { username, password }
 * @returns {object} { accessToken, user }
 * @throws {object} Lỗi nếu sai thông tin hoặc tài khoản bị khóa
 * 
 * LUỒNG XỬ LÝ:
 * 1. Tìm user theo username
 * 2. Kiểm tra tài khoản có bị khóa không
 * 3. So sánh password nhập vào với hash trong DB
 * 4. Tạo JWT token chứa thông tin user
 * 5. Trả về token + thông tin user
 * 
 * Bảo mật:
 * - Không phân biệt lỗi "sai username" hay "sai password"
 *   → Tránh hacker đoán username nào có trong hệ thống
 * - is_active = 0 → chặn đăng nhập (tài khoản bị khóa)
 */
const login = async (payload) => {
  const { username, password } = payload;

  // Bước 1: Tìm user theo username
  const user = await getUserByUsername(username);
  if (!user) {
    // Thông báo chung: không tiết lộ username có tồn tại hay không
    throw { status: 401, message: 'Sai tài khoản hoặc mật khẩu', errors: ['invalid credentials'] };
  }

  // Bước 2: Kiểm tra tài khoản có bị khóa không
  if (!user.is_active) {
    throw { status: 403, message: 'Tài khoản đã bị khóa', errors: ['account inactive'] };
  }

  // Bước 3: So sánh password nhập vào với hash trong DB
  // bcrypt.compare(): hash(password nhập) == hash trong DB?
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw { status: 401, message: 'Sai tài khoản hoặc mật khẩu', errors: ['invalid credentials'] };
  }

  // Bước 4: Tạo JWT token
  // Payload chứa thông tin cần thiết, KHÔNG chứa password
  const token = signAccessToken({
    userId: user.user_id,     // ID user
    username: user.username,   // Tên đăng nhập
    roleId: user.role_id,      // ID role (1=ADMIN, 2=STAFF, 3=USER)
    roleName: user.role_name   // Tên role
  });

  // Bước 5: Trả về token + thông tin user (không có password)
  return {
    accessToken: token,
    user: {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role_id: user.role_id,
      role_name: user.role_name
    }
  };
};

/**
 * Đăng xuất
 * 
 * Vì JWT là stateless (server không lưu session),
 * đăng xuất thực chất là XÓA TOKEN Ở CLIENT
 * 
 * Hàm này chỉ trả message, không có logic server-side
 * Frontend sẽ xóa localStorage.removeItem('accessToken')
 */
const logout = async () => {
  return { message: 'Đăng xuất thành công' };
};

/**
 * Yêu cầu quên mật khẩu: tạo mã OTP và lưu vào DB
 * 
 * @param {object} params - { email }
 * @returns {object} Thông tin email + mã OTP (chỉ cho dev/test)
 * @throws {object} Lỗi nếu email không tồn tại
 * 
 * LUỒNG XỬ LÝ:
 * 1. Tìm user theo email
 * 2. Tạo mã OTP 6 chữ số ngẫu nhiên
 * 3. Xóa OTP cũ (nếu có) của user này
 * 4. Lưu OTP mới vào bảng forgot_pass với thời hạn
 * 
 * Production:
 * - KHÔNG trả code_confirm về cho client
 * - Thay vào đó, gọi hàm gửi email/SMS cho user
 * - User nhập mã từ email/SMS để reset password
 * 
 * Dev/Test:
 * - Trả code về để test nhanh (không cần setup email server)
 */
const forgotPasswordRequest = async ({ email }) => {
  // Bước 1: Kiểm tra email có trong hệ thống không
  const user = await getUserByEmail(email);
  if (!user) {
    throw { status: 404, message: 'Không tìm thấy tài khoản với email này', errors: ['email not found'] };
  }

  // Bước 2: Tạo mã OTP 6 chữ số
  // Math.random() * 900000 → số từ 0 đến 899999
  // + 100000 → số từ 100000 đến 999999
  // Math.floor() → làm tròn xuống
  // Ví dụ: 123456
  const code = String(Math.floor(100000 + Math.random() * 900000));
  
  // Thời hạn OTP: mặc định 15 phút
  const expiresMinutes = Number(process.env.FORGOT_PASSWORD_EXPIRES_MINUTES || 15);

  // Bước 3: Xóa OTP cũ của user này (nếu có)
  // Mỗi user chỉ có 1 OTP active tại 1 thời điểm
  await pool.query(`DELETE FROM forgot_pass WHERE id_user = ?`, [user.user_id]);

  // Bước 4: Lưu OTP mới vào DB
  await pool.query(
    `
      INSERT INTO forgot_pass (id_user, create_at, expired_at, code_confirm)
      VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)
    `,
    [user.user_id, expiresMinutes, code]
  );

  // TRẢ MÃ OTP VỀ CHO DEV/TEST
  // Production: xóa dòng code_confirm và gọi hàm sendEmail()
  return {
    email: user.email,
    code_confirm: code,
    note: 'Local test: tạm trả code về để test. Server thật thì sẽ gọi hàm gửi SMS / Email thay vì hiện mã code ra đây'
  };
};

/**
 * Đặt lại mật khẩu bằng mã OTP
 * 
 * @param {object} params - { email, code, newPassword }
 * @returns {object} { user_id, email }
 * @throws {object} Lỗi nếu OTP sai/hết hạn hoặc email không tồn tại
 * 
 * LUỒNG XỬ LÝ:
 * 1. Tìm user theo email
 * 2. Kiểm tra OTP có đúng và còn hạn không
 * 3. Mã hóa mật khẩu mới → UPDATE vào DB
 * 4. Xóa OTP đã sử dụng
 */
const forgotPasswordReset = async ({ email, code, newPassword }) => {
  // Bước 1: Tìm user
  const user = await getUserByEmail(email);
  if (!user) {
    throw { status: 404, message: 'Không tìm thấy tài khoản', errors: ['email not found'] };
  }

  // Bước 2: Kiểm tra OTP
  // - code_confirm = ?: mã OTP có đúng không
  // - expired_at >= NOW(): OTP còn hạn không
  // - ORDER BY create_at DESC: lấy OTP mới nhất
  // - LIMIT 1: chỉ kiểm tra 1 OTP
  const [rows] = await pool.query(
    `SELECT * FROM forgot_pass WHERE id_user = ? AND code_confirm = ? AND expired_at >= NOW() ORDER BY create_at DESC LIMIT 1`,
    [user.user_id, String(code)]
  );

  if (!rows[0]) {
    // Có thể: mã sai, đã hết hạn, hoặc đã được dùng rồi
    throw { status: 400, message: 'Mã xác nhận không đúng hoặc đã hết hạn', errors: ['invalid code'] };
  }

  // Bước 3: Mã hóa mật khẩu mới và cập nhật
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await pool.query(`UPDATE users SET password = ? WHERE user_id = ?`, [hashedPassword, user.user_id]);

  // Bước 4: Xóa OTP đã sử dụng (1 OTP chỉ dùng 1 lần)
  await pool.query(`DELETE FROM forgot_pass WHERE id_user = ?`, [user.user_id]);

  return { user_id: user.user_id, email: user.email };
};

/**
 * Đổi mật khẩu (khi đã đăng nhập)
 * 
 * @param {object} params - { userId, oldPassword, newPassword }
 * @returns {object} { user_id }
 * @throws {object} Lỗi nếu user không tồn tại hoặc oldPassword sai
 * 
 * Khác với forgotPasswordReset:
 * - Cần biết mật khẩu CŨ (bảo mật hơn)
 * - Cần đã đăng nhập (có userId từ token)
 * - Không cần OTP
 */
const changePassword = async ({ userId, oldPassword, newPassword }) => {
  // Bước 1: Lấy thông tin user (cần password hash để so sánh)
  const [rows] = await pool.query(`SELECT user_id, password FROM users WHERE user_id = ? LIMIT 1`, [userId]);
  const user = rows[0];

  if (!user) {
    throw { status: 404, message: 'Không tìm thấy người dùng', errors: ['user not found'] };
  }

  // Bước 2: Xác thực mật khẩu cũ
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw { status: 400, message: 'Mật khẩu cũ không đúng', errors: ['old password incorrect'] };
  }

  // Bước 3: Mã hóa mật khẩu mới và cập nhật
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await pool.query(`UPDATE users SET password = ? WHERE user_id = ?`, [hashedPassword, userId]);

  return { user_id: userId };
};

/**
 * Cập nhật thông tin cá nhân (profile)
 * 
 * @param {string} userId - ID của user đang đăng nhập
 * @param {object} payload - { full_name, email, phone, address }
 * @returns {object} Thông tin user đã cập nhật
 * @throws {object} Lỗi nếu email đã được user khác dùng
 * 
 * LUỒNG XỬ LÝ:
 * 1. Nếu có đổi email → kiểm tra xem email đã có ai dùng chưa
 * 2. UPDATE thông tin vào DB
 * 3. Trả về thông tin user mới
 */
const updateProfile = async (userId, payload) => {
  const { full_name, email, phone, address } = payload;

  // Nếu user đổi email → kiểm tra xem email mới có bị trùng không
  if (email) {
    const existing = await getUserByEmail(email);
    // Nếu tìm thấy user khác có email này (không phải user hiện tại)
    if (existing && existing.user_id !== userId) {
      throw { status: 409, message: 'Email đã được sử dụng bởi tài khoản khác', errors: ['email exists'] };
    }
  }

  // Cập nhật thông tin (NULL nếu không có giá trị)
  await pool.query(
    `UPDATE users SET full_name = ?, email = ?, phone = ?, address = ? WHERE user_id = ?`,
    [full_name || null, email || null, phone || null, address || null, userId]
  );

  // Trả về thông tin user mới nhất
  return await getUserById(userId);
};

module.exports = {
  register,
  login,
  logout,
  forgotPasswordRequest,
  forgotPasswordReset,
  changePassword,
  updateProfile,
  getUserById
};
