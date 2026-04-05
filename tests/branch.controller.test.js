jest.mock('../src/services/branch.service', () => ({
  getAllBranches: jest.fn(),
  getBranchById: jest.fn()
}))

const branchController = require('../src/controllers/branch.controller')
const branchService = require('../src/services/branch.service')
const { createMockResponse } = require('./helpers/http')

describe('branch.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('getAllBranches success -> 200', async () => {
    const req = {}
    const res = createMockResponse()
    const branches = [{ branch_id: 1, branch_name: 'CN 1' }]

    branchService.getAllBranches.mockResolvedValue(branches)

    await branchController.getAllBranches(req, res)

    expect(branchService.getAllBranches).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: branches
      })
    )
  })

  test('getBranchById not found -> 404', async () => {
    const req = { params: { id: '404' } }
    const res = createMockResponse()

    branchService.getBranchById.mockResolvedValue(null)

    await branchController.getBranchById(req, res)

    expect(branchService.getBranchById).toHaveBeenCalledWith('404')
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Không tìm thấy chi nhánh'
      })
    )
  })
})
