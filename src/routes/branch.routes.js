/**
 * =============================================================
 * FILE: backend/src/routes/branch.routes.js
 * MÔ TẢ: Định nghĩa route cho module Chi nhánh
 * 
 * PREFIX: /api/branches
 * 
 * API:
 * - GET /api/branches       → Danh sách chi nhánh (public)
 * - GET /api/branches/:id   → Chi tiết chi nhánh (public)
 * 
 * KHÔNG CẦN ĐĂNG NHẬP: ai cũng có thể xem chi nhánh
 * =============================================================
 */

const express = require('express');
const branchController = require('../controllers/branch.controller');

const router = express.Router();

// GET /api/branches  →  Danh sách tất cả chi nhánh đang hoạt động
router.get('/', branchController.getAllBranches);

// GET /api/branches/:id  →  Chi tiết chi nhánh theo ID
// :id là route parameter, ví dụ: /api/branches/1 → req.params.id = '1'
router.get('/:id', branchController.getBranchById);

module.exports = router;
