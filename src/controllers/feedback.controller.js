/**
 * =============================================================
 * FILE: backend/src/controllers/feedback.controller.js
 * MÔ TẢ: Controller xử lý HTTP request cho module Đánh giá
 * 
 * API:
 * - POST   /api/feedbacks              → Gửi đánh giá (cần login)
 * - GET    /api/feedbacks/my-feedbacks → Danh sách đánh giá của user (cần login)
 * - GET    /api/feedbacks/eligible     → Booking chưa được đánh giá (gợi ý) (cần login)
 * - GET    /api/feedbacks/:id          → Chi tiết đánh giá (cần login)
 * - PUT    /api/feedbacks/:id          → Sửa đánh giá (cần login)
 * - DELETE /api/feedbacks/:id          → Xóa đánh giá (cần login)
 * =============================================================
 */

const feedbackService = require('../services/feedback.service');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * API: GỬI ĐÁNH GIÁ
 * POST /api/feedbacks
 * Body: { bookingId, rating (1-5), comment? }
 */
const createFeedback = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;

    // Validate cơ bản
    if (!bookingId) {
      return errorResponse(res, 'bookingId là bắt buộc', ['bookingId required'], 400);
    }

    if (!rating || rating < 1 || rating > 5) {
      return errorResponse(res, 'rating phải từ 1 đến 5', ['rating must be 1-5'], 400);
    }

    if (comment && String(comment).trim().length > 1000) {
      return errorResponse(res, 'comment tối đa 1000 ký tự', ['comment too long'], 400);
    }

    const result = await feedbackService.createFeedback({
      bookingId: Number(bookingId),
      userId: req.user.userId,
      rating: Number(rating),
      comment: comment ? String(comment).trim() : null
    });

    return successResponse(res, result.message, result, 201);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi gửi đánh giá', error.errors || [], error.status || 500);
  }
};

/**
 * API: DANH SÁCH ĐÁNH GIÁ CỦA USER
 * GET /api/feedbacks/my-feedbacks
 */
const getMyFeedbacks = async (req, res) => {
  try {
    const feedbacks = await feedbackService.getUserFeedbacks(req.user.userId);
    return successResponse(res, 'Lấy danh sách đánh giá thành công', feedbacks);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy đánh giá', error.errors || [], error.status || 500);
  }
};

/**
 * API: BOOKING CHƯA ĐƯỢC ĐÁNH GIÁ (gợi ý)
 * GET /api/feedbacks/eligible
 */
const getEligibleBookings = async (req, res) => {
  try {
    const bookings = await feedbackService.getEligibleBookingsForReview(req.user.userId);
    return successResponse(res, 'Lấy danh sách booking chưa đánh giá thành công', bookings);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy danh sách', error.errors || [], error.status || 500);
  }
};

/**
 * API: CHI TIẾT ĐÁNH GIÁ
 * GET /api/feedbacks/:id
 */
const getFeedbackDetail = async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);

    if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
      return errorResponse(res, 'ID đánh giá không hợp lệ', ['feedbackId phải là số nguyên dương'], 400);
    }

    const feedback = await feedbackService.getFeedbackDetail(feedbackId, req.user.userId);

    if (!feedback) {
      return errorResponse(res, 'Không tìm thấy đánh giá', [], 404);
    }

    return successResponse(res, 'Lấy chi tiết đánh giá thành công', feedback);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy chi tiết', error.errors || [], error.status || 500);
  }
};

/**
 * API: SỬA ĐÁNH GIÁ
 * PUT /api/feedbacks/:id
 * Body: { comment }
 */
const updateFeedback = async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);
    const { comment } = req.body;

    if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
      return errorResponse(res, 'ID đánh giá không hợp lệ', ['feedbackId phải là số nguyên dương'], 400);
    }

    if (!comment || String(comment).trim().length === 0) {
      return errorResponse(res, 'comment là bắt buộc', ['comment required'], 400);
    }

    if (String(comment).trim().length > 1000) {
      return errorResponse(res, 'comment tối đa 1000 ký tự', ['comment too long'], 400);
    }

    const result = await feedbackService.updateFeedback({
      feedbackId,
      userId: req.user.userId,
      comment: String(comment).trim()
    });

    return successResponse(res, result.message, result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi sửa đánh giá', error.errors || [], error.status || 500);
  }
};

/**
 * API: XÓA ĐÁNH GIÁ
 * DELETE /api/feedbacks/:id
 */
const deleteFeedback = async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);

    if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
      return errorResponse(res, 'ID đánh giá không hợp lệ', ['feedbackId phải là số nguyên dương'], 400);
    }

    const result = await feedbackService.deleteFeedback({
      feedbackId,
      userId: req.user.userId,
      userRole: req.user.roleName
    });

    return successResponse(res, result.message, result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi xóa đánh giá', error.errors || [], error.status || 500);
  }
};

module.exports = {
  createFeedback,
  getMyFeedbacks,
  getEligibleBookings,
  getFeedbackDetail,
  updateFeedback,
  deleteFeedback
};
