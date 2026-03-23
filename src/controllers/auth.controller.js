const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils/response');
const {
  validateRegister,
  validateLogin,
  validateForgotPasswordRequest,
  validateForgotPasswordReset,
  validateChangePassword
} = require('../validators/auth.validator');

const register = async (req, res) => {
  try {
    const errors = validateRegister(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const user = await authService.register(req.body);
    return successResponse(res, 'Đăng ký tài khoản thành công', user, 201);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đăng ký', error.errors || [], error.status || 500);
  }
};

const login = async (req, res) => {
  try {
    const errors = validateLogin(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const result = await authService.login(req.body);
    return successResponse(res, 'Đăng nhập thành công', result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đăng nhập', error.errors || [], error.status || 500);
  }
};

const logout = async (req, res) => {
  try {
    const result = await authService.logout();
    return successResponse(res, result.message, null);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đăng xuất', error.errors || [], error.status || 500);
  }
};

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

const changePassword = async (req, res) => {
  try {
    const errors = validateChangePassword(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

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

const me = async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.userId);
    return successResponse(res, 'Lấy thông tin người dùng thành công', user);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy thông tin người dùng', error.errors || [], error.status || 500);
  }
};

module.exports = {
  register,
  login,
  logout,
  forgotPasswordRequest,
  forgotPasswordReset,
  changePassword,
  me
};