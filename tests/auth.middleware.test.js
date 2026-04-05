jest.mock('../src/utils/jwt', () => ({
  verifyAccessToken: jest.fn()
}))

const authMiddleware = require('../src/middlewares/auth.middleware')
const { verifyAccessToken } = require('../src/utils/jwt')
const { createMockResponse } = require('./helpers/http')

describe('auth.middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('missing token -> 401', () => {
    const req = { headers: {} }
    const res = createMockResponse()
    const next = jest.fn()

    authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Bạn chưa đăng nhập'
      })
    )
  })

  test('invalid token -> 401', () => {
    const req = { headers: { authorization: 'Bearer bad-token' } }
    const res = createMockResponse()
    const next = jest.fn()

    verifyAccessToken.mockImplementation(() => {
      throw new Error('jwt malformed')
    })

    authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Token không hợp lệ hoặc đã hết hạn'
      })
    )
  })

  test('valid token -> next()', () => {
    const req = { headers: { authorization: 'Bearer ok-token' } }
    const res = createMockResponse()
    const next = jest.fn()
    const decoded = { userId: 'u-1', roleId: 3 }

    verifyAccessToken.mockReturnValue(decoded)

    authMiddleware(req, res, next)

    expect(req.user).toEqual(decoded)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })
})
