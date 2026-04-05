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
 * Query params: checkIn, checkOut, branchId, typeId, capacity, minPrice, maxPrice, amenityIds
 * 
 * Không cần đăng nhập (public) - ai cũng có thể tìm phòng
 */
const getAvailableRooms = async (req, res) => {
  try {
    // Bước 1: Validate query parameters (checkIn/checkOut format, giá trị hợp lệ)
    const errors = validateAvailableRoomsQuery(req.query);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    // Bước 2: Normalize (chuẩn hóa) dữ liệu: ép kiểu, trim, ...
    const filters = normalizeAvailableRoomsQuery(req.query);

    // Debug log: xem filters gửi lên là gì (xóa khi production)
    console.log('[DEBUG] getAvailableRooms filters:', JSON.stringify(filters));

    // Bước 3: Gọi service query database
    const rooms = await bookingService.getAvailableRooms(filters);

    // Debug log: xem kết quả trả về bao nhiêu phòng
    console.log('[DEBUG] getAvailableRooms result count:', rooms.length);

    return successResponse(res, 'Lấy danh sách phòng trống thành công', rooms);
  } catch (error) {
    console.error('[ERROR] getAvailableRooms:', error.message);
    return errorResponse(res, error.message || 'Lỗi lấy phòng trống', error.errors || [], error.status || 500);
  }
};

/**
 * API: LẤY DANH SÁCH DỊCH VỤ KÈM THEO
 * GET /api/bookings/services
 * 
 * Trả về: Ăn sáng, Bữa tối, Massage + giá mỗi dịch vụ
 * Không cần đăng nhập (public)
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
 * Body: { roomId, checkIn, checkOut, serviceIds[] }
 * 
 * Không cần đăng nhập (public) - khách có thể tính giá trước khi đặt
 * 
 * Luồng xử lý:
 * 1. Kiểm tra phòng có tồn tại không
 * 2. Kiểm tra phòng có trống trong khoảng thời gian không
 * 3. Tính số đêm × giá phòng
 * 4. Tính tổng giá dịch vụ
 * 5. Trả về báo giá chi tiết
 */
const quoteBooking = async (req, res) => {
  try {
    // Bước 1: Validate dữ liệu
    const errors = validateBookingQuotePayload(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    // Bước 2: Normalize dữ liệu
    const payload = normalizeBookingQuotePayload(req.body);

    // Bước 3: Gọi service tính toán
    const quote = await bookingService.buildBookingQuote(payload);

    return successResponse(res, 'Tính tổng tiền thành công', quote);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi tính tổng tiền', error.errors || [], error.status || 500);
  }
};

/**
 * API: TẠO ĐƠN ĐẶT PHÒNG
 * POST /api/bookings
 * Cần đăng nhập (authMiddleware)
 * 
 * Body: {
 *   roomId, checkIn, checkOut, serviceIds[],
 *   customerName, customerPhone, customerEmail, note
 * }
 * 
 * LUỒNG XỬ LÝ:
 * 1. Validate dữ liệu đầu vào
 * 2. Tính quote (kiểm tra phòng trống + tính giá)
 * 3. Mở DB transaction (atomic)
 * 4. Kiểm tra lại phòng trống (chống double-booking)
 * 5. Tìm staff xác nhận (hoặc fallback sang customer)
 * 6. Tạo booking code ngẫu nhiên
 * 7. INSERT bookings
 * 8. INSERT booking_details (gán phòng)
 * 9. INSERT booking_services (dịch vụ kèm theo)
 * 10. COMMIT transaction
 * 
 * Transaction là gì?
 * - Nhóm nhiều câu lệnh SQL thành 1 khối nguyên tử (atomic)
 * - Tất cả thành công → COMMIT (lưu vĩnh viễn)
 * - Có lỗi → ROLLBACK (hoàn tác tất cả)
 * - Tránh trường hợp: INSERT booking nhưng KHÔNG INSERT booking_details
 */
const createBooking = async (req, res) => {
  try {
    // Bước 1: Validate
    const errors = validateCreateBookingPayload(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    // Bước 2: Normalize
    const payload = normalizeCreateBookingPayload(req.body);

    // Bước 3: Gọi service tạo booking
    // req.user.userId: ID user đang đăng nhập (từ JWT token)
    const booking = await bookingService.createBooking({
      payload,
      userId: req.user.userId
    });

    // 201 Created: resource mới được tạo
    return successResponse(res, 'Đặt phòng thành công', booking, 201);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi đặt phòng', error.errors || [], error.status || 500);
  }
};

module.exports = {
  getAvailableRooms,
  getServiceCatalog,
  quoteBooking,
  createBooking
};
