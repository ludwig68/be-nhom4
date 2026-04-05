/**
 * =============================================================
 * FILE: backend/src/routes/room.routes.js
 * MÔ TẢ: Định nghĩa route cho module Phòng
 * 
 * PREFIX: /api/rooms
 * 
 * API PUBLIC (không cần đăng nhập):
 * - GET /api/rooms         → Danh sách phòng (có lọc)
 * - GET /api/rooms/meta    → Metadata cho bộ lọc
 * - GET /api/rooms/:id     → Chi tiết phòng
 * 
 * API PRIVATE (cần đăng nhập - admin/staff):
 * - POST   /api/rooms      → Tạo phòng mới
 * - PUT    /api/rooms/:id  → Sửa phòng
 * - DELETE /api/rooms/:id  → Xóa phòng
 * =============================================================
 */

const express = require('express');
const roomController = require('../controllers/room.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// =============================================================
// ROUTES PUBLIC
// =============================================================

// GET /api/rooms  →  Danh sách phòng (có thể lọc theo branch, type, price, ...)
router.get('/', roomController.getAllRooms);

// GET /api/rooms/meta  →  Metadata cho bộ lọc (branches, roomTypes, amenities)
router.get('/meta', roomController.getRoomMeta);

// GET /api/rooms/:id  →  Chi tiết 1 phòng (ảnh, tiện nghi, đánh giá)
router.get('/:id', roomController.getRoomById);

// =============================================================
// ROUTES PRIVATE (cần đăng nhập)
// =============================================================

// POST /api/rooms  →  Tạo phòng mới
router.post('/', authMiddleware, roomController.createRoom);

// PUT /api/rooms/:id  →  Cập nhật phòng
router.put('/:id', authMiddleware, roomController.updateRoom);

// DELETE /api/rooms/:id  →  Xóa phòng
router.delete('/:id', authMiddleware, roomController.deleteRoom);

module.exports = router;
