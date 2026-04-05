jest.mock('../src/services/auth.service', () => ({
  register: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  forgotPasswordRequest: jest.fn(),
  forgotPasswordReset: jest.fn(),
  changePassword: jest.fn(),
  getUserById: jest.fn(),
  updateProfile: jest.fn()
}))

jest.mock('../src/validators/auth.validator', () => ({
  validateRegister: jest.fn(),
  validateLogin: jest.fn(),
  validateForgotPasswordRequest: jest.fn(),
  validateForgotPasswordReset: jest.fn(),
  validateChangePassword: jest.fn()
}))

const authController = require('../src/controllers/auth.controller')
const authService = require('../src/services/auth.service')
const authValidator = require('../src/validators/auth.validator')
const { createMockResponse } = require('./helpers/http')

describe('auth.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('register success -> 201', async () => {
    const req = {
      body: {
        username: 'tester',
        password: '123456',
        fullName: 'Test User',
        email: 'test@example.com'
      }
    }
    const res = createMockResponse()
    const user = { user_id: 'u-1', username: 'tester' }

    authValidator.validateRegister.mockReturnValue([])
    authService.register.mockResolvedValue(user)

    await authController.register(req, res)

    expect(authValidator.validateRegister).toHaveBeenCalledWith(req.body)
    expect(authService.register).toHaveBeenCalledWith(req.body)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Đăng ký tài khoản thành công',
        data: user
      })
    )
  })

  test('register validation error -> 400', async () => {
    const req = { body: { username: 'ab' } }
    const res = createMockResponse()

    authValidator.validateRegister.mockReturnValue(['username tối thiểu 3 ký tự'])

    await authController.register(req, res)

    expect(authService.register).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: ['username tối thiểu 3 ký tự']
      })
    )
  })

  test('login validation error -> 400', async () => {
    const req = { body: { username: '' } }
    const res = createMockResponse()

    authValidator.validateLogin.mockReturnValue(['username là bắt buộc'])

    await authController.login(req, res)

    expect(authService.login).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: ['username là bắt buộc']
      })
    )
  })
})
