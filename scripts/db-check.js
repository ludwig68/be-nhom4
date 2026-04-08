require('../src/utils/load-env')();

const pool = require('../src/config/db');
const { REQUIRED_ENV_KEYS, validateRequiredEnv } = require('../src/utils/env');

const main = async () => {
  validateRequiredEnv(REQUIRED_ENV_KEYS);

  const [databaseInfo] = await pool.query('SELECT DATABASE() AS databaseName, VERSION() AS mysqlVersion');
  const [tableRows] = await pool.query('SHOW TABLES');

  console.log(`DB OK: connected to ${databaseInfo[0].databaseName}`);
  console.log(`MySQL version: ${databaseInfo[0].mysqlVersion}`);
  console.log(`Table count: ${tableRows.length}`);
};

main()
  .catch((error) => {
    console.error('DB CHECK FAILED');
    console.error(error.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
