const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { signAccessToken } = require('../utils/jwt');

const USER_ROLE_ID = 3;

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
    [username]
  );

  return rows[0] || null;
};

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

const register = async (payload) => {
  const { username, password, fullName, email, phone, address } = payload;

  const existingUsername = await getUserByUsername(username);
  if (existingUsername) {
    throw {
      status: 409,
      message: 'Username đã tồn tại',
      errors: ['username already exists']
    };
  }

  const existingEmail = await getUserByEmail(email);
  if (existingEmail) {
    throw {
      status: 409,
      message: 'Email đã tồn tại',
      errors: ['email already exists']
    };
  }

  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.query(
    `
      INSERT INTO users
      (user_id, username, password, full_name, email, phone, address, role_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      username.trim(),
      hashedPassword,
      fullName.trim(),
      email.trim(),
      phone || null,
      address || null,
      USER_ROLE_ID,
      1
    ]
  );

  const user = await getUserById(userId);

  return user;
};

const login = async (payload) => {
  const { username, password } = payload;

  const user = await getUserByUsername(username);

  if (!user) {
    throw {
      status: 401,
      message: 'Sai tài khoản hoặc mật khẩu',
      errors: ['invalid credentials']
    };
  }

  if (!user.is_active) {
    throw {
      status: 403,
      message: 'Tài khoản đã bị khóa',
      errors: ['account inactive']
    };
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw {
      status: 401,
      message: 'Sai tài khoản hoặc mật khẩu',
      errors: ['invalid credentials']
    };
  }

  const token = signAccessToken({
    userId: user.user_id,
    username: user.username,
    roleId: user.role_id,
    roleName: user.role_name
  });

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

const logout = async () => {
  return {
    message: 'Đăng xuất thành công'
  };
};

const forgotPasswordRequest = async ({ email }) => {
  const user = await getUserByEmail(email);

  if (!user) {
    throw {
      status: 404,
      message: 'Không tìm thấy tài khoản với email này',
      errors: ['email not found']
    };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresMinutes = Number(process.env.FORGOT_PASSWORD_EXPIRES_MINUTES || 15);

  await pool.query(`DELETE FROM forgot_pass WHERE id_user = ?`, [user.user_id]);

  await pool.query(
    `
      INSERT INTO forgot_pass (id_user, create_at, expired_at, code_confirm)
      VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)
    `,
    [user.user_id, expiresMinutes, code]
  );

  const [rows] = await pool.query(
    `
      SELECT id_user, create_at, expired_at, code_confirm
      FROM forgot_pass
      WHERE id_user = ?
      ORDER BY create_at DESC
      LIMIT 1
    `,
    [user.user_id]
  );

  return {
    email: user.email,
    code_confirm: code,
    expired_at: rows[0]?.expired_at || null,
    note: 'Local test: tạm thời trả code về response để test. Deploy thật thì thay bằng gửi email.'
  };
};

const forgotPasswordReset = async ({ email, code, newPassword }) => {
  const user = await getUserByEmail(email);

  if (!user) {
    throw {
      status: 404,
      message: 'Không tìm thấy tài khoản với email này',
      errors: ['email not found']
    };
  }

  const [rows] = await pool.query(
    `
      SELECT *
      FROM forgot_pass
      WHERE id_user = ?
        AND code_confirm = ?
        AND expired_at >= NOW()
      ORDER BY create_at DESC
      LIMIT 1
    `,
    [user.user_id, String(code)]
  );

  const forgotRow = rows[0];

  if (!forgotRow) {
    throw {
      status: 400,
      message: 'Mã xác nhận không đúng hoặc đã hết hạn',
      errors: ['invalid or expired code']
    };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await pool.query(
    `UPDATE users SET password = ? WHERE user_id = ?`,
    [hashedPassword, user.user_id]
  );

  await pool.query(`DELETE FROM forgot_pass WHERE id_user = ?`, [user.user_id]);

  return {
    user_id: user.user_id,
    email: user.email
  };
};

const changePassword = async ({ userId, oldPassword, newPassword }) => {
  const [rows] = await pool.query(
    `
      SELECT user_id, password
      FROM users
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  const user = rows[0];

  if (!user) {
    throw {
      status: 404,
      message: 'Không tìm thấy người dùng',
      errors: ['user not found']
    };
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);

  if (!isMatch) {
    throw {
      status: 400,
      message: 'Mật khẩu cũ không đúng',
      errors: ['old password incorrect']
    };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await pool.query(
    `UPDATE users SET password = ? WHERE user_id = ?`,
    [hashedPassword, userId]
  );

  return {
    user_id: userId
  };
};

module.exports = {
  register,
  login,
  logout,
  forgotPasswordRequest,
  forgotPasswordReset,
  changePassword,
  getUserById
};