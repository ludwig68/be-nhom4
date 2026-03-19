require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// 1. Kết nối Aiven Cloud DB
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) console.error('Lỗi DB:', err);
    else console.log('Đã kết nối MySQL thành công!');
});

// ==========================================
// CÁC API CRUD CHO BẢNG USERS
// ==========================================

// [TRANG CHỦ API] - Giao diện Hướng dẫn chấm điểm có ô nhập ID
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #4f46e5;">Hướng dẫn chấm điểm API - Nhóm 4</h2>
            <p style="font-size: 16px;">Hiển thị theo cú pháp sau:</p>
            
            <div style="font-size: 18px; background: #f3f4f6; padding: 25px 40px; border-radius: 8px; display: inline-block;">
                <div style="margin-bottom: 20px;">
                    <a href="/users" target="_blank" style="color: #2563eb; text-decoration: none; border-bottom: 1px solid #2563eb; padding-bottom: 2px;">
                        <b>BASE_API/users</b>
                    </a> 
                    <span style="color: #374151; margin-left: 10px;">-> tất cả users</span>
                </div>
                
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <span style="color: #2563eb;"><b>BASE_API/users/</b></span>
                    <input type="number" id="apiId" placeholder="Nhập ID (VD: 1)" style="width: 130px; padding: 8px 12px; font-size: 16px; border: 1px solid #d1d5db; border-radius: 6px; outline: none;">
                    <button onclick="openApiLink()" style="padding: 8px 16px; font-size: 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                        Duyệt
                    </button>
                    <span style="color: #374151;">-> users có id tương ứng</span>
                </div>

                <script>
                    function openApiLink() {
                        var id = document.getElementById('apiId').value.trim();
                        if(id) {
                            window.open('/users/' + id, '_blank');
                        } else {
                            alert('Vui lòng nhập ID vào ô trống!');
                        }
                    }
                </script>
            </div>
            
            <p style="color: #6b7280; font-style: italic; margin-top: 20px;">
                (Thầy/Cô có thể thao tác trực tiếp trên giao diện này để xem kết quả JSON).
            </p>
        </div>
    `);
});

// [READ] Lấy danh sách users
app.get('/users', (req, res) => {
    const sql = 'SELECT * FROM users ORDER BY CAST(id AS UNSIGNED) ASC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Lỗi máy chủ' });
        res.json(results);
    });
});

// [READ] Lấy chi tiết 1 user
app.get('/users/:id', (req, res) => {
    db.query('SELECT * FROM users WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Lỗi máy chủ' });
        if (results.length === 0) return res.status(404).json({ message: 'Không tìm thấy' });
        res.json(results[0]);
    });
});

// [CREATE] Thêm user mới
app.post('/users', (req, res) => {
    const { name, email, phone } = req.body;

    db.query('SELECT MAX(CAST(id AS UNSIGNED)) AS maxId FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi tạo ID' });

        const nextIdNumber = (results[0].maxId || 0) + 1;
        const newIdString = nextIdNumber.toString();

        const sql = 'INSERT INTO users (id, name, email, phone) VALUES (?, ?, ?, ?)';
        db.query(sql, [newIdString, name, email, phone], (err, result) => {
            if (err) return res.status(500).json({ error: 'Lỗi khi thêm' });
            res.json({ message: 'Thêm thành công!', id: newIdString });
        });
    });
});

// [UPDATE] Sửa thông tin user
app.put('/users/:id', (req, res) => {
    const { name, email, phone } = req.body;
    const sql = 'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?';
    db.query(sql, [name, email, phone, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi sửa' });
        res.json({ message: 'Cập nhật thành công!' });
    });
});

// [DELETE] Xóa user
app.delete('/users/:id', (req, res) => {
    const sql = 'DELETE FROM users WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Lỗi khi xóa' });
        res.json({ message: 'Đã xóa thành công!' });
    });
});

app.listen(PORT, () => {
    console.log(`Backend chạy tại port ${PORT}`);
});