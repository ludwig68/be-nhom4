/**
 * =============================================================
 * FILE: backend/src/routes/feedback.routes.js
 * MÔ TẢ: Định nghĩa route cho module Đánh giá/Phản hồi
 * 
 * PREFIX: /api/feedbacks
 * 
 * TẤT CẢ ĐỀU CẦN ĐĂNG NHẬP (authMiddleware)
 * =============================================================
 */

const express = require('express');
const feedbackController = require('../controllers/feedback.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// =============================================================
// ROUTES PUBLIC
// =============================================================

// GET /api/feedbacks/public  →  Danh sách đánh giá cho trang chủ
router.get('/public', feedbackController.getPublicFeedbacks);

// =============================================================
// ROUTES PRIVATE (cần đăng nhập)
// =============================================================

// POST /api/feedbacks  →  Gửi đánh giá
router.post('/', authMiddleware, feedbackController.createFeedback);

// GET /api/feedbacks/my-feedbacks  →  Danh sách đánh giá của user
router.get('/my-feedbacks', authMiddleware, feedbackController.getMyFeedbacks);

// GET /api/feedbacks/eligible  →  Booking chưa được đánh giá (gợi ý)
router.get('/eligible', authMiddleware, feedbackController.getEligibleBookings);

// PUT /api/feedbacks/:id  →  Sửa đánh giá
router.put('/:id', authMiddleware, feedbackController.updateFeedback);

// DELETE /api/feedbacks/:id  →  Xóa đánh giá
router.delete('/:id', authMiddleware, feedbackController.deleteFeedback);

// GET /api/feedbacks/:id  →  Chi tiết đánh giá
// Đặt SAU các route cụ thể
router.get('/:id', authMiddleware, feedbackController.getFeedbackDetail);

module.exports = router;
