/**
 * =============================================================
 * FILE: backend/src/services/branch.service.js
 * MÔ TẢ: Xử lý logic nghiệp vụ cho module Chi nhánh
 * 
 * NHIỆM VỤ:
 * - Query database lấy danh sách chi nhánh
 * - Query database lấy chi tiết 1 chi nhánh theo ID
 * 
 * BẢNG LIÊN QUAN:
 * - branches: chứa thông tin chi nhánh (tên, địa chỉ, SĐT, ...)
 * 
 * LUỒNG DATA:
 * Controller → Service → Database → Service → Controller
 * =============================================================
 */

// Pool kết nối database
const pool = require('../config/db');

/**
 * Lấy danh sách tất cả chi nhánh đang hoạt động
 * 
 * @returns {object[]} Mảng chi nhánh đang active
 * 
 * SQL giải thích:
 * - SELECT các cột cần thiết (không SELECT tất cả *)
 * - WHERE is_active = 1: chỉ lấy chi nhánh đang hoạt động
 * - Alias (AS branchId): chuyển snake_case DB → camelCase JSON
 *   → Frontend dùng branchId thay vì branch_id
 */
const getAllBranches = async () => {
  const [rows] = await pool.query(
    `SELECT 
       branch_id AS branchId, 
       branch_name AS branchName, 
       address, 
       phone, 
       email, 
       description, 
       is_active 
     FROM branches 
     WHERE is_active = 1`
  );
  return rows;
};

/**
 * Lấy chi tiết 1 chi nhánh theo ID
 * 
 * @param {number} branchId - ID chi nhánh cần lấy
 * @returns {object|null} Thông tin chi nhánh hoặc null nếu không tìm thấy
 * 
 * Lưu ý:
 * - Dùng parameterized query (?) để chống SQL injection
 * - rows[0] vì branch_id là PRIMARY KEY → tối đa 1 kết quả
 * - rows[0] || null: nếu không có → trả null thay vì undefined
 */
const getBranchById = async (branchId) => {
  const [rows] = await pool.query(
    `SELECT 
       branch_id AS branchId, 
       branch_name AS branchName, 
       address, 
       phone, 
       email, 
       description, 
       is_active 
     FROM branches 
     WHERE branch_id = ?`,
    [branchId]
  );
  return rows[0] || null;
};

module.exports = {
  getAllBranches,
  getBranchById
};
