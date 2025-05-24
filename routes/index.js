// routes/index.js
const express = require('express');
const router = express.Router();
const searchPLOController = require('../controllers/searchPLOController');
const namHocKyController = require('../controllers/TuDienHK');
const sinhVienController = require('../controllers/sinhVienController');
const diemSinhVienController = require('../controllers/diemSinhVienController');
const sinhVienTheoKhoiController = require('../controllers/sinhVienTheoKhoiController');
const ploProgressController = require('../controllers/ploProgressController');
const allStudentsProgressController = require('../controllers/allStudentsProgressController');

// Trang tìm kiếm tiêu chí
router.get('/', searchPLOController.getSearchPage);
router.post('/searchPLO', searchPLOController.searchPLO);

// Danh sách năm học kỳ
router.get('/namhocky', namHocKyController.getNameHocKyList);

// Tìm kiếm sinh viên
router.get('/sinhvien', sinhVienController.getSearchSinhVienForm);
router.post('/searchSinhVien', sinhVienController.searchSinhVien);

// Tra cứu điểm sinh viên
router.get('/diem', diemSinhVienController.getSearchDiemForm);
router.post('/searchDiem', diemSinhVienController.searchDiemSinhVien);

// Tìm sinh viên theo khối và năm học kỳ - sử dụng controller sinhVienTheoKhoiController
router.get('/svtheokhoi', sinhVienTheoKhoiController.getSearchSVKhoiForm);
router.post('/searchSVTheoKhoi', sinhVienTheoKhoiController.searchSVTheoKhoi);

// Routes cho tính năng theo dõi tiến trình PLO
router.get('/ploProgress', ploProgressController.getPLOProgressForm);
router.post('/searchPLOProgress', ploProgressController.searchPLOProgress);

// Routes cho tính năng theo dõi tiến trình PLO của tat ca sinh vien trong Khoi
router.get('/allStudentsProgress', allStudentsProgressController.getAllStudentsProgressForm);
router.post('/searchAllStudentsProgress', allStudentsProgressController.searchAllStudentsProgress);

module.exports = router;