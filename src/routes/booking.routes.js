/**
 * =============================================================
 * FILE: backend/src/routes/booking.routes.js
 * MÔ TẢ: Định nghĩa route cho module Đặt phòng
 * 
 * PREFIX: /api/bookings
 * 
 * API PUBLIC:
 * - GET /api/bookings/available-rooms  → Tìm phòng trống
 * - GET /api/bookings/services          → Danh sách dịch vụ
 * - POST /api/bookings/quote            → Tính giá
 * 
 * API PRIVATE (cần đăng nhập):
 * - POST /api/bookings  →  Tạo đơn đặt phòng
 * =============================================================
 */

const express = require('express');
const bookingController = require('../controllers/booking.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// =============================================================
// ROUTES PUBLIC
// =============================================================

// GET /api/bookings/available-rooms  →  Tìm phòng trống theo ngày + bộ lọc
// Query: checkIn, checkOut, branchId, typeId, capacity, minPrice, maxPrice, amenityIds
router.get('/available-rooms', bookingController.getAvailableRooms);

// GET /api/bookings/services  →  Danh sách dịch vụ kèm theo (ăn sáng, massage, ...)
router.get('/services', bookingController.getServiceCatalog);

// POST /api/bookings/quote  →  Tính tổng tiền đặt phòng
// Body: { roomId, checkIn, checkOut, serviceIds[] }
router.post('/quote', bookingController.quoteBooking);

// =============================================================
// ROUTES PRIVATE
// =============================================================

// POST /api/bookings  →  Tạo đơn đặt phòng
// Cần đăng nhập (để biết ai đặt phòng)
// Body: { roomId, checkIn, checkOut, serviceIds[], customerName, customerPhone, customerEmail, note }
router.post('/', authMiddleware, bookingController.createBooking);

module.exports = router;
