/**
 * =============================================================
 * FILE: backend/src/services/room.service.js
 * MÔ TẢ: Xử lý logic nghiệp vụ cho module Phòng
 * 
 * NHIỆM VỤ:
 * - Lấy danh sách phòng (có lọc theo nhiều tiêu chí)
 * - Lấy chi tiết 1 phòng (kèm ảnh, tiện nghi, đánh giá)
 * - CRUD phòng (tạo, sửa, xóa) - dành cho admin/staff
 * - Lấy metadata cho bộ lọc tìm phòng
 * 
 * BẢNG LIÊN QUAN:
 * - rooms: phòng thực tế (room_id, room_number, branch_id, type_id, status)
 * - branches: chi nhánh (lấy tên chi nhánh)
 * - room_types: loại phòng (Standard, Superior, Suite, ...)
 * - description_room: mô tả loại phòng
 * - room_amenitites: tiện nghi của loại phòng (lưu ý: typo trong DB)
 * - amenities: danh sách tiện nghi (Wifi, Két an toàn, ...)
 * - room_images: hình ảnh loại phòng
 * - booking_details + bookings: kiểm tra phòng có đang được đặt không
 * - feedbacks: đánh giá từ khách hàng
 * 
 * LUỒNG TÌM PHÒNG TRỐNG:
 * 1. Lọc theo branch, type, capacity, price, amenity
 * 2. Lọc theo trạng thái: status = 'trống'
 * 3. Lọc theo thời gian: không có booking active trùng ngày
 * =============================================================
 */

const pool = require('../config/db');

// Import danh sách trạng thái phòng từ validator
const { ROOM_STATUSES } = require('../validators/room.validator');

/**
 * Danh sách trạng thái booking được coi là "đang active"
 * 
 * Khi kiểm tra phòng có trống không, chỉ cần check các booking
 * có 1 trong các trạng thái này:
 * - 'chờ xác nhận': khách mới đặt, chưa xác nhận
 * - 'đã xác nhận': đã xác nhận, chờ nhận phòng
 * - 'đã check-in': khách đang ở trong phòng
 * 
 * KHÔNG cần check:
 * - 'đã check-out': khách đã trả phòng → phòng trống
 * - 'đã hủy': booking đã hủy → không ảnh hưởng
 */
const ACTIVE_BOOKING_STATUSES = ['chờ xác nhận', 'đã xác nhận', 'đã check-in'];

/**
 * Câu SQL chung để lấy thông tin phòng (dùng cho cả danh sách và chi tiết)
 * 
 * JOIN các bảng:
 * - rooms → branches: lấy tên chi nhánh
 * - rooms → room_types: lấy tên loại phòng, giá, sức chứa
 * - room_types → description_room: lấy mô tả loại phòng
 * 
 * Alias (AS): chuyển tên cột DB → camelCase cho frontend
 */
const SELECT_ROOM_COLUMNS = `
  SELECT
    r.room_id AS roomId,
    r.room_number AS roomNumber,
    r.branch_id AS branchId,
    b.branch_name AS branchName,
    r.type_id AS typeId,
    r.status AS status,
    rt.type_name AS roomType,
    rt.base_price AS pricePerNight,
    rt.capacity AS capacity,
    dr.description_room AS description
  FROM rooms r
  LEFT JOIN branches b ON r.branch_id = b.branch_id
  LEFT JOIN room_types rt ON r.type_id = rt.type_id
  LEFT JOIN description_room dr ON rt.description_room = dr.id_des_room
`;

/**
 * Lấy danh sách tiện nghi của các loại phòng
 * 
 * @param {number[]} typeIds - Mảng ID loại phòng cần lấy tiện nghi
 * @returns {Map<number, Array<{amenityId, amenityName}>>}
 *   Map: typeId → mảng tiện nghi
 * 
 * SQL giải thích:
 * - room_amenitites: bảng trung gian nối room_types với amenities
 *   (lưu ý: typo trong DB - đúng ra là room_amenities)
 * - id_room trong bảng này thực chất là type_id (FK trỏ đến room_types)
 * - GROUP BY typeId: gom tiện nghi theo loại phòng
 * 
 * Ví dụ kết quả:
 * Map {
 *   1 => [{ amenityId: 1, amenityName: 'Wifi' }, { amenityId: 5, amenityName: 'Tủ lạnh mini' }],
 *   2 => [{ amenityId: 1, amenityName: 'Wifi' }, { amenityId: 2, amenityName: 'Két an toàn' }]
 * }
 */
const getTypeAmenitiesMap = async (typeIds = []) => {
  if (!typeIds.length) {
    return new Map();
  }

  // Tạo placeholder cho mảng: [1, 2, 3] → '?, ?, ?'
  const placeholders = typeIds.map(() => '?').join(', ');
  
  const [rows] = await pool.query(
    `
      SELECT
        ra.id_room AS typeId,
        a.id_amenitites AS amenityId,
        a.description AS amenityName
      FROM room_amenitites ra
      INNER JOIN amenities a ON a.id_amenitites = ra.id_amenities
      WHERE ra.id_room IN (${placeholders})
      ORDER BY a.id_amenitites ASC
    `,
    typeIds
  );

  // Gom nhóm tiện nghi theo typeId
  const map = new Map();
  rows.forEach((row) => {
    const key = Number(row.typeId);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push({
      amenityId: Number(row.amenityId),
      amenityName: row.amenityName
    });
  });

  return map;
};

/**
 * Lấy danh sách hình ảnh của các loại phòng
 * 
 * @param {number[]} typeIds - Mảng ID loại phòng
 * @returns {Map<number, Array<{imageId, imageUrl}>>}
 */
const getTypeImagesMap = async (typeIds = []) => {
  if (!typeIds.length) {
    return new Map();
  }

  const placeholders = typeIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `
      SELECT image_id AS imageId, room_type_id AS typeId, image_url AS imageUrl
      FROM room_images
      WHERE room_type_id IN (${placeholders})
      ORDER BY image_id ASC
    `,
    typeIds
  );

  const map = new Map();
  rows.forEach((row) => {
    const key = Number(row.typeId);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push({
      imageId: Number(row.imageId),
      imageUrl: row.imageUrl
    });
  });

  return map;
};

/**
 * Lấy danh sách phòng (có lọc theo nhiều tiêu chí)
 * 
 * @param {object} filters - Bộ lọc
 *   - branchId: lọc theo chi nhánh
 *   - typeId: lọc theo loại phòng
 *   - capacity: sức chứa tối thiểu
 *   - minPrice/maxPrice: khoảng giá
 *   - amenityIds: mảng ID tiện nghi cần có
 *   - checkIn/checkOut: khoảng thời gian (kiểm tra phòng trống)
 *   - availableOnly: chỉ lấy phòng trống (status = 'trống')
 *   - status: lọc theo trạng thái cụ thể
 * @returns {object[]} Mảng phòng đã lọc
 * 
 * LUỒNG XỬ LÝ:
 * 1. Xây dựng điều kiện WHERE động dựa trên filters
 * 2. Query rooms + JOIN branches, room_types, description_room
 * 3. Query tiện nghi và hình ảnh (song song)
 * 4. Gộp dữ liệu: gắn amenities + images vào từng phòng
 */
const getAllRooms = async (filters = {}) => {
  // Mảng điều kiện WHERE, bắt đầu với '1 = 1' (luôn đúng)
  // Để dễ thêm điều kiện sau bằng 'AND'
  const conditions = ['1 = 1'];
  const values = []; // Mảng giá trị thay thế cho placeholder (?)

  // Lọc theo chi nhánh
  if (filters.branchId) {
    conditions.push('r.branch_id = ?');
    values.push(filters.branchId);
  }

  // Lọc theo trạng thái phòng
  if (filters.status) {
    conditions.push('r.status = ?');
    values.push(filters.status);
  }

  // Chỉ lấy phòng trống (status = 'trống')
  if (filters.availableOnly) {
    conditions.push(`r.status = 'trống'`);
  }

  // Lọc theo loại phòng
  if (filters.typeId) {
    conditions.push('r.type_id = ?');
    values.push(filters.typeId);
  }

  // Lọc theo sức chứa tối thiểu
  if (filters.capacity) {
    conditions.push('rt.capacity >= ?');
    values.push(filters.capacity);
  }

  // Lọc theo khoảng giá
  if (Number.isFinite(filters.minPrice)) {
    conditions.push('rt.base_price >= ?');
    values.push(filters.minPrice);
  }
  if (Number.isFinite(filters.maxPrice)) {
    conditions.push('rt.base_price <= ?');
    values.push(filters.maxPrice);
  }

  // Lọc theo tiện nghi (phòng phải có TẤT CẢ tiện nghi trong danh sách)
  if (Array.isArray(filters.amenityIds) && filters.amenityIds.length > 0) {
    filters.amenityIds.forEach((amenityId) => {
      // EXISTS: kiểm tra có ít nhất 1 dòng thỏa điều kiện
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM room_amenitites ra
          WHERE ra.id_room = r.type_id AND ra.id_amenities = ?
        )
      `);
      values.push(amenityId);
    });
  }

  // Lọc theo khoảng thời gian: phòng không có booking active trùng ngày
  if (filters.checkIn && filters.checkOut) {
    const bookingStatusPlaceholders = ACTIVE_BOOKING_STATUSES.map(() => '?').join(', ');
    conditions.push(`
      NOT EXISTS (
        SELECT 1
        FROM booking_details bd
        INNER JOIN bookings bk ON bk.booking_id = bd.booking_id
        WHERE bd.room_id = r.room_id
          AND bk.status IN (${bookingStatusPlaceholders})
          AND bk.check_in_date < ?
          AND bk.check_out_date > ?
      )
    `);
    // Thứ tự values: status placeholders, checkOut, checkIn
    values.push(
      ...ACTIVE_BOOKING_STATUSES,
      `${filters.checkOut} 12:00:00`,  // check_out: giờ trả phòng 12:00
      `${filters.checkIn} 14:00:00`    // check_in: giờ nhận phòng 14:00
    );
  }

  // Thực thi query
  const [rows] = await pool.query(
    `${SELECT_ROOM_COLUMNS} WHERE ${conditions.join(' AND ')} ORDER BY rt.base_price ASC, r.room_id DESC`,
    values
  );

  // Lấy danh sách typeId duy nhất từ kết quả (để query amenities + images)
  const typeIds = [...new Set(rows.map((row) => Number(row.typeId)).filter((value) => Number.isInteger(value) && value > 0))];
  
  // Query amenities và images SONG SONG (Promise.all) để nhanh hơn
  const [amenitiesMap, imagesMap] = await Promise.all([
    getTypeAmenitiesMap(typeIds),
    getTypeImagesMap(typeIds)
  ]);

  // Gắn amenities + images vào từng phòng
  return rows.map((room) => ({
    ...room,
    amenities: amenitiesMap.get(Number(room.typeId)) || [],
    images: imagesMap.get(Number(room.typeId)) || [],
    // isAvailable: true nếu có checkIn/checkOut (đã lọc ở query)
    // hoặc status = 'trống' nếu không có filter thời gian
    isAvailable: filters.checkIn && filters.checkOut ? true : room.status === 'trống'
  }));
};

/**
 * Lấy chi tiết 1 phòng theo ID
 * 
 * @param {number} roomId - ID phòng cần lấy
 * @param {object} options - Tùy chọn (chưa dùng)
 * @returns {object|null} Thông tin chi tiết phòng hoặc null
 * 
 * Bao gồm:
 * - Thông tin cơ bản (số phòng, chi nhánh, loại, giá, ...)
 * - Tất cả giá theo mùa (sunday, peak, peak sunday, hourly)
 * - Danh sách tiện nghi
 * - Danh sách hình ảnh
 * - Thống kê đánh giá (tổng số, điểm trung bình)
 * - Danh sách đánh giá chi tiết
 */
const getRoomById = async (roomId, options = {}) => {
  const [rows] = await pool.query(
    `
      SELECT
        r.room_id AS roomId,
        r.room_number AS roomNumber,
        r.branch_id AS branchId,
        b.branch_name AS branchName,
        b.address AS branchAddress,
        r.type_id AS typeId,
        r.status AS status,
        rt.type_name AS roomType,
        rt.base_price AS basePrice,
        rt.price_sunday_normal AS sundayPrice,
        rt.price_peak_season AS peakSeasonPrice,
        rt.price_peak_sunday AS peakSundayPrice,
        rt.price_hour AS hourlyPrice,
        rt.capacity AS capacity,
        dr.description_room AS description
      FROM rooms r
      LEFT JOIN branches b ON r.branch_id = b.branch_id
      LEFT JOIN room_types rt ON r.type_id = rt.type_id
      LEFT JOIN description_room dr ON rt.description_room = dr.id_des_room
      WHERE r.room_id = ?
      LIMIT 1
    `,
    [roomId]
  );

  const room = rows[0] || null;
  if (!room) {
    return null;
  }

  const typeId = Number(room.typeId);

  // Query 4 bảng con SONG SONG để tối ưu hiệu suất
  const [amenitiesRows, imagesRows, reviewStatsRows, reviewsRows] = await Promise.all([
    // 1. Tiện nghi của loại phòng
    pool.query(
      `
        SELECT a.id_amenitites AS amenityId, a.description AS amenityName
        FROM room_amenitites ra
        INNER JOIN amenities a ON a.id_amenitites = ra.id_amenities
        WHERE ra.id_room = ?
        ORDER BY a.id_amenitites ASC
      `,
      [typeId]
    ),
    // 2. Hình ảnh của loại phòng
    pool.query(
      `
        SELECT image_id AS imageId, image_url AS imageUrl
        FROM room_images
        WHERE room_type_id = ?
        ORDER BY image_id ASC
      `,
      [typeId]
    ),
    // 3. Thống kê đánh giá (tổng số + điểm trung bình)
    pool.query(
      `
        SELECT
          COUNT(DISTINCT f.feedback_id) AS totalReviews,
          ROUND(AVG(f.rating), 1) AS averageRating
        FROM feedbacks f
        INNER JOIN bookings bk ON bk.booking_id = f.booking_id
        INNER JOIN booking_details bd ON bd.booking_id = bk.booking_id
        WHERE bd.room_id = ?
      `,
      [roomId]
    ),
    // 4. Danh sách đánh giá chi tiết
    pool.query(
      `
        SELECT
          f.feedback_id AS feedbackId,
          f.rating AS rating,
          f.comment AS comment,
          f.created_at AS createdAt,
          COALESCE(u.full_name, u.username, 'Khách hàng') AS customerName
        FROM feedbacks f
        INNER JOIN bookings bk ON bk.booking_id = f.booking_id
        INNER JOIN booking_details bd ON bd.booking_id = bk.booking_id
        LEFT JOIN users u ON u.user_id = f.customer_id
        WHERE bd.room_id = ?
        ORDER BY f.created_at DESC
      `,
      [roomId]
    )
  ]);

  // Parse kết quả
  const amenities = amenitiesRows[0] || [];
  const images = imagesRows[0] || [];
  const reviewStats = reviewStatsRows[0]?.[0] || { totalReviews: 0, averageRating: null };
  const reviews = reviewsRows[0] || [];

  return {
    ...room,
    amenities,
    images,
    reviews,
    reviewStats: {
      totalReviews: Number(reviewStats.totalReviews || 0),
      averageRating: reviewStats.averageRating === null ? null : Number(reviewStats.averageRating)
    }
  };
};

/**
 * Tạo phòng mới
 * 
 * @param {object} payload - { roomNumber, branchId, typeId, status }
 * @returns {object} Thông tin phòng vừa tạo
 */
const createRoom = async (payload) => {
  const [result] = await pool.query(
    `
      INSERT INTO rooms
      (room_number, branch_id, type_id, status)
      VALUES (?, ?, ?, ?)
    `,
    [
      payload.roomNumber,
      payload.branchId,
      payload.typeId,
      payload.status
    ]
  );

  // Trả về phòng vừa tạo (lấy theo insertId)
  return getRoomById(result.insertId);
};

/**
 * Cập nhật thông tin phòng
 * 
 * @param {number} roomId - ID phòng cần cập nhật
 * @param {object} payload - Các trường cần cập nhật
 * @returns {object|null} Thông tin phòng sau khi cập nhật
 */
const updateRoom = async (roomId, payload) => {
  // Mapping từ tên field frontend → tên cột DB
  const fieldToColumn = {
    roomNumber: 'room_number',
    branchId: 'branch_id',
    typeId: 'type_id',
    status: 'status'
  };

  // Xây dựng dynamic SET clause
  const assignments = [];
  const values = [];

  Object.keys(payload).forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(fieldToColumn, field)) {
      return; // Bỏ qua field không hợp lệ
    }
    assignments.push(`${fieldToColumn[field]} = ?`);
    values.push(payload[field]);
  });

  // Nếu không có trường nào hợp lệ → trả về phòng hiện tại
  if (assignments.length === 0) {
    return getRoomById(roomId);
  }

  values.push(roomId); // WHERE room_id = ?
  const [result] = await pool.query(
    `UPDATE rooms SET ${assignments.join(', ')} WHERE room_id = ?`,
    values
  );

  // affectedRows = 0 → không có dòng nào được cập nhật (ID không tồn tại)
  if (result.affectedRows === 0) {
    return null;
  }

  return getRoomById(roomId);
};

/**
 * Xóa phòng
 * 
 * @param {number} roomId - ID phòng cần xóa
 * @returns {boolean} true nếu xóa thành công
 */
const deleteRoom = async (roomId) => {
  const [result] = await pool.query(
    `DELETE FROM rooms WHERE room_id = ?`,
    [roomId]
  );

  return result.affectedRows > 0;
};

/**
 * Lấy metadata cho bộ lọc tìm phòng
 * 
 * @returns {object} { branches, roomTypes, amenities, statuses }
 * 
 * Dữ liệu dùng để populate dropdown/filter trên frontend:
 * - branches: danh sách chi nhánh đang hoạt động
 * - roomTypes: danh sách loại phòng
 * - amenities: danh sách tiện nghi
 * - statuses: danh sách trạng thái phòng
 */
const getRoomSearchMeta = async () => {
  const [branchesRows, roomTypesRows, amenitiesRows] = await Promise.all([
    // Chi nhánh đang hoạt động
    pool.query(
      `
        SELECT branch_id AS branchId, branch_name AS branchName
        FROM branches
        WHERE is_active = 1
        ORDER BY branch_name ASC
      `
    ),
    // Loại phòng
    pool.query(
      `
        SELECT type_id AS typeId, type_name AS typeName, base_price AS basePrice, capacity
        FROM room_types
        ORDER BY base_price ASC
      `
    ),
    // Tiện nghi
    pool.query(
      `
        SELECT id_amenitites AS amenityId, description AS amenityName
        FROM amenities
        ORDER BY id_amenitites ASC
      `
    )
  ]);

  return {
    branches: branchesRows[0] || [],
    roomTypes: roomTypesRows[0] || [],
    amenities: amenitiesRows[0] || [],
    statuses: ROOM_STATUSES
  };
};

module.exports = {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomSearchMeta
};
