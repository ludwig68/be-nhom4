/**
 * =============================================================
 * FILE: backend/src/validators/booking.validator.js
 * MÔ TẢ: Validate + Normalize dữ liệu cho module Đặt phòng
 * 
 * CÁC HÀM CHÍNH:
 * 1. validateAvailableRoomsQuery   → Validate query tìm phòng trống
 * 2. normalizeAvailableRoomsQuery  → Normalize query tìm phòng trống
 * 3. validateBookingQuotePayload   → Validate body tính giá
 * 4. normalizeBookingQuotePayload  → Normalize body tính giá
 * 5. validateCreateBookingPayload  → Validate body tạo booking
 * 6. normalizeCreateBookingPayload → Normalize body tạo booking
 * =============================================================
 */

// Regex patterns
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;    // Email hợp lệ
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;              // YYYY-MM-DD
const PHONE_PATTERN = /^[0-9]{9,15}$/;                    // 9-15 chữ số

/**
 * Kiểm tra object có key cụ thể không
 */
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

/**
 * Kiểm tra số nguyên dương
 */
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

/**
 * Kiểm tra số không âm
 */
const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;

/**
 * Chuẩn hóa serviceIds: loại bỏ trùng, trim, filter rỗng
 * 
 * @param {*} serviceIds - Có thể là mảng hoặc string (cách nhau bởi dấu phẩy)
 * @returns {string[]} Mảng serviceId duy nhất
 * 
 * Ví dụ:
 * - ['break_fast', 'dinner', 'break_fast'] → ['break_fast', 'dinner']
 * - 'break_fast, dinner' → ['break_fast', 'dinner']
 */
const normalizeServiceIds = (serviceIds) => {
  const raw = Array.isArray(serviceIds)
    ? serviceIds
    : (serviceIds ? String(serviceIds).split(',') : []);

  return [...new Set(
    raw
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0)
  )];
};

/**
 * Validate khoảng ngày nhận/trả phòng
 * 
 * @param {string} checkIn - Ngày nhận phòng
 * @param {string} checkOut - Ngày trả phòng
 * @param {string[]} errors - Mảng lỗi (sẽ push thêm vào)
 * 
 * Kiểm tra:
 * - Cả 2 ngày phải có
 * - Đúng format YYYY-MM-DD
 * - checkOut > checkIn
 */
const validateDateRange = (checkIn, checkOut, errors) => {
  if (!checkIn || !checkOut) {
    errors.push('Cần truyền đủ checkIn và checkOut');
    return;
  }

  if (!DATE_PATTERN.test(checkIn)) {
    errors.push('checkIn phải theo định dạng YYYY-MM-DD');
  }

  if (!DATE_PATTERN.test(checkOut)) {
    errors.push('checkOut phải theo định dạng YYYY-MM-DD');
  }

  // Nếu format sai → không cần kiểm tra so sánh ngày
  if (!DATE_PATTERN.test(checkIn) || !DATE_PATTERN.test(checkOut)) {
    return;
  }

  // So sánh ngày
  const checkInDate = new Date(`${checkIn}T00:00:00`);
  const checkOutDate = new Date(`${checkOut}T00:00:00`);

  if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
    errors.push('checkIn/checkOut không hợp lệ');
    return;
  }

  if (checkOutDate <= checkInDate) {
    errors.push('checkOut phải lớn hơn checkIn');
  }
};

// =============================================================
// TÌM PHÒNG TRỐNG
// =============================================================

/**
 * Validate query parameters tìm phòng trống
 */
const validateAvailableRoomsQuery = (query = {}) => {
  const errors = [];

  // Lấy và trim checkIn/checkOut
  const checkIn = String(query.checkIn || '').trim();
  const checkOut = String(query.checkOut || '').trim();

  // Validate ngày
  validateDateRange(checkIn, checkOut, errors);

  // Validate branchId
  if (hasOwn(query, 'branchId') && String(query.branchId || '').trim() !== '') {
    const branchId = Number(query.branchId);
    if (!isPositiveInteger(branchId)) {
      errors.push('branchId phải là số nguyên dương');
    }
  }

  // Validate typeId
  if (hasOwn(query, 'typeId') && String(query.typeId || '').trim() !== '') {
    const typeId = Number(query.typeId);
    if (!isPositiveInteger(typeId)) {
      errors.push('typeId phải là số nguyên dương');
    }
  }

  // Validate capacity
  if (hasOwn(query, 'capacity') && String(query.capacity || '').trim() !== '') {
    const capacity = Number(query.capacity);
    if (!isPositiveInteger(capacity)) {
      errors.push('capacity phải là số nguyên dương');
    }
  }

  // Validate khoảng giá
  if (hasOwn(query, 'minPrice') && String(query.minPrice || '').trim() !== '') {
    const minPrice = Number(query.minPrice);
    if (!isNonNegativeNumber(minPrice)) {
      errors.push('minPrice phải là số không âm');
    }
  }

  if (hasOwn(query, 'maxPrice') && String(query.maxPrice || '').trim() !== '') {
    const maxPrice = Number(query.maxPrice);
    if (!isNonNegativeNumber(maxPrice)) {
      errors.push('maxPrice phải là số không âm');
    }
  }

  // minPrice <= maxPrice
  if (String(query.minPrice || '').trim() !== '' && String(query.maxPrice || '').trim() !== '') {
    const minPrice = Number(query.minPrice);
    const maxPrice = Number(query.maxPrice);
    if (Number.isFinite(minPrice) && Number.isFinite(maxPrice) && minPrice > maxPrice) {
      errors.push('minPrice không được lớn hơn maxPrice');
    }
  }

  // Validate amenityIds
  if (hasOwn(query, 'amenityIds') && String(query.amenityIds || '').trim() !== '') {
    const list = normalizeServiceIds(query.amenityIds);
    const invalid = list.some((id) => !isPositiveInteger(Number(id)));
    if (invalid) {
      errors.push('amenityIds phải là danh sách số nguyên dương');
    }
  }

  return errors;
};

/**
 * Normalize query tìm phòng trống
 */
const normalizeAvailableRoomsQuery = (query = {}) => {
  const filters = {
    checkIn: String(query.checkIn || '').trim(),
    checkOut: String(query.checkOut || '').trim(),
    availableOnly: true // Luôn chỉ lấy phòng trống
  };

  if (String(query.branchId || '').trim() !== '') {
    filters.branchId = Number(query.branchId);
  }

  if (String(query.typeId || '').trim() !== '') {
    filters.typeId = Number(query.typeId);
  }

  if (String(query.capacity || '').trim() !== '') {
    filters.capacity = Number(query.capacity);
  }

  if (String(query.minPrice || '').trim() !== '') {
    filters.minPrice = Number(query.minPrice);
  }

  if (String(query.maxPrice || '').trim() !== '') {
    filters.maxPrice = Number(query.maxPrice);
  }

  if (String(query.amenityIds || '').trim() !== '') {
    filters.amenityIds = normalizeServiceIds(query.amenityIds).map((id) => Number(id));
  }

  return filters;
};

// =============================================================
// TÍNH GIÁ (QUOTE)
// =============================================================

/**
 * Validate body tính giá booking
 */
const validateBookingQuotePayload = (body = {}) => {
  const errors = [];
  const roomId = Number(body.roomId);
  const checkIn = String(body.checkIn || '').trim();
  const checkOut = String(body.checkOut || '').trim();

  // Kiểm tra roomId
  if (!isPositiveInteger(roomId)) {
    errors.push('roomId không hợp lệ');
  }

  // Kiểm tra ngày
  validateDateRange(checkIn, checkOut, errors);

  // Kiểm tra serviceIds (nếu có)
  if (hasOwn(body, 'serviceIds') && body.serviceIds !== undefined && body.serviceIds !== null) {
    const serviceIds = normalizeServiceIds(body.serviceIds);
    const invalid = serviceIds.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id));
    if (invalid) {
      errors.push('serviceIds không hợp lệ');
    }
  }

  return errors;
};

/**
 * Normalize body tính giá
 */
const normalizeBookingQuotePayload = (body = {}) => {
  return {
    roomId: Number(body.roomId),
    checkIn: String(body.checkIn || '').trim(),
    checkOut: String(body.checkOut || '').trim(),
    serviceIds: normalizeServiceIds(body.serviceIds)
  };
};

// =============================================================
// TẠO BOOKING
// =============================================================

/**
 * Validate body tạo booking
 * 
 * Kế thừa validate của quote + thêm kiểm tra thông tin khách hàng
 */
const validateCreateBookingPayload = (body = {}) => {
  // Dùng lại validate của quote (roomId, checkIn, checkOut, serviceIds)
  const errors = validateBookingQuotePayload(body);

  // Thêm kiểm tra thông tin khách hàng
  const customerName = String(body.customerName || '').trim();
  const customerPhone = String(body.customerPhone || '').trim();
  const customerEmail = String(body.customerEmail || '').trim();

  if (customerName.length < 2) {
    errors.push('customerName tối thiểu 2 ký tự');
  }

  if (!PHONE_PATTERN.test(customerPhone)) {
    errors.push('customerPhone không hợp lệ');
  }

  if (!EMAIL_PATTERN.test(customerEmail)) {
    errors.push('customerEmail không hợp lệ');
  }

  return errors;
};

/**
 * Normalize body tạo booking
 */
const normalizeCreateBookingPayload = (body = {}) => {
  const payload = normalizeBookingQuotePayload(body);

  payload.customerName = String(body.customerName || '').trim();
  payload.customerPhone = String(body.customerPhone || '').trim();
  payload.customerEmail = String(body.customerEmail || '').trim();
  payload.note = String(body.note || '').trim();

  return payload;
};

module.exports = {
  validateAvailableRoomsQuery,
  normalizeAvailableRoomsQuery,
  validateBookingQuotePayload,
  normalizeBookingQuotePayload,
  validateCreateBookingPayload,
  normalizeCreateBookingPayload
};
