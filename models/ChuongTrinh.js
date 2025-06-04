// models/ChuongTrinh.js
const mongoose = require('mongoose');

const ChuongTrinhSchema = new mongoose.Schema({
    MaKhoi: { type: String, required: true, unique: true },
    MaNgChng: String,
    BacDaoTao: String,
    HeDaoTao: String,
    MaDV: String,
    HocKyVao: Number,
    DiemChon: Number,
    NgayTao: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChuongTrinh', ChuongTrinhSchema);
