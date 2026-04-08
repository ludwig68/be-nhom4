process.env.PORT = '0';
process.env.IP = '127.0.0.1';

require('../server');

setTimeout(() => {
  console.log('BOOT CHECK OK');
  process.exit(0);
}, 2000);
