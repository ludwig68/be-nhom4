const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Auth API local đang chạy',
    data: {
      endpoints: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/forgot-password/request',
        'POST /api/auth/forgot-password/reset',
        'POST /api/auth/change-password',
        'GET /api/auth/me'
      ]
    }
  });
});

app.use('/api/auth', authRoutes);

module.exports = app;