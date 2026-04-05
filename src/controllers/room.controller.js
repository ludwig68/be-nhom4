/**
 * =============================================================
 * FILE: backend/src/controllers/room.controller.js
 * MÔ TẢ: Controller xử lý HTTP request cho module Phòng
 * 
 * API:
 * - GET    /api/rooms         → Danh sách phòng (có lọc)
 * - GET    /api/rooms/meta    → Metadata cho bộ lọc
 * - GET    /api/rooms/:id     → Chi tiết 1 phòng
 * - POST   /api/rooms         → Tạo phòng (cần login)
 * - PUT    /api/rooms/:id     → Sửa phòng (cần login)
 * - DELETE /api/rooms/:id     → Xóa phòng (cần login)
 * =============================================================
 */

const roomService = require('../services/room.service');
const { successResponse, errorResponse } = require('../utils/response');

// Import các hàm validate + normalize
const {
  normalizeCreateRoomPayload,
  normalizeRoomQuery,
  normalizeUpdateRoomPayload,
  validateRoomId,
  validateCreateRoom,
  validateRoomQuery,
  validateUpdateRoom
} = require('../validators/room.validator');

/**
 * API: LẤY DANH SÁCH PHÒNG (CÓ LỌC)
 * GET /api/rooms
 * Query params: branchId, typeId, capacity, minPrice, maxPrice,
 *               checkIn, checkOut, amenityIds, status, availableOnly
 */
const getAllRooms = async (req, res) => {
  try {
    // Validate query parameters
    const queryErrors = validateRoomQuery(req.query);
    if (queryErrors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', queryErrors, 400);
    }

    // Normalize (ép kiểu, trim, ...)
    const filters = normalizeRoomQuery(req.query);

    // Query database
    const rooms = await roomService.getAllRooms(filters);
    return successResponse(res, 'Lấy danh sách phòng thành công', rooms);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy danh sách phòng', error.errors || [], error.status || 500);
  }
};

/**
 * API: LẤY METADATA CHO BỘ LỌC
 * GET /api/rooms/meta
 * 
 * Trả về: danh sách chi nhánh, loại phòng, tiện nghi, trạng thái
 * Dùng để populate dropdown/filter trên frontend
 */
const getRoomMeta = async (req, res) => {
  try {
    const data = await roomService.getRoomSearchMeta();
    return successResponse(res, 'Lấy dữ liệu lọc phòng thành công', data);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy dữ liệu lọc phòng', error.errors || [], error.status || 500);
  }
};

/**
 * API: LẤY CHI TIẾT 1 PHÒNG
 * GET /api/rooms/:id
 */
const getRoomById = async (req, res) => {
  try {
    // Validate ID
    const idErrors = validateRoomId(req.params.id);
    if (idErrors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', idErrors, 400);
    }

    // Query
    const room = await roomService.getRoomById(Number(req.params.id));
    if (!room) {
      return errorResponse(res, 'Không tìm thấy phòng', [], 404);
    }

    return successResponse(res, 'Lấy thông tin phòng thành công', room);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy thông tin phòng', error.errors || [], error.status || 500);
  }
};

/**
 * API: TẠO PHÒNG MỚI
 * POST /api/rooms
 * Cần đăng nhập (authMiddleware)
 * Body: { roomNumber, branchId, typeId, status }
 */
const createRoom = async (req, res) => {
  try {
    const errors = validateCreateRoom(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const payload = normalizeCreateRoomPayload(req.body);
    const room = await roomService.createRoom(payload);
    return successResponse(res, 'Tạo phòng thành công', room, 201);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi tạo phòng', error.errors || [], error.status || 500);
  }
};

/**
 * API: CẬP NHẬT PHÒNG
 * PUT /api/rooms/:id
 * Cần đăng nhập (authMiddleware)
 * Body: { roomNumber?, branchId?, typeId?, status? }
 */
const updateRoom = async (req, res) => {
  try {
    const idErrors = validateRoomId(req.params.id);
    if (idErrors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', idErrors, 400);
    }

    const errors = validateUpdateRoom(req.body);
    if (errors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', errors, 400);
    }

    const payload = normalizeUpdateRoomPayload(req.body);
    const room = await roomService.updateRoom(Number(req.params.id), payload);
    if (!room) {
      return errorResponse(res, 'Không tìm thấy phòng', [], 404);
    }

    return successResponse(res, 'Cập nhật phòng thành công', room);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi cập nhật phòng', error.errors || [], error.status || 500);
  }
};

/**
 * API: XÓA PHÒNG
 * DELETE /api/rooms/:id
 * Cần đăng nhập (authMiddleware)
 */
const deleteRoom = async (req, res) => {
  try {
    const idErrors = validateRoomId(req.params.id);
    if (idErrors.length) {
      return errorResponse(res, 'Dữ liệu không hợp lệ', idErrors, 400);
    }

    const deleted = await roomService.deleteRoom(Number(req.params.id));
    if (!deleted) {
      return errorResponse(res, 'Không tìm thấy phòng', [], 404);
    }

    return successResponse(res, 'Xóa phòng thành công', { roomId: Number(req.params.id) });
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi xóa phòng', error.errors || [], error.status || 500);
  }
};

module.exports = {
  getAllRooms,
  getRoomMeta,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom
};
