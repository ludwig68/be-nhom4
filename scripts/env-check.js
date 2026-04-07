require('../src/utils/load-env')()

const { REQUIRED_ENV_KEYS, validateRequiredEnv } = require('../src/utils/env')

try {
  validateRequiredEnv(REQUIRED_ENV_KEYS)
  console.log('ENV OK: all required keys are present')
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
