/**
 * =============================================================
 * FILE: backend/src/services/feedback.service.js
 * MÔ TẢ: Xử lý logic nghiệp vụ cho module Đánh giá/Phản hồi
 * 
 * BẢNG LIÊN QUAN:
 * - feedbacks: lưu đánh giá (feedback_id, booking_id, customer_id, rating, comment)
 * - bookings: đơn đặt phòng (kiểm tra đã check-out mới được đánh giá)
 * - users: thông tin khách hàng
 * - rooms + booking_details: xác định phòng đã ở
 * 
 * QUY TẮC:
 * - Chỉ đánh giá được booking đã "đã check-out"
 * - Mỗi booking chỉ được đánh giá 1 lần
 * - Rating: 1-5 sao
 * =============================================================
 */

const pool = require('../config/db');

/**
 * Kiểm tra xem user có thể đánh giá booking này không
 * 
 * @param {string} bookingId - ID booking
 * @param {string} userId - ID user muốn đánh giá
 * @returns {object|null} Thông tin booking hoặc null
 * @throws {object} Lỗi nếu booking không tồn tại, không phải của user, chưa check-out
 */
const validateBookingForFeedback = async (bookingId, userId) => {
  // Lấy booking + kiểm tra quyền
  const [rows] = await pool.query(
    `
      SELECT
        bk.booking_id,
        bk.booking_code,
        bk.status,
        bk.customer_id,
        bk.check_in_date,
        bk.check_out_date,
        bk.branch_id,
        b.branch_name,
        rt.type_name AS roomType,
        r.room_number
      FROM bookings bk
      LEFT JOIN branches b ON b.branch_id = bk.branch_id
      LEFT JOIN room_types rt ON rt.type_id = bk.type_room
      LEFT JOIN booking_details bd ON bd.booking_id = bk.booking_id
      LEFT JOIN rooms r ON r.room_id = bd.room_id
      WHERE bk.booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  if (!rows[0]) {
    throw { status: 404, message: 'Không tìm thấy đơn đặt phòng', errors: ['booking not found'] };
  }

  const booking = rows[0];

  // Kiểm tra user là người đặt booking này
  if (booking.customer_id !== userId) {
    throw { status: 403, message: 'Bạn không có quyền đánh giá đơn này', errors: ['forbidden'] };
  }

  // Chỉ đánh giá được booking đã check-out
  if (booking.status !== 'đã check-out') {
    throw {
      status: 400,
      message: `Không thể đánh giá vì đơn đang ở trạng thái "${booking.status}". Chỉ đánh giá được sau khi check-out.`,
      errors: ['invalid status']
    };
  }

  // Kiểm tra đã đánh giá chưa
  const [existing] = await pool.query(
    `SELECT feedback_id FROM feedbacks WHERE booking_id = ? AND customer_id = ? LIMIT 1`,
    [bookingId, userId]
  );

  if (existing.length > 0) {
    throw { status: 409, message: 'Bạn đã đánh giá đơn này rồi', errors: ['already reviewed'] };
  }

  return booking;
};

/**
 * Tạo đánh giá mới
 * 
 * @param {object} params
 *   - bookingId: ID booking được đánh giá
 *   - userId: ID user đánh giá
 *   - rating: điểm 1-5
 *   - comment: nhận xét (optional)
 * @returns {object} Feedback vừa tạo
 */
const createFeedback = async ({ bookingId, userId, rating, comment }) => {
  // Validate booking
  const booking = await validateBookingForFeedback(bookingId, userId);

  // INSERT feedback
  const [result] = await pool.query(
    `
      INSERT INTO feedbacks (booking_id, customer_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `,
    [bookingId, userId, rating, comment || null]
  );

  return {
    feedbackId: result.insertId,
    bookingId,
    bookingCode: booking.booking_code,
    rating,
    comment: comment || null,
    message: 'Cảm ơn bạn đã đánh giá!'
  };
};

/**
 * Lấy danh sách đánh giá của user
 * 
 * @param {string} userId - ID user
 * @returns {object[]} Mảng feedback
 */
const getUserFeedbacks = async (userId) => {
  const [rows] = await pool.query(
    `
      SELECT
        f.feedback_id AS feedbackId,
        f.rating,
        f.comment,
        f.created_at AS createdAt,
        bk.booking_code AS bookingCode,
        bk.check_in_date AS checkInDate,
        bk.check_out_date AS checkOutDate,
        b.branch_name AS branchName,
        rt.type_name AS roomType,
        r.room_number AS roomNumber
      FROM feedbacks f
      INNER JOIN bookings bk ON bk.booking_id = f.booking_id
      LEFT JOIN branches b ON b.branch_id = bk.branch_id
      LEFT JOIN room_types rt ON rt.type_id = bk.type_room
      LEFT JOIN booking_details bd ON bd.booking_id = bk.booking_id
      LEFT JOIN rooms r ON r.room_id = bd.room_id
      WHERE f.customer_id = ?
      ORDER BY f.created_at DESC
    `,
    [userId]
  );

  return rows.map((row) => ({
    feedbackId: row.feedbackId,
    bookingCode: row.bookingCode,
    rating: row.rating,
    comment: row.comment,
    branchName: row.branchName,
    roomType: row.roomType,
    roomNumber: row.roomNumber,
    checkIn: row.checkInDate ? new Date(row.checkInDate).toISOString().slice(0, 10) : null,
    checkOut: row.checkOutDate ? new Date(row.checkOutDate).toISOString().slice(0, 10) : null,
    createdAt: row.createdAt
  }));
};

/**
 * Lấy chi tiết 1 feedback
 * 
 * @param {number} feedbackId - ID feedback
 * @param {string} userId - ID user đang yêu cầu
 * @returns {object|null}
 */
const getFeedbackDetail = async (feedbackId, userId) => {
  const [rows] = await pool.query(
    `
      SELECT
        f.feedback_id AS feedbackId,
        f.rating,
        f.comment,
        f.created_at AS createdAt,
        bk.booking_code AS bookingCode,
        bk.check_in_date AS checkInDate,
        bk.check_out_date AS checkOutDate,
        b.branch_id AS branchId,
        b.branch_name AS branchName,
        b.address AS branchAddress,
        rt.type_name AS roomType,
        r.room_number AS roomNumber,
        u.full_name AS customerName
      FROM feedbacks f
      INNER JOIN bookings bk ON bk.booking_id = f.booking_id
      LEFT JOIN branches b ON b.branch_id = bk.branch_id
      LEFT JOIN room_types rt ON rt.type_id = bk.type_room
      LEFT JOIN booking_details bd ON bd.booking_id = bk.booking_id
      LEFT JOIN rooms r ON r.room_id = bd.room_id
      LEFT JOIN users u ON u.user_id = f.customer_id
      WHERE f.feedback_id = ?
      LIMIT 1
    `,
    [feedbackId]
  );

  if (!rows[0]) return null;

  const row = rows[0];

  // Kiểm tra quyền: user chỉ xem feedback của mình, staff/admin xem được tất cả
  const [userRows] = await pool.query(
    `SELECT r.role_name FROM users u LEFT JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? LIMIT 1`,
    [userId]
  );

  const userRole = userRows[0]?.role_name;
  if (userRole !== 'ADMIN' && userRole !== 'STAFF') {
    // User thường: kiểm tra feedback có phải của mình không
    const [feedbackOwner] = await pool.query(
      `SELECT customer_id FROM feedbacks WHERE feedback_id = ? LIMIT 1`,
      [feedbackId]
    );

    if (feedbackOwner[0]?.customer_id !== userId) {
      throw { status: 403, message: 'Bạn không có quyền xem đánh giá này', errors: ['forbidden'] };
    }
  }

  return {
    feedbackId: row.feedbackId,
    bookingCode: row.bookingCode,
    rating: row.rating,
    comment: row.comment,
    branch: {
      branchId: row.branchId,
      branchName: row.branchName,
      address: row.branchAddress
    },
    roomType: row.roomType,
    roomNumber: row.roomNumber,
    customerName: row.customerName,
    checkIn: row.checkInDate ? new Date(row.checkInDate).toISOString().slice(0, 10) : null,
    checkOut: row.checkOutDate ? new Date(row.checkOutDate).toISOString().slice(0, 10) : null,
    createdAt: row.createdAt
  };
};

/**
 * Kiểm tra xem user có booking nào đã check-out chưa được đánh giá không
 * (dùng để hiển thị gợi ý đánh giá)
 * 
 * @param {string} userId - ID user
 * @returns {object[]} Mảng booking chưa được đánh giá
 */
const getEligibleBookingsForReview = async (userId) => {
  const [rows] = await pool.query(
    `
      SELECT
        bk.booking_id AS bookingId,
        bk.booking_code AS bookingCode,
        bk.check_in_date AS checkInDate,
        bk.check_out_date AS checkOutDate,
        b.branch_name AS branchName,
        rt.type_name AS roomType,
        r.room_number AS roomNumber
      FROM bookings bk
      LEFT JOIN branches b ON b.branch_id = bk.branch_id
      LEFT JOIN room_types rt ON rt.type_id = bk.type_room
      LEFT JOIN booking_details bd ON bd.booking_id = bk.booking_id
      LEFT JOIN rooms r ON r.room_id = bd.room_id
      WHERE bk.customer_id = ?
        AND bk.status = 'đã check-out'
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f WHERE f.booking_id = bk.booking_id AND f.customer_id = ?
        )
      ORDER BY bk.check_out_date DESC
    `,
    [userId, userId]
  );

  return rows.map((row) => ({
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    branchName: row.branchName,
    roomType: row.roomType,
    roomNumber: row.roomNumber,
    checkIn: row.checkInDate ? new Date(row.checkInDate).toISOString().slice(0, 10) : null,
    checkOut: row.checkOutDate ? new Date(row.checkOutDate).toISOString().slice(0, 10) : null
  }));
};

/**
 * Cập nhật đánh giá (chỉ cho phép sửa comment, không sửa rating)
 * 
 * @param {object} params
 *   - feedbackId: ID feedback cần sửa
 *   - userId: ID user
 *   - comment: nội dung mới
 * @returns {object} Feedback sau khi cập nhật
 */
const updateFeedback = async ({ feedbackId, userId, comment }) => {
  // Kiểm tra feedback tồn tại + thuộc về user
  const [feedbackRows] = await pool.query(
    `SELECT feedback_id, customer_id FROM feedbacks WHERE feedback_id = ? LIMIT 1`,
    [feedbackId]
  );

  if (!feedbackRows[0]) {
    throw { status: 404, message: 'Không tìm thấy đánh giá', errors: ['feedback not found'] };
  }

  if (feedbackRows[0].customer_id !== userId) {
    throw { status: 403, message: 'Bạn không có quyền sửa đánh giá này', errors: ['forbidden'] };
  }

  await pool.query(
    `UPDATE feedbacks SET comment = ? WHERE feedback_id = ?`,
    [comment, feedbackId]
  );

  return { feedbackId, message: 'Cập nhật đánh giá thành công' };
};

/**
 * Xóa đánh giá
 * 
 * @param {object} params
 *   - feedbackId: ID feedback cần xóa
 *   - userId: ID user
 *   - userRole: role của user
 */
const deleteFeedback = async ({ feedbackId, userId, userRole }) => {
  const [feedbackRows] = await pool.query(
    `SELECT feedback_id, customer_id FROM feedbacks WHERE feedback_id = ? LIMIT 1`,
    [feedbackId]
  );

  if (!feedbackRows[0]) {
    throw { status: 404, message: 'Không tìm thấy đánh giá', errors: ['feedback not found'] };
  }

  // Admin/Staff xóa được mọi feedback, User chỉ xóa được feedback của mình
  if (userRole !== 'ADMIN' && userRole !== 'STAFF' && feedbackRows[0].customer_id !== userId) {
    throw { status: 403, message: 'Bạn không có quyền xóa đánh giá này', errors: ['forbidden'] };
  }

  await pool.query(`DELETE FROM feedbacks WHERE feedback_id = ?`, [feedbackId]);

  return { feedbackId, message: 'Xóa đánh giá thành công' };
};

module.exports = {
  createFeedback,
  getUserFeedbacks,
  getFeedbackDetail,
  getEligibleBookingsForReview,
  updateFeedback,
  deleteFeedback
};
