/**
 * =============================================================
 * FILE: backend/src/controllers/booking.controller.js
 * MÔ TẢ: Controller xử lý HTTP request cho module Đặt phòng
 * 
 * API:
 * - GET    /api/bookings/available-rooms  → Tìm phòng trống theo ngày
 * - GET    /api/bookings/services          → Danh sách dịch vụ kèm theo
 * - POST   /api/bookings/quote             → Tính tổng tiền đặt phòng
 * - POST   /api/bookings                   → Tạo đơn đặt phòng (cần login)
 * - GET    /api/bookings/my-bookings       → Lịch sử đặt phòng của user (cần login)
 * - GET    /api/bookings/:id               → Chi tiết booking (cần login)
 * - POST   /api/bookings/:id/confirm       → Xác nhận đơn (cần staff/admin)
 * - POST   /api/bookings/:id/cancel        → Hủy đơn (cần login)
 * =============================================================
 */

const bookingService = require('../services/booking.service');
const { successResponse, errorResponse } = require('../utils/response');

// Import các hàm validate từ validator
const {
  validateAvailableRoomsQuery,
  normalizeAvailableRoomsQuery,
  validateBookingQuotePayload,
  normalizeBookingQuotePayload,
  validateCreateBookingPayload,
  normalizeCreateBookingPayload
} = require('../validators/booking.validator');

/**
 * API: TÌM PHÒNG TRỐNG THEO NGÀY VÀ BỘ LỌC
 * GET /api/bookings/available-rooms
 */
const getAvailableRooms = async (req, res) => {
  try {
    const errors = validateAvailableRoomsQuery(req.query);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const filters = normalizeAvailableRoomsQuery(req.query);
    const rooms = await bookingService.getAvailableRooms(filters);
    return successResponse(res, 'Lấy danh sách phòng trống thành công', rooms);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy phòng trống', error.errors || [], error.status || 500);
  }
};

/**
 * API: LẤY DANH SÁCH DỊCH VỤ KÈM THEO
 * GET /api/bookings/services
 */
const getServiceCatalog = async (req, res) => {
  try {
    const services = await bookingService.getServiceCatalog();
    return successResponse(res, 'Lấy danh sách dịch vụ thành công', services);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy dịch vụ', error.errors || [], error.status || 500);
  }
};

/**
 * API: TÍNH TỔNG TIỀN ĐẶT PHÒNG (QUOTE)
 * POST /api/bookings/quote
 */
const quoteBooking = async (req, res) => {
  try {
    const errors = validateBookingQuotePayload(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const payload = normalizeBookingQuotePayload(req.body);
    const quote = await bookingService.buildBookingQuote(payload);
    return successResponse(res, 'Tính tổng tiền thành công', quote);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi tính tổng tiền', error.errors || [], error.status || 500);
  }
};

/**
 * API: TẠO ĐƠN ĐẶT PHÒNG
 * POST /api/bookings
 */
const createBooking = async (req, res) => {
  try {
    const errors = validateCreateBookingPayload(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const payload = normalizeCreateBookingPayload(req.body);
    const booking = await bookingService.createBooking({
      payload,
      userId: req.user.userId
    });

    return successResponse(res, 'Đặt phòng thành công', booking, 201);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đặt phòng', error.errors || [], error.status || 500);
  }
};

// =============================================================
// CÁC API MỚI: Lịch sử, Chi tiết, Xác nhận, Hủy
// =============================================================

/**
 * API: LỊCH SỬ ĐẶT PHÒNG CỦA USER
 * GET /api/bookings/my-bookings
 * Query: status (optional) - lọc theo trạng thái
 * 
 * Cần đăng nhập
 */
const getMyBookings = async (req, res) => {
  try {
    const status = req.query.status || null;
    const bookings = await bookingService.getBookingList({
      userId: req.user.userId,
      status
    });
    return successResponse(res, 'Lấy lịch sử đặt phòng thành công', bookings);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy lịch sử đặt phòng', error.errors || [], error.status || 500);
  }
};

/**
 * API: CHI TIẾT BOOKING
 * GET /api/bookings/:id
 * 
 * Cần đăng nhập
 * - USER: chỉ xem booking của mình
 * - STAFF/ADMIN: xem được mọi booking
 */
const getBookingDetail = async (req, res) => {
  try {
    const bookingId = req.params.id; // Có thể là bookingId (số) hoặc bookingCode (string)
    const detail = await bookingService.getBookingDetail(
      bookingId,
      req.user.userId,
      req.user.roleName
    );

    if (!detail) {
      return errorResponse(res, 'Không tìm thấy đơn đặt phòng', [], 404);
    }

    return successResponse(res, 'Lấy chi tiết đơn đặt phòng thành công', detail);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy chi tiết đơn', error.errors || [], error.status || 500);
  }
};

/**
 * API: XÁC NHẬN ĐƠN ĐẶT PHÒNG
 * POST /api/bookings/:id/confirm
 * 
 * Cần đăng nhập + role STAFF hoặc ADMIN
 */
const confirmBooking = async (req, res) => {
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return errorResponse(res, 'ID đơn đặt phòng không hợp lệ', ['bookingId phải là số nguyên dương'], 400);
    }

    const result = await bookingService.confirmBooking({
      bookingId,
      staffUserId: req.user.userId
    });

    return successResponse(res, result.message, result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi xác nhận đơn', error.errors || [], error.status || 500);
  }
};

/**
 * API: HỦY ĐƠN ĐẶT PHÒNG
 * POST /api/bookings/:id/cancel
 */
const cancelBooking = async (req, res) => {
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return errorResponse(res, 'ID đơn đặt phòng không hợp lệ', ['bookingId phải là số nguyên dương'], 400);
    }

    const result = await bookingService.cancelBooking({
      bookingId,
      userId: req.user.userId,
      userRole: req.user.roleName
    });

    return successResponse(res, result.message, result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi hủy đơn', error.errors || [], error.status || 500);
  }
};

/**
 * API: CHECK-IN (nhân viên)
 * POST /api/bookings/:id/check-in
 * Cần đăng nhập + role STAFF hoặc ADMIN
 */
const checkInBooking = async (req, res) => {
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return errorResponse(res, 'ID đơn đặt phòng không hợp lệ', ['bookingId phải là số nguyên dương'], 400);
    }

    const result = await bookingService.checkInBooking({
      bookingId,
      staffUserId: req.user.userId
    });

    return successResponse(res, result.message, result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi check-in', error.errors || [], error.status || 500);
  }
};

/**
 * API: CHECK-OUT (nhân viên)
 * POST /api/bookings/:id/check-out
 * Cần đăng nhập + role STAFF hoặc ADMIN
 */
const checkOutBooking = async (req, res) => {
  try {
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return errorResponse(res, 'ID đơn đặt phòng không hợp lệ', ['bookingId phải là số nguyên dương'], 400);
    }

    const result = await bookingService.checkOutBooking({
      bookingId,
      staffUserId: req.user.userId
    });

    return successResponse(res, result.message, result);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi check-out', error.errors || [], error.status || 500);
  }
};

module.exports = {
  getAvailableRooms,
  getServiceCatalog,
  quoteBooking,
  createBooking,
  getMyBookings,
  getBookingDetail,
  confirmBooking,
  cancelBooking,
  // Mới: check-in / check-out
  checkInBooking,
  checkOutBooking
};
