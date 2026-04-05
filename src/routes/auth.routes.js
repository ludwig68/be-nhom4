/**
 * =============================================================
 * FILE: backend/src/routes/auth.routes.js
 * MÔ TẢ: Định nghĩa các route (URL) cho module Xác thực
 * 
 * ROUTER LÀ GÌ?
 * - Là bộ phân phối request đến đúng controller
 * - Mapping: URL + HTTP method → Controller function
 * - Có thể gắn middleware vào từng route cụ thể
 * 
 * PREFIX: /api/auth
 * Tất cả route trong file này sẽ có prefix /api/auth
 * Ví dụ: router.post('/login') → POST /api/auth/login
 * =============================================================
 */

const express = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// =============================================================
// ROUTES CÔNG KHAI (không cần đăng nhập)
// =============================================================

// POST /api/auth/register  →  Đăng ký tài khoản mới
router.post('/register', authController.register);

// POST /api/auth/login  →  Đăng nhập, lấy token
router.post('/login', authController.login);

// POST /api/auth/logout  →  Đăng xuất
router.post('/logout', authController.logout);

// POST /api/auth/forgot-password/request  →  Yêu cầu gửi OTP quên mật khẩu
router.post('/forgot-password/request', authController.forgotPasswordRequest);

// POST /api/auth/forgot-password/reset  →  Đặt lại mật khẩu bằng OTP
router.post('/forgot-password/reset', authController.forgotPasswordReset);

// =============================================================
// ROUTES CẦN ĐĂNG NHẬP (có authMiddleware)
// =============================================================
// authMiddleware đứng TRƯỚC controller → chạy trước
// Nếu token hợp lệ → req.user có thông tin → controller chạy
// Nếu token sai → authMiddleware trả lỗi 401 → controller KHÔNG chạy

// POST /api/auth/change-password  →  Đổi mật khẩu (cần login)
router.post('/change-password', authMiddleware, authController.changePassword);

// GET /api/auth/me  →  Lấy thông tin user hiện tại (cần login)
router.get('/me', authMiddleware, authController.me);

// PUT /api/auth/profile  →  Cập nhật profile (cần login)
router.put('/profile', authMiddleware, authController.updateProfile);

module.exports = router;
