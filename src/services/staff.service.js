const pool = require('../config/db');

const getBookingsByBranch = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT * FROM bookings WHERE branch_id = ? ORDER BY created_at DESC`,
    [branchId]
  );
  return rows;
};

const searchBookings = async (branchId, keyword) => {
  const q = `%${keyword}%`;
  const [rows] = await pool.query(
    `
      SELECT * FROM bookings
      WHERE branch_id = ? AND
        (booking_id LIKE ? OR customer_name LIKE ? OR phone LIKE ?)
      ORDER BY created_at DESC
    `,
    [branchId, q, q, q]
  );
  return rows;
};

const getBookingById = async (bookingId) => {
  const [rows] = await pool.query(`SELECT * FROM bookings WHERE booking_id = ? LIMIT 1`, [bookingId]);
  return rows[0] || null;
};

const createBooking = async (payload) => {
  const {
    branch_id,
    customer_name,
    phone,
    room_id,
    checkin_date,
    checkout_date,
    status = 'pending',
    total_amount = 0,
    note = ''
  } = payload;

  const [result] = await pool.query(
    `INSERT INTO bookings (branch_id, customer_name, phone, room_id, checkin_date, checkout_date, status, total_amount, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [branch_id, customer_name, phone, room_id, checkin_date, checkout_date, status, total_amount, note]
  );

  return getBookingById(result.insertId);
};

const updateBooking = async (bookingId, payload) => {
  const setParts = [];
  const params = [];

  Object.entries(payload).forEach(([key, value]) => {
    if (value != null) {
      setParts.push(`\`${key}\` = ?`);
      params.push(value);
    }
  });

  if (!setParts.length) return getBookingById(bookingId);

  params.push(bookingId);
  await pool.query(`UPDATE bookings SET ${setParts.join(', ')} WHERE booking_id = ?`, params);

  return getBookingById(bookingId);
};

const updateBookingStatus = async (bookingId, status) => {
  await pool.query(`UPDATE bookings SET status = ? WHERE booking_id = ?`, [status, bookingId]);
  return getBookingById(bookingId);
};

const checkInBooking = async (bookingId) => {
  await pool.query(
    `UPDATE bookings SET status = 'checked_in', checkin_at = NOW() WHERE booking_id = ?`,
    [bookingId]
  );
  return getBookingById(bookingId);
};

const checkOutBooking = async (bookingId) => {
  await pool.query(
    `UPDATE bookings SET status = 'checked_out', checkout_at = NOW() WHERE booking_id = ?`,
    [bookingId]
  );
  return getBookingById(bookingId);
};

const getRoomsByBranch = async (branchId) => {
  const [rows] = await pool.query(`SELECT * FROM rooms WHERE branch_id = ? ORDER BY room_number`, [branchId]);
  return rows;
};

const updateRoomStatus = async (roomId, status) => {
  await pool.query(`UPDATE rooms SET status = ? WHERE room_id = ?`, [status, roomId]);
  const [rows] = await pool.query(`SELECT * FROM rooms WHERE room_id = ?`, [roomId]);
  return rows[0] || null;
};

const updateRoomNote = async (roomId, note) => {
  await pool.query(`UPDATE rooms SET note = ? WHERE room_id = ?`, [note, roomId]);
  const [rows] = await pool.query(`SELECT * FROM rooms WHERE room_id = ?`, [roomId]);
  return rows[0] || null;
};

const addBookingService = async (bookingId, payload) => {
  const { service_name, amount } = payload;
  const [result] = await pool.query(
    `INSERT INTO booking_services (booking_id, service_name, amount, created_at) VALUES (?, ?, ?, NOW())`,
    [bookingId, service_name, amount]
  );
  return {
    id: result.insertId,
    booking_id: bookingId,
    service_name,
    amount
  };
};

const getEmptyRoomStats = async (branchId) => {
  const [[totalRows]] = await pool.query(`SELECT COUNT(*) AS total_rooms FROM rooms WHERE branch_id = ?`, [branchId]);
  const [[emptyRows]] = await pool.query(`SELECT COUNT(*) AS empty_rooms FROM rooms WHERE branch_id = ? AND status IN ('empty', 'available')`, [branchId]);

  return {
    branch_id: branchId,
    total_rooms: totalRows?.total_rooms || 0,
    empty_rooms: emptyRows?.empty_rooms || 0,
    occupied_rooms: (totalRows?.total_rooms || 0) - (emptyRows?.empty_rooms || 0)
  };
};

const getTodayBookings = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT * FROM bookings WHERE branch_id = ? AND DATE(checkin_date) = CURDATE() ORDER BY checkin_date`,
    [branchId]
  );
  return rows;
};

const getCurrentGuests = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT * FROM bookings WHERE branch_id = ? AND status = 'checked_in' ORDER BY checkin_at`,
    [branchId]
  );
  return rows;
};

module.exports = {
  getBookingsByBranch,
  searchBookings,
  getBookingById,
  createBooking,
  updateBooking,
  updateBookingStatus,
  checkInBooking,
  checkOutBooking,
  getRoomsByBranch,
  updateRoomStatus,
  updateRoomNote,
  addBookingService,
  getEmptyRoomStats,
  getTodayBookings,
  getCurrentGuests
};