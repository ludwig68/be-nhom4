/**
 * =============================================================
 * FILE: backend/src/controllers/branch.controller.js
 * MÔ TẢ: Controller xử lý HTTP request cho module Chi nhánh
 * 
 * API:
 * - GET /api/branches       → Danh sách chi nhánh
 * - GET /api/branches/:id   → Chi tiết chi nhánh
 * =============================================================
 */

// Import service chứa logic nghiệp vụ
const branchService = require('../services/branch.service');

// Import hàm tạo response chuẩn
const { successResponse, errorResponse } = require('../utils/response');

/**
 * API: LẤY DANH SÁCH CHI NHÁNH
 * GET /api/branches
 * Không cần đăng nhập (public)
 */
const getAllBranches = async (req, res) => {
  try {
    // Gọi service lấy dữ liệu từ DB
    const branches = await branchService.getAllBranches();
    // Trả về JSON thành công
    return successResponse(res, 'Lấy danh sách chi nhánh thành công', branches);
  } catch (error) {
    // Lỗi database hoặc lỗi khác → trả 500
    return errorResponse(res, error.message || 'Lỗi lấy danh sách chi nhánh', [], 500);
  }
};

/**
 * API: LẤY CHI TIẾT CHI NHÁNH
 * GET /api/branches/:id
 * Ví dụ: GET /api/branches/1 → lấy chi nhánh có id = 1
 * 
 * Không cần đăng nhập (public)
 */
const getBranchById = async (req, res) => {
  try {
    // req.params.id: ID lấy từ URL
    // Ví dụ: /api/branches/1 → req.params.id = '1' (string)
    const branchId = req.params.id;
    
    // Gọi service lấy chi tiết chi nhánh
    const branch = await branchService.getBranchById(branchId);

    // Nếu không tìm thấy chi nhánh → trả lỗi 404
    if (!branch) {
      return errorResponse(res, 'Không tìm thấy chi nhánh', [], 404);
    }

    // Trả về thông tin chi nhánh
    return successResponse(res, 'Lấy thông tin chi nhánh thành công', branch);
  } catch (error) {
    return errorResponse(res, error.message || 'Lỗi lấy thông tin chi nhánh', [], 500);
  }
};

module.exports = {
  getAllBranches,
  getBranchById
};
