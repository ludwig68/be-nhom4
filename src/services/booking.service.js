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
 * Parse giá trị ngày giờ từ DB thành Date hợp lệ
 */
const toValidDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Format ngày/giờ theo local timezone (tránh lệch do toISOString -> UTC)
 */
const pad2 = (value) => String(value).padStart(2, '0');

const formatDateLocal = (value) => {
  const date = toValidDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const formatTimeLocal = (value) => {
  const date = toValidDate(value);
  if (!date) return null;
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const formatDateTimeLocal = (value) => {
  const date = toValidDate(value);
  if (!date) return null;
  return `${formatDateLocal(date)}T${formatTimeLocal(date)}`;
};

const formatDatePartLocal = (value = new Date()) => {
  const date = toValidDate(value);
  if (!date) return '';
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
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
  const datePart = formatDatePartLocal();

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
        (booking_code, customer_id, staff_confirm, type_room, branch_id, check_in_date, check_out_date, price_at_booking, status, note)
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

// =============================================================
// CÁC HÀM MỚI: Lịch sử booking, Chi tiết booking, Xác nhận booking
// =============================================================

/**
 * Lấy danh sách booking của user (lịch sử đặt phòng)
 * 
 * @param {object} params
 *   - userId: ID user cần lấy booking
 *   - status: lọc theo trạng thái (optional)
 * @returns {object[]} Mảng booking đã join đầy đủ thông tin
 * 
 * JOIN các bảng:
 * - bookings → users (khách hàng)
 * - bookings → branches (chi nhánh)
 * - bookings → room_types (loại phòng)
 * - bookings → booking_details → rooms (phòng cụ thể)
 * - bookings → booking_services → services (dịch vụ)
 * - bookings → staff (nhân viên xác nhận)
 */
const getBookingList = async ({ userId, status = null }) => {
  const conditions = ['bk.customer_id = ?'];
  const values = [userId];

  // Nếu có filter status → thêm vào WHERE
  if (status && status.trim() !== '') {
    conditions.push('bk.status = ?');
    values.push(status.trim());
  }

  const [rows] = await pool.query(
    `
      SELECT
        bk.booking_id AS bookingId,
        bk.booking_code AS bookingCode,
        bk.status AS status,
        bk.check_in_date AS checkInDate,
        bk.check_out_date AS checkOutDate,
        bk.actual_check_in AS actualCheckIn,
        bk.actual_check_out AS actualCheckOut,
        bk.price_at_booking AS totalPrice,
        bk.note AS note,
        bk.created_at AS createdAt,
        b.branch_id AS branchId,
        b.branch_name AS branchName,
        rt.type_id AS typeId,
        rt.type_name AS roomType,
        rt.base_price AS basePrice,
        rt.capacity AS capacity,
        r.room_id AS roomId,
        r.room_number AS roomNumber,
        u.full_name AS customerName,
        u.email AS customerEmail,
        u.phone AS customerPhone,
        sf.full_name AS staffName
      FROM bookings bk
      LEFT JOIN branches b ON b.branch_id = bk.branch_id
      LEFT JOIN room_types rt ON rt.type_id = bk.type_room
      LEFT JOIN booking_details bd ON bd.booking_id = bk.booking_id
      LEFT JOIN rooms r ON r.room_id = bd.room_id
      LEFT JOIN users u ON u.user_id = bk.customer_id
      LEFT JOIN users sf ON sf.user_id = bk.staff_confirm
      WHERE ${conditions.join(' AND ')}
      ORDER BY bk.created_at DESC
    `,
    values
  );

  // Với mỗi booking, lấy thêm danh sách dịch vụ
  const bookingIds = rows.map((row) => row.bookingId);
  let servicesMap = new Map();

  if (bookingIds.length > 0) {
    const placeholders = bookingIds.map(() => '?').join(', ');
    const [serviceRows] = await pool.query(
      `
        SELECT
          bs.booking_id AS bookingId,
          bs.service_id AS serviceId,
          s.service_name AS serviceName,
          bs.date_to_use AS dateToUse,
          bs.time_service_start AS timeServiceStart
        FROM booking_services bs
        LEFT JOIN services s ON s.service_id = bs.service_id
        WHERE bs.booking_id IN (${placeholders})
        ORDER BY bs.date_to_use ASC, bs.time_service_start ASC
      `,
      bookingIds
    );

    // Gom dịch vụ theo bookingId
    serviceRows.forEach((sr) => {
      if (!servicesMap.has(sr.bookingId)) {
        servicesMap.set(sr.bookingId, []);
      }
      servicesMap.get(sr.bookingId).push({
        serviceId: sr.serviceId,
        serviceName: sr.serviceName,
        dateToUse: formatDateLocal(sr.dateToUse),
        timeServiceStart: sr.timeServiceStart
      });
    });
  }

  // Parse note JSON và gắn services vào từng booking
  return rows.map((row) => {
    let noteObj = {};
    try {
      noteObj = JSON.parse(row.note || '{}');
    } catch (e) {
      noteObj = { raw: row.note };
    }

    // Format ngày giờ cho dễ đọc
    const checkInDate = toValidDate(row.checkInDate);
    const checkOutDate = toValidDate(row.checkOutDate);

    return {
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      status: row.status,
      checkIn: formatDateLocal(checkInDate),
      checkInTime: formatTimeLocal(checkInDate),
      checkOut: formatDateLocal(checkOutDate),
      checkOutTime: formatTimeLocal(checkOutDate),
      actualCheckIn: formatDateTimeLocal(row.actualCheckIn),
      actualCheckOut: formatDateTimeLocal(row.actualCheckOut),
      totalPrice: Number(row.totalPrice || 0),
      branch: {
        branchId: row.branchId,
        branchName: row.branchName
      },
      roomType: {
        typeId: row.typeId,
        typeName: row.roomType,
        basePrice: Number(row.basePrice || 0),
        capacity: row.capacity
      },
      room: row.roomId ? {
        roomId: row.roomId,
        roomNumber: row.roomNumber
      } : null,
      customer: {
        name: noteObj.customerName || row.customerName || '',
        email: noteObj.customerEmail || row.customerEmail || '',
        phone: noteObj.customerPhone || row.customerPhone || ''
      },
      staffName: row.staffName || null,
      note: noteObj.note || '',
      services: servicesMap.get(row.bookingId) || [],
      createdAt: row.createdAt
    };
  });
};

/**
 * Lấy chi tiết 1 booking theo bookingId hoặc bookingCode
 * 
 * @param {string|number} bookingIdentifier - bookingId (số) hoặc bookingCode (string)
 * @param {string} userId - ID user đang yêu cầu (để kiểm tra quyền)
 * @param {string} userRole - Role của user (ADMIN, STAFF, USER)
 * @returns {object|null} Chi tiết booking hoặc null
 * 
 * QUYỀN TRUY CẬP:
 * - ADMIN/STAFF: xem được MỌI booking
 * - USER: chỉ xem booking của CHÍNH MÌNH
 */
const getBookingDetail = async (bookingIdentifier, userId, userRole) => {
  const isNumeric = /^\d+$/.test(String(bookingIdentifier));

  // Xác định WHERE clause: theo booking_id (số) hoặc booking_code (string)
  const whereClause = isNumeric ? 'bk.booking_id = ?' : 'bk.booking_code = ?';
  const whereValue = isNumeric ? Number(bookingIdentifier) : String(bookingIdentifier);

  // Kiểm tra quyền: ADMIN/STAFF xem tất cả, USER chỉ xem của mình
  const conditions = [whereClause];
  const values = [whereValue];

  if (userRole !== 'ADMIN' && userRole !== 'STAFF') {
    conditions.push('bk.customer_id = ?');
    values.push(userId);
  }

  const [rows] = await pool.query(
    `
      SELECT
        bk.booking_id AS bookingId,
        bk.booking_code AS bookingCode,
        bk.status AS status,
        bk.check_in_date AS checkInDate,
        bk.check_out_date AS checkOutDate,
        bk.actual_check_in AS actualCheckIn,
        bk.actual_check_out AS actualCheckOut,
        bk.price_at_booking AS totalPrice,
        bk.note AS note,
        bk.created_at AS createdAt,
        b.branch_id AS branchId,
        b.branch_name AS branchName,
        b.address AS branchAddress,
        b.phone AS branchPhone,
        b.email AS branchEmail,
        rt.type_id AS typeId,
        rt.type_name AS roomType,
        rt.base_price AS basePrice,
        rt.price_sunday_normal AS sundayPrice,
        rt.price_peak_season AS peakSeasonPrice,
        rt.price_peak_sunday AS peakSundayPrice,
        rt.price_hour AS hourlyPrice,
        rt.capacity AS capacity,
        dr.description_room AS roomDescription,
        r.room_id AS roomId,
        r.room_number AS roomNumber,
        u.full_name AS customerName,
        u.email AS customerEmail,
        u.phone AS customerPhone,
        u.address AS customerAddress,
        sf.full_name AS staffName,
        sf.email AS staffEmail
      FROM bookings bk
      LEFT JOIN branches b ON b.branch_id = bk.branch_id
      LEFT JOIN room_types rt ON rt.type_id = bk.type_room
      LEFT JOIN description_room dr ON dr.id_des_room = rt.description_room
      LEFT JOIN booking_details bd ON bd.booking_id = bk.booking_id
      LEFT JOIN rooms r ON r.room_id = bd.room_id
      LEFT JOIN users u ON u.user_id = bk.customer_id
      LEFT JOIN users sf ON sf.user_id = bk.staff_confirm
      WHERE ${conditions.join(' AND ')}
      LIMIT 1
    `,
    values
  );

  if (!rows[0]) {
    return null;
  }

  const row = rows[0];

  // Lấy danh sách dịch vụ của booking này
  const [serviceRows] = await pool.query(
    `
      SELECT
        bs.service_id AS serviceId,
        s.service_name AS serviceName,
        s.description AS serviceDescription,
        bs.date_to_use AS dateToUse,
        bs.time_service_start AS timeServiceStart
      FROM booking_services bs
      LEFT JOIN services s ON s.service_id = bs.service_id
      WHERE bs.booking_id = ?
      ORDER BY bs.date_to_use ASC, bs.time_service_start ASC
    `,
    [row.bookingId]
  );

  const services = serviceRows.map((sr) => ({
    serviceId: sr.serviceId,
    serviceName: sr.serviceName,
    serviceDescription: sr.serviceDescription,
    dateToUse: formatDateLocal(sr.dateToUse),
    timeServiceStart: sr.timeServiceStart
  }));

  // Parse note JSON
  let noteObj = {};
  try {
    noteObj = JSON.parse(row.note || '{}');
  } catch (e) {
    noteObj = { raw: row.note };
  }

  // Format ngày giờ
  const checkInDate = toValidDate(row.checkInDate);
  const checkOutDate = toValidDate(row.checkOutDate);

  // Tính số đêm
  let nights = 0;
  if (checkInDate && checkOutDate) {
    const diffMs = checkOutDate.getTime() - checkInDate.getTime();
    nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  return {
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    status: row.status,
    checkIn: formatDateLocal(checkInDate),
    checkInTime: formatTimeLocal(checkInDate),
    checkOut: formatDateLocal(checkOutDate),
    checkOutTime: formatTimeLocal(checkOutDate),
    actualCheckIn: formatDateTimeLocal(row.actualCheckIn),
    actualCheckOut: formatDateTimeLocal(row.actualCheckOut),
    nights,
    totalPrice: Number(row.totalPrice || 0),
    branch: {
      branchId: row.branchId,
      branchName: row.branchName,
      address: row.branchAddress,
      phone: row.branchPhone,
      email: row.branchEmail
    },
    roomType: {
      typeId: row.typeId,
      typeName: row.roomType,
      basePrice: Number(row.basePrice || 0),
      sundayPrice: Number(row.sundayPrice || 0),
      peakSeasonPrice: Number(row.peakSeasonPrice || 0),
      peakSundayPrice: Number(row.peakSundayPrice || 0),
      hourlyPrice: Number(row.hourlyPrice || 0),
      capacity: row.capacity,
      description: row.roomDescription
    },
    room: row.roomId ? {
      roomId: row.roomId,
      roomNumber: row.roomNumber
    } : null,
    customer: {
      name: noteObj.customerName || row.customerName || '',
      email: noteObj.customerEmail || row.customerEmail || '',
      phone: noteObj.customerPhone || row.customerPhone || '',
      address: row.customerAddress || ''
    },
    staff: row.staffName ? {
      name: row.staffName,
      email: row.staffEmail || ''
    } : null,
    note: noteObj.note || '',
    services,
    createdAt: row.createdAt
  };
};

/**
 * Xác nhận đơn đặt phòng (chuyển từ 'chờ xác nhận' → 'đã xác nhận')
 * 
 * @param {object} params
 *   - bookingId: ID booking cần xác nhận
 *   - staffUserId: ID nhân viên thực hiện xác nhận
 * @returns {object} Booking sau khi xác nhận
 * @throws {object} Lỗi nếu booking không tồn tại, không đúng trạng thái, hoặc không có quyền
 * 
 * LUỒNG XỬ LÝ:
 * 1. Kiểm tra booking tồn tại
 * 2. Kiểm tra trạng thái hiện tại PHẢI là 'chờ xác nhận'
 * 3. Kiểm tra nhân viên có quyền (role STAFF hoặc ADMIN)
 * 4. UPDATE status → 'đã xác nhận'
 * 5. Cập nhật staff_confirm (nếu nhân viên khác với người đã gán)
 */
const confirmBooking = async ({ bookingId, staffUserId }) => {
  // Bước 1: Kiểm tra booking tồn tại + lấy thông tin
  const [bookingRows] = await pool.query(
    `
      SELECT
        bk.booking_id,
        bk.booking_code,
        bk.status,
        bk.customer_id,
        bk.branch_id,
        bk.staff_confirm,
        b.branch_name
      FROM bookings bk
      LEFT JOIN branches b ON b.branch_id = bk.branch_id
      WHERE bk.booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  if (!bookingRows[0]) {
    throw { status: 404, message: 'Không tìm thấy đơn đặt phòng', errors: ['booking not found'] };
  }

  const booking = bookingRows[0];

  // Bước 2: Kiểm tra trạng thái
  if (booking.status !== 'chờ xác nhận') {
    throw {
      status: 400,
      message: `Không thể xác nhận đơn này vì đang ở trạng thái "${booking.status}"`,
      errors: ['invalid status']
    };
  }

  // Bước 3: Kiểm tra nhân viên có quyền (role STAFF hoặc ADMIN)
  const [userRows] = await pool.query(
    `
      SELECT u.user_id, u.role_id, r.role_name
      FROM users u
      LEFT JOIN roles r ON r.role_id = u.role_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [staffUserId]
  );

  if (!userRows[0]) {
    throw { status: 404, message: 'Không tìm thấy nhân viên', errors: ['staff not found'] };
  }

  const userRole = userRows[0].role_name;
  if (userRole !== 'ADMIN' && userRole !== 'STAFF') {
    throw { status: 403, message: 'Bạn không có quyền xác nhận đơn đặt phòng', errors: ['forbidden'] };
  }

  // Đảm bảo staff_confirm luôn tham chiếu đến bản ghi staff hợp lệ (ràng buộc FK)
  await pool.query(
    `
      INSERT INTO staff (user_id, branch_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE branch_id = IFNULL(branch_id, VALUES(branch_id))
    `,
    [staffUserId, booking.branch_id]
  );

  // Bước 4: UPDATE status → 'đã xác nhận'
  await pool.query(
    `UPDATE bookings SET status = 'đã xác nhận', staff_confirm = ? WHERE booking_id = ?`,
    [staffUserId, bookingId]
  );

  // Bước 5: Lấy lại thông tin booking sau khi cập nhật
  const [updatedRows] = await pool.query(
    `
      SELECT
        booking_id AS bookingId,
        booking_code AS bookingCode,
        status,
        check_in_date AS checkInDate,
        check_out_date AS checkOutDate,
        price_at_booking AS totalPrice,
        branch_id AS branchId
      FROM bookings
      WHERE booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  const updated = updatedRows[0];
  const checkInDate = formatDateLocal(updated.checkInDate);
  const checkOutDate = formatDateLocal(updated.checkOutDate);

  return {
    bookingId: updated.bookingId,
    bookingCode: updated.bookingCode,
    status: updated.status,
    checkIn: checkInDate,
    checkOut: checkOutDate,
    totalPrice: Number(updated.totalPrice || 0),
    message: `Đơn ${updated.bookingCode} đã được xác nhận thành công`
  };
};

/**
 * Hủy đơn đặt phòng
 * 
 * @param {object} params
 *   - bookingId: ID booking cần hủy
 *   - userId: ID user yêu cầu hủy
 *   - userRole: Role của user
 * @returns {object} Kết quả hủy
 * @throws {object} Lỗi nếu không có quyền hoặc trạng thái không cho phép
 * 
 * QUY TẮC HỦY:
 * - USER: chỉ hủy được đơn của mình, trạng thái 'chờ xác nhận'
 * - STAFF/ADMIN: hủy được mọi đơn, trạng thái 'chờ xác nhận' hoặc 'đã xác nhận'
 */
const cancelBooking = async ({ bookingId, userId, userRole }) => {
  // Kiểm tra booking tồn tại
  const [bookingRows] = await pool.query(
    `
      SELECT booking_id, booking_code, status, customer_id
      FROM bookings
      WHERE booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  if (!bookingRows[0]) {
    throw { status: 404, message: 'Không tìm thấy đơn đặt phòng', errors: ['booking not found'] };
  }

  const booking = bookingRows[0];

  // Kiểm tra quyền: USER chỉ hủy đơn của mình
  if (userRole === 'USER' && booking.customer_id !== userId) {
    throw { status: 403, message: 'Bạn không có quyền hủy đơn này', errors: ['forbidden'] };
  }

  // Kiểm tra trạng thái cho phép hủy
  const allowedStatuses = userRole === 'USER' ? ['chờ xác nhận'] : ['chờ xác nhận', 'đã xác nhận'];
  if (!allowedStatuses.includes(booking.status)) {
    throw {
      status: 400,
      message: `Không thể hủy đơn này vì đang ở trạng thái "${booking.status}"`,
      errors: ['invalid status']
    };
  }

  // UPDATE status → 'đã hủy'
  await pool.query(
    `UPDATE bookings SET status = 'đã hủy' WHERE booking_id = ?`,
    [bookingId]
  );

  return {
    bookingId: booking.booking_id,
    bookingCode: booking.booking_code,
    status: 'đã hủy',
    message: `Đơn ${booking.booking_code} đã được hủy thành công`
  };
};

/**
 * Nhân viên thực hiện check-in cho booking
 * 
 * @param {object} params
 *   - bookingId: ID booking cần check-in
 *   - staffUserId: ID nhân viên thực hiện
 * @returns {object} Booking sau khi check-in
 * @throws {object} Lỗi nếu booking không tồn tại, không đúng trạng thái
 * 
 * LUỒNG:
 * 1. Kiểm tra booking tồn tại + trạng thái = 'đã xác nhận'
 * 2. Kiểm tra nhân viên có quyền (STAFF hoặc ADMIN)
 * 3. UPDATE status = 'đã check-in', actual_check_in = NOW()
 */
const checkInBooking = async ({ bookingId, staffUserId }) => {
  const [bookingRows] = await pool.query(
    `
      SELECT booking_id, booking_code, status, customer_id, branch_id
      FROM bookings WHERE booking_id = ? LIMIT 1
    `,
    [bookingId]
  );

  if (!bookingRows[0]) {
    throw { status: 404, message: 'Không tìm thấy đơn đặt phòng', errors: ['booking not found'] };
  }

  const booking = bookingRows[0];

  // Chỉ check-in được đơn 'đã xác nhận'
  if (booking.status !== 'đã xác nhận') {
    throw {
      status: 400,
      message: `Không thể check-in vì đơn đang ở trạng thái "${booking.status}"`,
      errors: ['invalid status']
    };
  }

  // Kiểm tra quyền staff
  const [userRows] = await pool.query(
    `SELECT u.role_id, r.role_name FROM users u LEFT JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? LIMIT 1`,
    [staffUserId]
  );

  if (!userRows[0] || (userRows[0].role_name !== 'ADMIN' && userRows[0].role_name !== 'STAFF')) {
    throw { status: 403, message: 'Bạn không có quyền check-in', errors: ['forbidden'] };
  }

  // UPDATE: status + actual_check_in
  await pool.query(
    `UPDATE bookings SET status = 'đã check-in', actual_check_in = NOW() WHERE booking_id = ?`,
    [bookingId]
  );

  return {
    bookingId: booking.booking_id,
    bookingCode: booking.booking_code,
    status: 'đã check-in',
    message: `Đơn ${booking.booking_code} đã được check-in thành công`
  };
};

/**
 * Nhân viên thực hiện check-out cho booking
 * 
 * @param {object} params
 *   - bookingId: ID booking cần check-out
 *   - staffUserId: ID nhân viên thực hiện
 * @returns {object} Booking sau khi check-out
 * @throws {object} Lỗi nếu booking không tồn tại, không đúng trạng thái
 * 
 * LUỒNG:
 * 1. Kiểm tra booking tồn tại + trạng thái = 'đã check-in'
 * 2. Kiểm tra nhân viên có quyền
 * 3. UPDATE status = 'đã check-out', actual_check_out = NOW()
 */
const checkOutBooking = async ({ bookingId, staffUserId }) => {
  const [bookingRows] = await pool.query(
    `
      SELECT booking_id, booking_code, status, customer_id, branch_id
      FROM bookings WHERE booking_id = ? LIMIT 1
    `,
    [bookingId]
  );

  if (!bookingRows[0]) {
    throw { status: 404, message: 'Không tìm thấy đơn đặt phòng', errors: ['booking not found'] };
  }

  const booking = bookingRows[0];

  // Chỉ check-out được đơn 'đã check-in'
  if (booking.status !== 'đã check-in') {
    throw {
      status: 400,
      message: `Không thể check-out vì đơn đang ở trạng thái "${booking.status}"`,
      errors: ['invalid status']
    };
  }

  // Kiểm tra quyền staff
  const [userRows] = await pool.query(
    `SELECT u.role_id, r.role_name FROM users u LEFT JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? LIMIT 1`,
    [staffUserId]
  );

  if (!userRows[0] || (userRows[0].role_name !== 'ADMIN' && userRows[0].role_name !== 'STAFF')) {
    throw { status: 403, message: 'Bạn không có quyền check-out', errors: ['forbidden'] };
  }

  // UPDATE: status + actual_check_out
  await pool.query(
    `UPDATE bookings SET status = 'đã check-out', actual_check_out = NOW() WHERE booking_id = ?`,
    [bookingId]
  );

  return {
    bookingId: booking.booking_id,
    bookingCode: booking.booking_code,
    status: 'đã check-out',
    message: `Đơn ${booking.booking_code} đã được check-out thành công`
  };
};

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  getServiceCatalog,
  getAvailableRooms,
  buildBookingQuote,
  createBooking,
  getBookingList,
  getBookingDetail,
  confirmBooking,
  cancelBooking,
  // Mới: check-in / check-out
  checkInBooking,
  checkOutBooking
};
