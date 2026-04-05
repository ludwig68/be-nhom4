/**
 * =============================================================
 * FILE: backend/src/validators/room.validator.js
 * MÔ TẢ: Validate + Normalize dữ liệu cho module Phòng
 * 
 * NHIỆM VỤ:
 * 1. VALIDATE: Kiểm tra dữ liệu có hợp lệ không → trả mảng lỗi
 * 2. NORMALIZE: Chuẩn hóa dữ liệu (ép kiểu, trim, filter) → trả object sạch
 * 
 * TẠI SAO TÁCH RIÊNG VALIDATE VÀ NORMALIZE?
 * - Validate: kiểm tra TRƯỚC khi xử lý → báo lỗi sớm
 * - Normalize: làm sạch dữ liệu → service nhận data đã sạch
 * - Separation of concerns: mỗi hàm 1 nhiệm vụ
 * =============================================================
 */

/**
 * Danh sách tất cả trạng thái hợp lệ của phòng
 * 
 * Dùng để validate: nếu client gửi status khác danh sách này → lỗi
 */
const ROOM_STATUSES = ['trống', 'đã đặt', 'đang ở', 'đang dọn', 'bảo trì'];

// Regex kiểm tra định dạng ngày: YYYY-MM-DD
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kiểm tra xem object có chứa key cụ thể không
 * Dùng thay cho Object.hasOwnProperty (an toàn hơn)
 */
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

/**
 * Kiểm tra số nguyên dương (> 0)
 */
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

/**
 * Kiểm tra số không âm (>= 0)
 */
const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;

/**
 * Kiểm tra giá trị có thể chuyển thành boolean không
 */
const isBooleanLike = (value) => ['1', '0', 'true', 'false', 1, 0, true, false].includes(value);

// =============================================================
// NORMALIZE FUNCTIONS (chuẩn hóa dữ liệu)
// =============================================================

/**
 * Chuẩn hóa dữ liệu tạo phòng mới
 * 
 * @param {object} body - req.body từ client
 * @returns {object} Dữ liệu đã chuẩn hóa
 * 
 * Xử lý:
 * - roomNumber: trim khoảng trắng
 * - branchId/typeId: ép thành số
 * - status: mặc định 'trống' nếu không có
 */
const normalizeCreateRoomPayload = (body) => {
  return {
    roomNumber: String(body.roomNumber || '').trim(),
    branchId: Number(body.branchId),
    typeId: Number(body.typeId),
    status: body.status ? String(body.status).trim() : 'trống'
  };
};

/**
 * Chuẩn hóa dữ liệu cập nhật phòng
 * 
 * Chỉ lấy các field hợp lệ, bỏ qua field lạ
 */
const normalizeUpdateRoomPayload = (body) => {
  const payload = {};

  // Chỉ chấp nhận các field được phép update
  if (hasOwn(body, 'roomNumber')) payload.roomNumber = String(body.roomNumber || '').trim();
  if (hasOwn(body, 'branchId')) payload.branchId = Number(body.branchId);
  if (hasOwn(body, 'typeId')) payload.typeId = Number(body.typeId);
  if (hasOwn(body, 'status')) payload.status = String(body.status || '').trim();

  return payload;
};

// =============================================================
// VALIDATE FUNCTIONS (kiểm tra hợp lệ)
// =============================================================

/**
 * Validate ID phòng
 * 
 * @param {*} roomId - ID cần kiểm tra
 * @returns {string[]} Mảng lỗi (rỗng = hợp lệ)
 */
const validateRoomId = (roomId) => {
  const errors = [];
  const parsed = Number(roomId);

  if (!isPositiveInteger(parsed)) {
    errors.push('roomId không hợp lệ');
  }

  return errors;
};

/**
 * Validate query parameters tìm kiếm phòng
 * 
 * @param {object} query - req.query từ client
 * @returns {string[]} Mảng lỗi
 * 
 * Kiểm tra:
 * - branchId, typeId, capacity: số nguyên dương
 * - minPrice, maxPrice: số không âm
 * - minPrice <= maxPrice
 * - checkIn/checkOut: đúng format, checkOut > checkIn
 * - amenityIds: mảng số nguyên dương
 * - status: thuộc danh sách ROOM_STATUSES
 * - availableOnly: boolean hoặc 0/1
 */
const validateRoomQuery = (query = {}) => {
  const errors = [];

  // Kiểm tra branchId
  if (hasOwn(query, 'branchId') && query.branchId !== undefined && query.branchId !== null && String(query.branchId).trim() !== '') {
    const branchId = Number(query.branchId);
    if (!isPositiveInteger(branchId)) {
      errors.push('branchId phải là số nguyên dương');
    }
  }

  // Kiểm tra typeId
  if (hasOwn(query, 'typeId') && query.typeId !== undefined && query.typeId !== null && String(query.typeId).trim() !== '') {
    const typeId = Number(query.typeId);
    if (!isPositiveInteger(typeId)) {
      errors.push('typeId phải là số nguyên dương');
    }
  }

  // Kiểm tra capacity
  if (hasOwn(query, 'capacity') && query.capacity !== undefined && query.capacity !== null && String(query.capacity).trim() !== '') {
    const capacity = Number(query.capacity);
    if (!isPositiveInteger(capacity)) {
      errors.push('capacity phải là số nguyên dương');
    }
  }

  // Kiểm tra khoảng giá
  if (hasOwn(query, 'minPrice') && query.minPrice !== undefined && query.minPrice !== null && String(query.minPrice).trim() !== '') {
    const minPrice = Number(query.minPrice);
    if (!isNonNegativeNumber(minPrice)) {
      errors.push('minPrice phải là số không âm');
    }
  }

  if (hasOwn(query, 'maxPrice') && query.maxPrice !== undefined && query.maxPrice !== null && String(query.maxPrice).trim() !== '') {
    const maxPrice = Number(query.maxPrice);
    if (!isNonNegativeNumber(maxPrice)) {
      errors.push('maxPrice phải là số không âm');
    }
  }

  // Kiểm tra minPrice <= maxPrice
  const hasMinPrice = hasOwn(query, 'minPrice') && String(query.minPrice || '').trim() !== '';
  const hasMaxPrice = hasOwn(query, 'maxPrice') && String(query.maxPrice || '').trim() !== '';
  if (hasMinPrice && hasMaxPrice) {
    const minPrice = Number(query.minPrice);
    const maxPrice = Number(query.maxPrice);
    if (Number.isFinite(minPrice) && Number.isFinite(maxPrice) && minPrice > maxPrice) {
      errors.push('minPrice không được lớn hơn maxPrice');
    }
  }

  // Kiểm tra checkIn/checkOut
  const hasCheckIn = hasOwn(query, 'checkIn') && String(query.checkIn || '').trim() !== '';
  const hasCheckOut = hasOwn(query, 'checkOut') && String(query.checkOut || '').trim() !== '';
  if (hasCheckIn !== hasCheckOut) {
    errors.push('Cần truyền đủ checkIn và checkOut');
  }

  if (hasCheckIn && hasCheckOut) {
    const checkIn = String(query.checkIn).trim();
    const checkOut = String(query.checkOut).trim();

    if (!DATE_PATTERN.test(checkIn)) {
      errors.push('checkIn phải theo định dạng YYYY-MM-DD');
    }

    if (!DATE_PATTERN.test(checkOut)) {
      errors.push('checkOut phải theo định dạng YYYY-MM-DD');
    }

    if (DATE_PATTERN.test(checkIn) && DATE_PATTERN.test(checkOut)) {
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
        errors.push('checkIn/checkOut không hợp lệ');
      } else if (checkOutDate <= checkInDate) {
        errors.push('checkOut phải lớn hơn checkIn');
      }
    }
  }

  // Kiểm tra amenityIds
  if (hasOwn(query, 'amenityIds') && query.amenityIds !== undefined && query.amenityIds !== null && String(query.amenityIds).trim() !== '') {
    const amenityList = Array.isArray(query.amenityIds)
      ? query.amenityIds
      : String(query.amenityIds).split(',');

    const invalidAmenityId = amenityList.some((item) => !isPositiveInteger(Number(String(item).trim())));
    if (invalidAmenityId) {
      errors.push('amenityIds phải là danh sách số nguyên dương');
    }
  }

  // Kiểm tra status
  if (hasOwn(query, 'status') && query.status !== undefined && query.status !== null && String(query.status).trim() !== '') {
    const status = String(query.status).trim();
    if (!ROOM_STATUSES.includes(status)) {
      errors.push(`status phải thuộc: ${ROOM_STATUSES.join(', ')}`);
    }
  }

  // Kiểm tra availableOnly
  if (hasOwn(query, 'availableOnly') && query.availableOnly !== undefined && query.availableOnly !== null && String(query.availableOnly).trim() !== '') {
    if (!isBooleanLike(query.availableOnly)) {
      errors.push('availableOnly phải là boolean hoặc 0/1');
    }
  }

  return errors;
};

/**
 * Chuẩn hóa query parameters tìm kiếm phòng
 * 
 * @param {object} query - req.query từ client
 * @returns {object} Filters đã chuẩn hóa
 * 
 * Xử lý:
 * - Ép kiểu số cho các field numeric
 * - Chuyển amenityIds string → mảng số
 * - Chuyển availableOnly string → boolean
 * - Bỏ qua field trống
 */
const normalizeRoomQuery = (query = {}) => {
  const filters = {};

  if (hasOwn(query, 'branchId') && query.branchId !== undefined && query.branchId !== null && String(query.branchId).trim() !== '') {
    filters.branchId = Number(query.branchId);
  }

  if (hasOwn(query, 'typeId') && query.typeId !== undefined && query.typeId !== null && String(query.typeId).trim() !== '') {
    filters.typeId = Number(query.typeId);
  }

  if (hasOwn(query, 'capacity') && query.capacity !== undefined && query.capacity !== null && String(query.capacity).trim() !== '') {
    filters.capacity = Number(query.capacity);
  }

  if (hasOwn(query, 'minPrice') && query.minPrice !== undefined && query.minPrice !== null && String(query.minPrice).trim() !== '') {
    filters.minPrice = Number(query.minPrice);
  }

  if (hasOwn(query, 'maxPrice') && query.maxPrice !== undefined && query.maxPrice !== null && String(query.maxPrice).trim() !== '') {
    filters.maxPrice = Number(query.maxPrice);
  }

  if (hasOwn(query, 'checkIn') && String(query.checkIn || '').trim() !== '' && hasOwn(query, 'checkOut') && String(query.checkOut || '').trim() !== '') {
    filters.checkIn = String(query.checkIn).trim();
    filters.checkOut = String(query.checkOut).trim();
  }

  if (hasOwn(query, 'amenityIds') && query.amenityIds !== undefined && query.amenityIds !== null && String(query.amenityIds).trim() !== '') {
    const amenityList = Array.isArray(query.amenityIds)
      ? query.amenityIds
      : String(query.amenityIds).split(',');

    filters.amenityIds = [...new Set(
      amenityList
        .map((item) => Number(String(item).trim()))
        .filter((value) => isPositiveInteger(value))
    )];
  }

  if (hasOwn(query, 'status') && query.status !== undefined && query.status !== null && String(query.status).trim() !== '') {
    filters.status = String(query.status).trim();
  }

  if (hasOwn(query, 'availableOnly') && query.availableOnly !== undefined && query.availableOnly !== null && String(query.availableOnly).trim() !== '') {
    const raw = query.availableOnly;
    filters.availableOnly = raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true';
  }

  return filters;
};

/**
 * Validate dữ liệu tạo phòng mới
 */
const validateCreateRoom = (body) => {
  const errors = [];
  const payload = normalizeCreateRoomPayload(body);

  if (!payload.roomNumber || payload.roomNumber.length < 1) {
    errors.push('roomNumber là bắt buộc');
  } else if (payload.roomNumber.length > 10) {
    errors.push('roomNumber tối đa 10 ký tự');
  }

  if (!isPositiveInteger(payload.branchId)) {
    errors.push('branchId phải là số nguyên dương');
  }

  if (!isPositiveInteger(payload.typeId)) {
    errors.push('typeId phải là số nguyên dương');
  }

  if (!ROOM_STATUSES.includes(payload.status)) {
    errors.push(`status phải thuộc: ${ROOM_STATUSES.join(', ')}`);
  }

  return errors;
};

/**
 * Validate dữ liệu cập nhật phòng
 * 
 * Kiểm tra: ít nhất 1 field hợp lệ, mỗi field đúng format
 */
const validateUpdateRoom = (body) => {
  const errors = [];
  const payload = normalizeUpdateRoomPayload(body);
  const keys = Object.keys(payload);

  // Phải có ít nhất 1 trường để cập nhật
  if (keys.length === 0) {
    errors.push('Cần ít nhất một trường để cập nhật');
    return errors;
  }

  if (hasOwn(payload, 'roomNumber')) {
    if (!payload.roomNumber || payload.roomNumber.length < 1) {
      errors.push('roomNumber là bắt buộc');
    } else if (payload.roomNumber.length > 10) {
      errors.push('roomNumber tối đa 10 ký tự');
    }
  }

  if (hasOwn(payload, 'branchId') && !isPositiveInteger(payload.branchId)) {
    errors.push('branchId phải là số nguyên dương');
  }

  if (hasOwn(payload, 'typeId') && !isPositiveInteger(payload.typeId)) {
    errors.push('typeId phải là số nguyên dương');
  }

  if (hasOwn(payload, 'status') && !ROOM_STATUSES.includes(payload.status)) {
    errors.push(`status phải thuộc: ${ROOM_STATUSES.join(', ')}`);
  }

  return errors;
};

module.exports = {
  ROOM_STATUSES,
  normalizeCreateRoomPayload,
  normalizeUpdateRoomPayload,
  normalizeRoomQuery,
  validateRoomId,
  validateRoomQuery,
  validateCreateRoom,
  validateUpdateRoom
};
