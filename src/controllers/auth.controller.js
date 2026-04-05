/**
 * =============================================================
 * FILE: backend/src/controllers/auth.controller.js
 * MÔ TẢ: Controller xử lý HTTP request/response cho module Auth
 * 
 * CONTROLLER LÀ GÌ?
 * - Là lớp giữa HTTP request và business logic (service)
 * - Nhận req (request từ client), gọi service xử lý
 * - Trả res (response JSON) về cho client
 * - KHÔNG chứa logic nghiệp vụ (đó là việc của service)
 * - KHÔNG query database trực tiếp
 * 
 * MÔ HÌNH 3 LỚP (3-tier architecture):
 * Router (định tuyến URL) → Controller (xử lý HTTP) → Service (logic + DB)
 * 
 * CÁC API:
 * - POST /api/auth/register          → Đăng ký
 * - POST /api/auth/login             → Đăng nhập
 * - POST /api/auth/logout            → Đăng xuất
 * - POST /api/auth/forgot-password/request → Gửi OTP quên MK
 * - POST /api/auth/forgot-password/reset   → Đặt lại MK bằng OTP
 * - POST /api/auth/change-password   → Đổi MK (cần login)
 * - GET  /api/auth/me                → Lấy profile (cần login)
 * - PUT  /api/auth/profile           → Cập nhật profile (cần login)
 * =============================================================
 */

// Import service chứa logic nghiệp vụ
const authService = require('../services/auth.service');

// Import hàm tạo response chuẩn (success/error JSON)
const { successResponse, errorResponse } = require('../utils/response');

// Import các hàm validate dữ liệu đầu vào
const {
  validateRegister,
  validateLogin,
  validateForgotPasswordRequest,
  validateForgotPasswordReset,
  validateChangePassword
} = require('../validators/auth.validator');

// =============================================================
// API: ĐĂNG KÝ TÀI KHOẢN
// POST /api/auth/register
// Body: { username, password, fullName, email, phone?, address? }
// =============================================================
const register = async (req, res) => {
  try {
    // Bước 1: Validate dữ liệu đầu vào
    // Nếu sai format → trả lỗi 400 ngay, không cần gọi DB
    const errors = validateRegister(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    // Bước 2: Gọi service xử lý (kiểm tra trùng, hash password, INSERT DB)
    const user = await authService.register(req.body);
    
    // Bước 3: Trả về kết quả thành công
    // 201 Created: HTTP status cho resource mới được tạo
    return successResponse(res, 'Đăng ký tài khoản thành công', user, 201);
  } catch (error) {
    // Bắt lỗi từ service (vd: username đã tồn tại)
    // error.status: HTTP status code do service throw
    // error.errors: chi tiết lỗi
    return errorResponse(res, error.message || 'Lỗi đăng ký', error.errors || [], error.status || 500);
  }
};

// =============================================================
// API: ĐĂNG NHẬP
// POST /api/auth/login
// Body: { username, password }
// Response: { accessToken, user }
// =============================================================
const login = async (req, res) => {
  try {
    // Bước 1: Validate cơ bản (username/password không trống)
    const errors = validateLogin(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    // Bước 2: Gọi service xác thực và tạo token
    const result = await authService.login(req.body);
    
    // Bước 3: Trả về token + thông tin user
    return successResponse(res, 'Đăng nhập thành công', result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đăng nhập', error.errors || [], error.status || 500);
  }
};

// =============================================================
// API: ĐĂNG XUẤT
// POST /api/auth/logout
// Không cần body, không cần token
// =============================================================
const logout = async (req, res) => {
  try {
    const result = await authService.logout();
    return successResponse(res, result.message, null);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đăng xuất', error.errors || [], error.status || 500);
  }
};

// =============================================================
// API: YÊU CẦU QUÊN MẬT KHẨU (GỬI OTP)
// POST /api/auth/forgot-password/request
// Body: { email }
// =============================================================
const forgotPasswordRequest = async (req, res) => {
  try {
    const errors = validateForgotPasswordRequest(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const result = await authService.forgotPasswordRequest(req.body);
    return successResponse(res, 'Tạo mã xác nhận thành công', result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi quên mật khẩu', error.errors || [], error.status || 500);
  }
};

// =============================================================
// API: ĐẶT LẠI MẬT KHẨU BẰNG OTP
// POST /api/auth/forgot-password/reset
// Body: { email, code, newPassword }
// =============================================================
const forgotPasswordReset = async (req, res) => {
  try {
    const errors = validateForgotPasswordReset(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const result = await authService.forgotPasswordReset(req.body);
    return successResponse(res, 'Đặt lại mật khẩu thành công', result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đặt lại mật khẩu', error.errors || [], error.status || 500);
  }
};

// =============================================================
// API: ĐỔI MẬT KHẨU (khi đã đăng nhập)
// POST /api/auth/change-password
// Cần token trong header (authMiddleware)
// Body: { oldPassword, newPassword }
// =============================================================
const changePassword = async (req, res) => {
  try {
    const errors = validateChangePassword(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    // req.user được authMiddleware gán từ JWT token
    // req.user.userId = ID của user đang đăng nhập
    const result = await authService.changePassword({
      userId: req.user.userId,
      oldPassword: req.body.oldPassword,
      newPassword: req.body.newPassword
    });

    return successResponse(res, 'Đổi mật khẩu thành công', result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đổi mật khẩu', error.errors || [], error.status || 500);
  }
};

// =============================================================
// API: LẤY THÔNG TIN USER HIỆN TẠI
// GET /api/auth/me
// Cần token trong header (authMiddleware)
// =============================================================
const me = async (req, res) => {
  try {
    // req.user.userId lấy từ JWT token (authMiddleware đã gán)
    const user = await authService.getUserById(req.user.userId);
    return successResponse(res, 'Lấy thông tin người dùng thành công', user);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy thông tin người dùng', error.errors || [], error.status || 500);
  }
};

// =============================================================
// API: CẬP NHẬT THÔNG TIN CÁ NHÂN
// PUT /api/auth/profile
// Cần token trong header (authMiddleware)
// Body: { full_name?, email?, phone?, address? }
// =============================================================
const updateProfile = async (req, res) => {
  try {
    const user = await authService.updateProfile(req.user.userId, req.body);
    return successResponse(res, 'Cập nhật thông tin thành công', user);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi cập nhật', error.errors || [], error.status || 500);
  }
};

module.exports = {
  register,
  login,
  logout,
  forgotPasswordRequest,
  forgotPasswordReset,
  changePassword,
  updateProfile,
  me
};
