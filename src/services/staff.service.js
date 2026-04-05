const pool = require("../config/db");

const STATUS_MAP_TO_EN = {
  "chờ xác nhận": "pending",
  "đã xác nhận": "confirmed",
  "đã check-in": "checked_in",
  "đã check-out": "checked_out",
  "đã hủy": "cancelled",
};

const STATUS_MAP_TO_VN = {
  pending: "chờ xác nhận",
  confirmed: "đã xác nhận",
  checked_in: "đã check-in",
  checked_out: "đã check-out",
  cancelled: "đã hủy",
  rejected: "đã hủy",
};

const normalizeBookingStatus = (status) => STATUS_MAP_TO_EN[status] || status;
const denormalizeBookingStatus = (status) => STATUS_MAP_TO_VN[status] || status;

const mapBookingRow = (row) => ({
  booking_id: row.booking_id,
  booking_code: row.booking_code,
  customer_name: row.customer_name || row.full_name || null,
  phone: row.phone || null,
  room_id: row.room_id || null,
  branch_id: row.branch_id,
  checkin_date: row.check_in_date || row.checkin_date || null,
  checkout_date: row.check_out_date || row.checkout_date || null,
  checkin_at: row.actual_check_in || row.checkin_at || null,
  checkout_at: row.actual_check_out || row.checkout_at || null,
  total_amount: row.prica_at_booking || row.total_amount || 0,
  status: normalizeBookingStatus(row.status),
  note: row.note || null,
  created_at: row.created_at,
});

const getBookingsByBranch = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT b.*, u.full_name AS customer_name, u.phone,
            (SELECT bd.room_id FROM booking_details bd WHERE bd.booking_id = b.booking_id LIMIT 1) AS room_id
      FROM bookings b
      LEFT JOIN users u ON u.user_id = b.customer_id
      WHERE b.branch_id = ?
      ORDER BY b.created_at DESC`,
    [branchId],
  );
  return rows.map(mapBookingRow);
};

const searchBookings = async (branchId, keyword) => {
  const q = `%${keyword}%`;
  const [rows] = await pool.query(
    `
      SELECT b.*, u.full_name AS customer_name, u.phone,
             (SELECT bd.room_id FROM booking_details bd WHERE bd.booking_id = b.booking_id LIMIT 1) AS room_id
      FROM bookings b
      LEFT JOIN users u ON u.user_id = b.customer_id
      WHERE b.branch_id = ? AND (
        b.booking_id LIKE ? OR
        b.booking_code LIKE ? OR
        u.full_name LIKE ? OR
        u.phone LIKE ?
      )
      ORDER BY b.created_at DESC
    `,
    [branchId, q, q, q, q],
  );
  return rows.map(mapBookingRow);
};

const getBookingById = async (bookingId) => {
  const [rows] = await pool.query(
    `SELECT b.*, u.full_name AS full_name, u.phone,
            (SELECT bd.room_id FROM booking_details bd WHERE bd.booking_id = b.booking_id LIMIT 1) AS room_id
      FROM bookings b
      LEFT JOIN users u ON u.user_id = b.customer_id
      WHERE b.booking_id = ?
      LIMIT 1`,
    [bookingId],
  );
  return rows[0] ? mapBookingRow(rows[0]) : null;
};

const generateBookingCode = () => `BK${Date.now().toString().slice(-8)}`;

const createBooking = async (payload, staffId) => {
  const {
    branch_id,
    room_id,
    checkin_date,
    checkout_date,
    status = "pending",
    total_amount = 0,
    note = "",
    type_room = 1,
  } = payload;

  const bookingCode = generateBookingCode();
  const bookingStatus = denormalizeBookingStatus(status);
  const [result] = await pool.query(
    `INSERT INTO bookings (booking_code, customer_id, staff_confirm, type_room, branch_id, check_in_date, check_out_date, prica_at_booking, status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      bookingCode,
      null,
      staffId,
      type_room,
      branch_id,
      checkin_date,
      checkout_date,
      total_amount,
      bookingStatus,
      note,
    ],
  );

  if (room_id) {
    await pool.query(
      `INSERT INTO booking_details (booking_id, room_id) VALUES (?, ?)`,
      [result.insertId, room_id],
    );
  }

  return getBookingById(result.insertId);
};

const BOOKING_FIELD_MAP = {
  branch_id: "branch_id",
  customer_id: "customer_id",
  type_room: "type_room",
  checkin_date: "check_in_date",
  checkout_date: "check_out_date",
  actual_check_in: "actual_check_in",
  actual_check_out: "actual_check_out",
  total_amount: "prica_at_booking",
  status: "status",
  note: "note",
};

const updateBooking = async (bookingId, payload) => {
  const setParts = [];
  const params = [];

  Object.entries(payload).forEach(([key, value]) => {
    const dbKey = BOOKING_FIELD_MAP[key];
    if (!dbKey || value == null) return;

    if (key === "status") {
      setParts.push(`\`${dbKey}\` = ?`);
      params.push(denormalizeBookingStatus(value));
    } else {
      setParts.push(`\`${dbKey}\` = ?`);
      params.push(value);
    }
  });

  if (!setParts.length) return getBookingById(bookingId);

  params.push(bookingId);
  await pool.query(
    `UPDATE bookings SET ${setParts.join(", ")} WHERE booking_id = ?`,
    params,
  );

  return getBookingById(bookingId);
};

const updateBookingStatus = async (bookingId, status) => {
  await pool.query(`UPDATE bookings SET status = ? WHERE booking_id = ?`, [
    denormalizeBookingStatus(status),
    bookingId,
  ]);
  return getBookingById(bookingId);
};

const checkInBooking = async (bookingId) => {
  await pool.query(
    `UPDATE bookings SET status = 'đã check-in', actual_check_in = NOW() WHERE booking_id = ?`,
    [bookingId],
  );
  return getBookingById(bookingId);
};

const checkOutBooking = async (bookingId) => {
  await pool.query(
    `UPDATE bookings SET status = 'đã check-out', actual_check_out = NOW() WHERE booking_id = ?`,
    [bookingId],
  );
  return getBookingById(bookingId);
};

const getRoomsByBranch = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT * FROM rooms WHERE branch_id = ? ORDER BY room_number`,
    [branchId],
  );
  return rows;
};

const updateRoomStatus = async (roomId, status) => {
  await pool.query(`UPDATE rooms SET status = ? WHERE room_id = ?`, [
    status,
    roomId,
  ]);
  const [rows] = await pool.query(`SELECT * FROM rooms WHERE room_id = ?`, [
    roomId,
  ]);
  return rows[0] || null;
};

const updateRoomNote = async (roomId, note) => {
  await pool.query(`UPDATE rooms SET note = ? WHERE room_id = ?`, [
    note,
    roomId,
  ]);
  const [rows] = await pool.query(`SELECT * FROM rooms WHERE room_id = ?`, [
    roomId,
  ]);
  return rows[0] || null;
};

const addBookingService = async (bookingId, payload) => {
  const { service_name, amount } = payload;
  const [result] = await pool.query(
    `INSERT INTO booking_services (booking_id, service_name, amount, created_at) VALUES (?, ?, ?, NOW())`,
    [bookingId, service_name, amount],
  );
  return {
    id: result.insertId,
    booking_id: bookingId,
    service_name,
    amount,
  };
};

const getEmptyRoomStats = async (branchId) => {
  const [[totalRows]] = await pool.query(
    `SELECT COUNT(*) AS total_rooms FROM rooms WHERE branch_id = ?`,
    [branchId],
  );
  const [[emptyRows]] = await pool.query(
    `SELECT COUNT(*) AS empty_rooms FROM rooms WHERE branch_id = ? AND status = 'trống'`,
    [branchId],
  );

  return {
    branch_id: branchId,
    total_rooms: totalRows?.total_rooms || 0,
    empty_rooms: emptyRows?.empty_rooms || 0,
    emptyCount: emptyRows?.empty_rooms || 0,
    occupied_rooms:
      (totalRows?.total_rooms || 0) - (emptyRows?.empty_rooms || 0),
  };
};

const getTodayBookings = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT b.*, u.full_name AS full_name, u.phone,
            (SELECT bd.room_id FROM booking_details bd WHERE bd.booking_id = b.booking_id LIMIT 1) AS room_id
      FROM bookings b
      LEFT JOIN users u ON u.user_id = b.customer_id
      WHERE b.branch_id = ? AND DATE(b.check_in_date) = CURDATE()
      ORDER BY b.check_in_date`,
    [branchId],
  );
  return rows.map(mapBookingRow);
};

const getCurrentGuests = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT b.*, u.full_name AS full_name, u.phone,
            (SELECT bd.room_id FROM booking_details bd WHERE bd.booking_id = b.booking_id LIMIT 1) AS room_id
      FROM bookings b
      LEFT JOIN users u ON u.user_id = b.customer_id
      WHERE b.branch_id = ? AND b.status = 'đã check-in'
      ORDER BY b.actual_check_in`,
    [branchId],
  );
  return rows.map(mapBookingRow);
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
  getCurrentGuests,
};
