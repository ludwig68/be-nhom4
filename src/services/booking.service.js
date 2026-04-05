/**
 * =============================================================
 * FILE: backend/src/services/booking.service.js
 * MÔ TẢ: Xử lý logic nghiệp vụ cho module Đặt phòng
 * 
 * ĐÂY LÀ FILE PHỨC TẠP NHẤT trong project vì liên quan đến:
 * - Kiểm tra phòng trống (tránh double-booking)
 * - Tính giá theo số đêm, loại phòng, dịch vụ
 * - Transaction database (nhiều bảng cần INSERT đồng thời)
 * - Tạo mã booking ngẫu nhiên duy nhất
 * - Tự động gán staff xác nhận
 * 
 * BẢNG LIÊN QUAN:
 * - bookings: đơn đặt phòng chính
 * - booking_details: gán phòng cụ thể cho booking
 * - booking_services: dịch vụ kèm theo (ăn sáng, massage, ...)
 * - rooms: phòng thực tế
 * - room_types: loại phòng (giá, sức chứa)
 * - branches: chi nhánh
 * - services: danh sách dịch vụ
 * - staff: nhân viên xác nhận
 * 
 * LUỒNG ĐẶT PHÒNG:
 * 1. Khách chọn ngày + tìm phòng trống
 * 2. Chọn phòng + dịch vụ → tính giá (quote)
 * 3. Xác nhận đặt phòng → INSERT 3 bảng trong transaction
 * =============================================================
 */

const pool = require('../config/db');
const roomService = require('./room.service');

/**
 * Danh sách trạng thái booking được coi là "đang active"
 * 
 * Khi kiểm tra phòng có trống không, cần loại trừ các booking
 * có trạng thái này vì chúng đang giữ phòng:
 */
const ACTIVE_BOOKING_STATUSES = ['chờ xác nhận', 'đã xác nhận', 'đã check-in'];

/**
 * Bảng giá dịch vụ (hardcode)
 * 
 * Production: nên lưu trong bảng services của database
 * Hiện tại: hardcode để đơn giản, có thể thay đổi khi cần
 * 
 * service_id → giá VND
 */
const SERVICE_PRICE_MAP = {
  break_fast: 120000,  // Ăn sáng: 120k/người
  dinner: 180000,      // Bữa tối: 180k/người
  massage: 250000       // Massage: 250k/lần
};

// =============================================================
// CÁC HÀM TRỢ GIÚP
// =============================================================

/**
 * Tính số đêm giữa 2 ngày
 * 
 * @param {string} checkIn - Ngày nhận phòng (YYYY-MM-DD)
 * @param {string} checkOut - Ngày trả phòng (YYYY-MM-DD)
 * @returns {number} Số đêm
 * 
 * Ví dụ: checkIn='2026-04-05', checkOut='2026-04-08' → 3 đêm
 * 
 * Cách tính:
 * - Tạo Date object từ chuỗi YYYY-MM-DD
 * - Tính hiệu milliseconds
 * - Chia cho số ms trong 1 ngày (1000 * 60 * 60 * 24)
 */
const getDateDiffNights = (checkIn, checkOut) => {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const diffMs = end.getTime() - start.getTime();
  const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return nights;
};

/**
 * Kiểm tra 1 phòng có trống trong khoảng thời gian không
 * 
 * @param {object} params
 *   - roomId: ID phòng cần kiểm tra
 *   - checkIn: ngày nhận phòng
 *   - checkOut: ngày trả phòng
 *   - connection: DB connection (dùng trong transaction, optional)
 * @returns {boolean} true nếu phòng trống
 * 
 * SQL giải thích:
 * - Tìm booking_details có room_id = roomId
 * - JOIN bookings để lấy trạng thái
 * - Kiểm tra có booking nào ACTIVE trùng thời gian không
 * - Điều kiện trùng: check_in < checkOut AND check_out > checkIn
 *   (2 khoảng thời gian giao nhau)
 * 
 * Ví dụ:
 * - Booking cũ: 4/1 → 4/5
 * - Booking mới: 4/3 → 4/7
 * - Kiểm tra: 4/1 < 4/7 (đúng) AND 4/5 > 4/3 (đúng) → TRÙNG
 * 
 * - Booking mới: 4/6 → 4/10
 * - Kiểm tra: 4/1 < 4/10 (đúng) AND 4/5 > 4/6 (sai) → KHÔNG TRÙNG
 */
const isRoomAvailable = async ({ roomId, checkIn, checkOut, connection = null }) => {
  // Nếu có connection → dùng connection (trong transaction)
  // Nếu không → dùng pool (query bình thường)
  const executor = connection || pool;

  // Tạo placeholder: '?, ?, ?' cho mảng ACTIVE_BOOKING_STATUSES
  const placeholders = ACTIVE_BOOKING_STATUSES.map(() => '?').join(', ');

  const [rows] = await executor.query(
    `
      SELECT 1
      FROM booking_details bd
      INNER JOIN bookings bk ON bk.booking_id = bd.booking_id
      WHERE bd.room_id = ?
        AND bk.status IN (${placeholders})
        AND bk.check_in_date < ?
        AND bk.check_out_date > ?
      LIMIT 1
    `,
    [
      roomId,
      ...ACTIVE_BOOKING_STATUSES,          // 'chờ xác nhận', 'đã xác nhận', 'đã check-in'
      `${checkOut} 12:00:00`,              // Giờ trả phòng: 12:00
      `${checkIn} 14:00:00`               // Giờ nhận phòng: 14:00
    ]
  );

  // rows.length === 0 → không có booking trùng → phòng trống
  return rows.length === 0;
};

// =============================================================
// CÁC HÀM NGHIỆP VỤ CHÍNH
// =============================================================

/**
 * Lấy danh sách dịch vụ kèm theo (ăn sáng, dinner, massage)
 * 
 * @returns {object[]} Danh sách dịch vụ + giá
 */
const getServiceCatalog = async () => {
  const [rows] = await pool.query(
    `
      SELECT
        service_id AS serviceId,
        service_name AS serviceName,
        description
      FROM services
      ORDER BY service_name ASC
    `
  );

  // Gắn giá từ SERVICE_PRICE_MAP vào mỗi dịch vụ
  return rows.map((service) => ({
    ...service,
    unitPrice: Number(SERVICE_PRICE_MAP[service.serviceId] || 0)
  }));
};

/**
 * Tìm phòng trống (wrapper của roomService.getAllRooms)
 * 
 * @param {object} filters - Bộ lọc tìm phòng
 * @returns {object[]} Danh sách phòng trống
 * 
 * Hàm này thêm availableOnly = true vào filters
 * → roomService sẽ lọc status = 'trống' + không có booking active
 */
const getAvailableRooms = async (filters = {}) => {
  const mergedFilters = {
    ...filters,
    availableOnly: true
  };

  return roomService.getAllRooms(mergedFilters);
};

/**
 * Tính báo giá đặt phòng
 * 
 * @param {object} payload - { roomId, checkIn, checkOut, serviceIds[] }
 * @returns {object} Báo giá chi tiết
 * @throws {object} Lỗi nếu phòng không tồn tại, không trống, hoặc service sai
 * 
 * BAO GỒM:
 * - Thông tin phòng (số phòng, chi nhánh, loại, sức chứa)
 * - Số đêm
 * - Giá phòng × số đêm
 * - Giá dịch vụ
 * - Tổng cộng
 * 
 * LUỒNG XỬ LÝ:
 * 1. Lấy thông tin phòng → kiểm tra tồn tại
 * 2. Kiểm tra phòng trống trong khoảng thời gian
 * 3. Tính số đêm × giá phòng
 * 4. Kiểm tra serviceIds hợp lệ
 * 5. Tính tổng giá dịch vụ
 * 6. Trả về báo giá chi tiết
 */
const buildBookingQuote = async (payload) => {
  // Bước 1: Lấy thông tin phòng
  const room = await roomService.getRoomById(payload.roomId);
  if (!room) {
    throw { status: 404, message: 'Không tìm thấy phòng', errors: ['room not found'] };
  }

  // Bước 2: Kiểm tra phòng có trống không
  const available = await isRoomAvailable({
    roomId: payload.roomId,
    checkIn: payload.checkIn,
    checkOut: payload.checkOut
  });

  if (!available) {
    // Phòng đã có người đặt trong khoảng thời gian này
    throw {
      status: 409, // 409 Conflict
      message: 'Phòng đã có lịch đặt trong khoảng thời gian này',
      errors: ['room not available']
    };
  }

  // Bước 3: Tính giá phòng
  const nights = getDateDiffNights(payload.checkIn, payload.checkOut);
  // base_price từ room_types (giá cơ bản / đêm)
  const roomPricePerNight = Number(room.basePrice || room.pricePerNight || 0);
  const roomCost = roomPricePerNight * nights;

  // Bước 4: Kiểm tra dịch vụ hợp lệ
  const serviceCatalog = await getServiceCatalog();
  const serviceMap = new Map(serviceCatalog.map((item) => [item.serviceId, item]));

  // Kiểm tra có serviceId nào không tồn tại không
  const invalidServiceIds = payload.serviceIds.filter((id) => !serviceMap.has(id));
  if (invalidServiceIds.length > 0) {
    throw {
      status: 400,
      message: 'Dịch vụ không hợp lệ',
      errors: invalidServiceIds.map((id) => `serviceId không tồn tại: ${id}`)
    };
  }

  // Bước 5: Tính giá dịch vụ
  const selectedServices = payload.serviceIds.map((serviceId) => {
    const service = serviceMap.get(serviceId);
    return {
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      unitPrice: Number(service.unitPrice || 0)
    };
  });

  const servicesCost = selectedServices.reduce((sum, service) => sum + service.unitPrice, 0);
  const totalCost = roomCost + servicesCost;

  // Bước 6: Trả về báo giá
  return {
    room: {
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      branchId: room.branchId,
      branchName: room.branchName,
      typeId: room.typeId,
      roomType: room.roomType,
      capacity: room.capacity
    },
    checkIn: payload.checkIn,
    checkOut: payload.checkOut,
    nights,
    price: {
      roomPricePerNight,
      roomCost,       // Giá phòng × số đêm
      servicesCost,   // Tổng giá dịch vụ
      totalCost,      // Tổng cộng
      currency: 'VND'
    },
    services: selectedServices
  };
};

/**
 * Tìm nhân viên xác nhận cho booking
 * 
 * @param {object} params
 *   - connection: DB connection (trong transaction)
 *   - branchId: ID chi nhánh
 *   - customerUserId: ID user đặt phòng
 * @returns {string} userId của staff xác nhận
 * 
 * LUỒNG XỬ LÝ:
 * 1. Tìm staff đang làm tại chi nhánh này
 * 2. Nếu có → dùng staff đó
 * 3. Nếu không có → tạo staff mới chính là customer (fallback)
 *    (dùng ON DUPLICATE KEY UPDATE để tránh lỗi trùng)
 * 
 * Production: nên có logic gán staff thực tế, không phải customer
 */
const resolveStaffConfirm = async ({ connection, branchId, customerUserId }) => {
  // Bước 1: Tìm staff tại chi nhánh
  const [staffRows] = await connection.query(
    `SELECT user_id AS userId FROM staff WHERE branch_id = ? ORDER BY user_id ASC LIMIT 1`,
    [branchId]
  );

  // Nếu có staff → dùng staff đó
  if (staffRows[0]?.userId) {
    return staffRows[0].userId;
  }

  // Bước 2: Không có staff → tạo staff mới = customer
  // ON DUPLICATE KEY UPDATE: nếu user_id đã có trong staff → chỉ update branch_id
  await connection.query(
    `
      INSERT INTO staff (user_id, branch_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE branch_id = VALUES(branch_id)
    `,
    [customerUserId, branchId]
  );

  return customerUserId;
};

/**
 * Tạo mã booking ngẫu nhiên duy nhất
 * 
 * @param {object} connection - DB connection
 * @returns {string} Mã booking (vd: BK-20260405-123456)
 * 
 * Format: BK-YYYYMMDD-XXXXXX
 * - BK: prefix cố định
 * - YYYYMMDD: ngày hôm nay
 * - XXXXXX: 6 chữ số ngẫu nhiên
 * 
 * Thuật toán:
 * - Thử tạo mã ngẫu nhiên tối đa 20 lần
 * - Mỗi lần: kiểm tra xem mã đã tồn tại trong DB chưa
 * - Nếu chưa → trả về
 * - Nếu 20 lần đều trùng → throw lỗi (rất hiếm)
 */
const generateBookingCode = async (connection) => {
  // Phần ngày: 20260405
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    // Phần ngẫu nhiên: 100000 - 999999
    const randomPart = String(Math.floor(100000 + Math.random() * 900000));
    const bookingCode = `BK-${datePart}-${randomPart}`;

    // Kiểm tra mã đã tồn tại chưa
    const [existing] = await connection.query(
      `SELECT booking_id FROM bookings WHERE booking_code = ? LIMIT 1`,
      [bookingCode]
    );

    // Chưa tồn tại → dùng mã này
    if (existing.length === 0) {
      return bookingCode;
    }
  }

  // Quá 20 lần thử đều trùng → lỗi
  throw { status: 500, message: 'Không thể tạo mã đặt phòng', errors: ['booking code generation failed'] };
};

/**
 * Tạo đơn đặt phòng mới
 * 
 * @param {object} params
 *   - payload: { roomId, checkIn, checkOut, serviceIds[], customerName, customerPhone, customerEmail, note }
 *   - userId: ID user đang đặt phòng
 * @returns {object} Thông tin booking vừa tạo
 * @throws {object} Lỗi nếu phòng không còn trống
 * 
 * TRANSACTION - QUAN TRỌNG:
 * Tất cả INSERT phải thành công HOẶC không có gì được lưu
 * - INSERT bookings → lấy booking_id
 * - INSERT booking_details (gán phòng)
 * - INSERT booking_services (dịch vụ)
 * - Nếu bất kỳ bước nào lỗi → ROLLBACK tất cả
 * 
 * DOUBLE-BOOKING PROTECTION:
 * - Bước 1: buildBookingQuote đã kiểm tra phòng trống
 * - Bước 2: TRƯỚC KHI INSERT, kiểm tra LẠI phòng trống
 *   → Tránh trường hợp 2 khách đặt cùng phòng cùng lúc
 */
const createBooking = async ({ payload, userId }) => {
  // Bước 1: Tính báo giá (kiểm tra phòng trống + tính giá)
  const quote = await buildBookingQuote(payload);

  // Bước 2: Lấy connection từ pool (dùng cho transaction)
  const connection = await pool.getConnection();

  try {
    // Bắt đầu transaction
    await connection.beginTransaction();

    // Bước 3: KIỂM TRA LẠI phòng trống (chống double-booking)
    const stillAvailable = await isRoomAvailable({
      roomId: payload.roomId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      connection // Dùng connection của transaction
    });

    if (!stillAvailable) {
      throw { status: 409, message: 'Phòng vừa được đặt bởi khách khác', errors: ['room not available'] };
    }

    // Bước 4: Tìm staff xác nhận
    const staffConfirm = await resolveStaffConfirm({
      connection,
      branchId: quote.room.branchId,
      customerUserId: userId
    });

    // Bước 5: Tạo mã booking duy nhất
    const bookingCode = await generateBookingCode(connection);

    // Bước 6: Chuẩn bị note (JSON string)
    const notePayload = {
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail,
      note: payload.note || ''
    };

    // Bước 7: INSERT booking
    const [bookingResult] = await connection.query(
      `
        INSERT INTO bookings
        (booking_code, customer_id, staff_confirm, type_room, branch_id, check_in_date, check_out_date, prica_at_booking, status, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        bookingCode,
        userId,
        staffConfirm,
        quote.room.typeId,
        quote.room.branchId,
        `${payload.checkIn} 14:00:00`,     // Giờ nhận phòng: 14:00
        `${payload.checkOut} 12:00:00`,    // Giờ trả phòng: 12:00
        quote.price.totalCost,             // Tổng tiền
        'chờ xác nhận',                     // Trạng thái ban đầu
        JSON.stringify(notePayload)         // Note dạng JSON
      ]
    );

    const bookingId = bookingResult.insertId; // ID của booking vừa tạo

    // Bước 8: INSERT booking_details (gán phòng cho booking)
    await connection.query(
      `INSERT INTO booking_details (booking_id, room_id) VALUES (?, ?)`,
      [bookingId, payload.roomId]
    );

    // Bước 9: INSERT booking_services (các dịch vụ kèm theo)
    for (const service of quote.services) {
      await connection.query(
        `
          INSERT INTO booking_services (booking_id, service_id, date_to_use, time_service_start)
          VALUES (?, ?, ?, ?)
        `,
        [bookingId, service.serviceId, payload.checkIn, '09:00:00']
      );
    }

    // Bước 10: COMMIT transaction → lưu tất cả vào DB
    await connection.commit();

    // Trả về thông tin booking
    return {
      bookingId,
      bookingCode,
      roomId: payload.roomId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      services: quote.services,
      totalCost: quote.price.totalCost,
      status: 'chờ xác nhận'
    };
  } catch (error) {
    // Nếu có lỗi BẤT KỲ → ROLLBACK (hoàn tác tất cả INSERT)
    await connection.rollback();
    throw error;
  } finally {
    // LUÔN release connection (dù thành công hay lỗi)
    // → trả connection về pool để tái sử dụng
    connection.release();
  }
};

module.exports = {
  getServiceCatalog,
  getAvailableRooms,
  buildBookingQuote,
  createBooking
};
