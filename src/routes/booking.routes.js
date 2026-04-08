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
 * - POST   /api/bookings                → Tạo đơn đặt phòng
 * - GET    /api/bookings/my-bookings    → Lịch sử đặt phòng
 * - GET    /api/bookings/:id            → Chi tiết booking
 * - POST   /api/bookings/:id/confirm    → Xác nhận đơn (staff/admin)
 * - POST   /api/bookings/:id/cancel     → Hủy đơn
 * 
 * LƯU Ý VỀ THỨ TỰ ROUTE:
 * - Route '/:id/confirm' và '/:id/cancel' PHẢI đặt TRƯỚC '/:id'
 * - Nếu không, Express sẽ hiểu 'confirm' và 'cancel' là :id
 * =============================================================
 */

const express = require('express');
const bookingController = require('../controllers/booking.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

// =============================================================
// ROUTES PUBLIC
// =============================================================

// GET /api/bookings/available-rooms
router.get('/available-rooms', bookingController.getAvailableRooms);

// GET /api/bookings/services
router.get('/services', bookingController.getServiceCatalog);

// POST /api/bookings/quote
router.post('/quote', bookingController.quoteBooking);

// =============================================================
// ROUTES PRIVATE
// =============================================================

// GET /api/bookings/my-bookings  →  Lịch sử đặt phòng của user
router.get('/my-bookings', authMiddleware, bookingController.getMyBookings);

// POST /api/bookings/:id/confirm  →  Xác nhận đơn (staff/admin)
// ⚠️ PHẢI đặt TRƯỚC '/:id' để Express không nhầm 'confirm' là :id
router.post('/:id/confirm', authMiddleware, bookingController.confirmBooking);

// POST /api/bookings/:id/cancel  →  Hủy đơn
// ⚠️ PHẢI đặt TRƯỚC '/:id'
router.post('/:id/cancel', authMiddleware, bookingController.cancelBooking);

// POST /api/bookings/:id/check-in  →  Check-in (staff/admin)
// ⚠️ PHẢI đặt TRƯỚC '/:id'
router.post('/:id/check-in', authMiddleware, bookingController.checkInBooking);

// POST /api/bookings/:id/check-out  →  Check-out (staff/admin)
// ⚠️ PHẢI đặt TRƯỚC '/:id'
router.post('/:id/check-out', authMiddleware, bookingController.checkOutBooking);

// GET /api/bookings/:id  →  Chi tiết booking
// Đặt SAU các route cụ thể như /:id/confirm, /:id/cancel
router.get('/:id', authMiddleware, bookingController.getBookingDetail);

// POST /api/bookings  →  Tạo đơn đặt phòng
// ⚠️ PHẢI đặt SAU '/my-bookings' để Express không nhầm 'my-bookings' là :id
router.post('/', authMiddleware, bookingController.createBooking);

module.exports = router;
