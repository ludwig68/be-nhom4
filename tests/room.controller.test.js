jest.mock('../src/services/room.service', () => ({
  getAllRooms: jest.fn(),
  getRoomById: jest.fn(),
  createRoom: jest.fn(),
  updateRoom: jest.fn(),
  deleteRoom: jest.fn()
}))

const roomController = require('../src/controllers/room.controller')
const roomService = require('../src/services/room.service')
const { createMockResponse } = require('./helpers/http')

describe('room.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('getAllRooms with branchId filter -> 200', async () => {
    const req = { query: { branchId: '2' } }
    const res = createMockResponse()
    const rooms = [{ roomId: 10, roomName: 'Deluxe', branchId: 2 }]

    roomService.getAllRooms.mockResolvedValue(rooms)

    await roomController.getAllRooms(req, res)

    expect(roomService.getAllRooms).toHaveBeenCalledWith({ branchId: 2 })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: rooms
      })
    )
  })

  test('getAllRooms invalid branchId -> 400', async () => {
    const req = { query: { branchId: 'abc' } }
    const res = createMockResponse()

    await roomController.getAllRooms(req, res)

    expect(roomService.getAllRooms).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: ['branchId phải là số nguyên dương']
      })
    )
  })
})
