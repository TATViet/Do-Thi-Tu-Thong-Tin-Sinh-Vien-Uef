// controllers/diemSinhVienController.js
const DiemSinhVien = require('../models/DiemSinhVien');
const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const HienDienSV = require('../models/HienDienSV');

// Hàm để chuyển đổi số NamHK sang định dạng dễ đọc
function formatNamHK(namHK) {
  const namHKStr = namHK.toString();
  const nam = namHKStr.substring(0, 4);
  const hocKy = namHKStr.charAt(4);
  return `năm ${nam} HK${hocKy}`;
}

exports.getSearchDiemForm = async (req, res) => {
  try {
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown (nếu cần)
    const namHKList = await DiemSinhVien.distinct('NamHK');
    namHKList.sort((a, b) => b - a);
    
    const formattedNamHKList = namHKList.map(namHK => ({
      value: namHK,
      formatted: formatNamHK(namHK)
    }));
    
    res.render('index', { 
      title: 'Tra cứu điểm sinh viên',
      diemSinhVienSearchMode: true,
      namHKList: formattedNamHKList,
      maSVQuery: '',
      maKhoiQuery: '',
      diemResults: null,
      showSearchSection: false,  // Ẩn phần tìm kiếm tiêu chí
      sinhVienSearchMode: false  // Ẩn phần tìm kiếm sinh viên
    });
  } catch (error) {
    console.error('Error loading diem sinh vien search form:', error);
    res.render('index', { 
      title: 'Lỗi',
      error: 'Đã xảy ra lỗi khi tải trang tra cứu điểm.',
      diemSinhVienSearchMode: true,
      showSearchSection: false,
      sinhVienSearchMode: false
    });
  }
};

exports.searchDiemSinhVien = async (req, res) => {
  try {
    const maSV = req.body.maSV;
    const namHK = req.body.namHK ? parseInt(req.body.namHK) : null;
    const maKhoi = req.body.maKhoi ? req.body.maKhoi.trim() : null;
    
    // Xác định loại tìm kiếm dựa trên các tham số
    const searchByMaKhoi = maKhoi && maKhoi.length > 0;
    let diemResults = [];
    let allRelatedMaMHs = [];
    
    if (searchByMaKhoi) {
      // ===== TÌM KIẾM THEO MÃ KHỐI =====
      
      // 1. Tìm tất cả MaTieuChi liên quan đến MaKhoi từ bảng TieuChiDauRa
      const tieuChiResults = await TieuChiDauRa.find({ MaKhoi: maKhoi });
      
      // Nếu không tìm thấy tiêu chí liên quan
      if (tieuChiResults.length === 0) {
        // Lấy danh sách năm học kỳ để hiển thị dropdown
        const namHKList = await DiemSinhVien.distinct('NamHK');
        namHKList.sort((a, b) => b - a);
        
        const formattedNamHKList = namHKList.map(namHK => ({
          value: namHK,
          formatted: formatNamHK(namHK)
        }));
        
        return res.render('index', {
          title: 'Kết quả tra cứu điểm theo khối',
          diemSinhVienSearchMode: true,
          namHKList: formattedNamHKList,
          maSVQuery: maSV,
          maKhoiQuery: maKhoi,
          error: `Không tìm thấy tiêu chí nào liên quan đến mã khối "${maKhoi}".`,
          showSearchSection: false,
          sinhVienSearchMode: false
        });
      }
      
      // Lấy danh sách MaTieuChi từ các tiêu chí đã tìm được
      const relatedTieuChis = tieuChiResults.map(tieuChi => tieuChi.MaTieuChi);
      
      // 2. Tìm tất cả MaMH liên quan đến các MaTieuChi từ bảng MonHocTieuChi
      const monHocResults = await MonHocTieuChi.find({ 
        MaTieuChi: { $in: relatedTieuChis }
      });
      
      // Nếu không tìm thấy môn học liên quan
      if (monHocResults.length === 0) {
        // Lấy danh sách năm học kỳ để hiển thị dropdown
        const namHKList = await DiemSinhVien.distinct('NamHK');
        namHKList.sort((a, b) => b - a);
        
        const formattedNamHKList = namHKList.map(namHK => ({
          value: namHK,
          formatted: formatNamHK(namHK)
        }));
        
        return res.render('index', {
          title: 'Kết quả tra cứu điểm theo khối',
          diemSinhVienSearchMode: true,
          namHKList: formattedNamHKList,
          maSVQuery: maSV,
          maKhoiQuery: maKhoi,
          error: `Không tìm thấy môn học nào liên quan đến mã khối "${maKhoi}".`,
          showSearchSection: false,
          sinhVienSearchMode: false
        });
      }
      
      // Lấy danh sách tất cả MaMH từ các môn học liên quan
      allRelatedMaMHs = [...new Set(monHocResults.map(monHoc => monHoc.MaMH))];
      
      // 3. Tìm điểm của sinh viên cho tất cả các môn học liên quan
      let query = {
        MaSV: maSV,
        MaMH: { $in: allRelatedMaMHs }
      };
      
      if (namHK) {
        query.NamHK = namHK;
      }
      
      diemResults = await DiemSinhVien.find(query).sort({ NamHK: -1, MaMH: 1 });
      
      // Đối với mỗi môn học, lưu trữ thông tin tiêu chí liên quan
      const monHocTieuChiMap = {};
      monHocResults.forEach(monHoc => {
        if (!monHocTieuChiMap[monHoc.MaMH]) {
          monHocTieuChiMap[monHoc.MaMH] = [];
        }
        monHocTieuChiMap[monHoc.MaMH].push(monHoc.MaTieuChi);
      });
      
      // Lấy thông tin chi tiết về tiêu chí
      const tieuChiMap = {};
      tieuChiResults.forEach(tieuChi => {
        tieuChiMap[tieuChi.MaTieuChi] = {
          MaTieuChi: tieuChi.MaTieuChi,
          MaPLO: tieuChi.MaPLO,
          MaKhoi: tieuChi.MaKhoi
        };
      });
      
    } else {
      // ===== TÌM KIẾM THÔNG THƯỜNG THEO MÃ SINH VIÊN =====
      
      // Tạo điều kiện tìm kiếm
      const searchCondition = { MaSV: maSV };
      if (namHK) {
        searchCondition.NamHK = namHK;
      }
      
      // Tìm kiếm điểm sinh viên theo điều kiện
      let query = DiemSinhVien.find(searchCondition);
      
      // Sắp xếp theo năm học kỳ (mới nhất trước) và mã môn học
      query = query.sort({ NamHK: -1, MaMH: 1 });
      
      diemResults = await query;
    }
    
    // Lấy thông tin sinh viên từ HienDienSV (nếu có)
    let thongTinSV = null;
    if (diemResults.length > 0) {
      thongTinSV = await HienDienSV.findOne({ MaSV: maSV })
        .select('MaSV MaKhoa MaNgChng MaKhoi');
    }
    
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown
    const namHKList = await DiemSinhVien.distinct('NamHK');
    namHKList.sort((a, b) => b - a);
    
    const formattedNamHKList = namHKList.map(namHK => ({
      value: namHK,
      formatted: formatNamHK(namHK)
    }));
    
    // Tạo map chứa định dạng năm học kỳ để sử dụng trong view
    const namHKMap = {};
    formattedNamHKList.forEach(item => {
      namHKMap[item.value] = item.formatted;
    });
    
    // Tính điểm trung bình theo học kỳ
    const tbHocKy = {};
    const monHocTheoHK = {};
    
    diemResults.forEach(diem => {
      // Chỉ tính môn học có điểm số hợp lệ
      if (diem.DiemSoHP && !isNaN(parseFloat(diem.DiemSoHP))) {
        const namHK = diem.NamHK;
        const diemSo = parseFloat(diem.DiemSoHP);
        
        if (!tbHocKy[namHK]) {
          tbHocKy[namHK] = { total: 0, count: 0 };
          monHocTheoHK[namHK] = [];
        }
        
        tbHocKy[namHK].total += diemSo;
        tbHocKy[namHK].count += 1;
        monHocTheoHK[namHK].push(diem);
      }
    });
    
    // Tính điểm trung bình
    for (const hk in tbHocKy) {
      if (tbHocKy[hk].count > 0) {
        tbHocKy[hk].average = (tbHocKy[hk].total / tbHocKy[hk].count).toFixed(2);
      }
    }
    
    res.render('index', {
      title: searchByMaKhoi ? 'Kết quả tra cứu điểm theo khối' : 'Kết quả tra cứu điểm',
      diemSinhVienSearchMode: true,
      namHKList: formattedNamHKList,
      namHKMap: namHKMap,
      maSVQuery: maSV,
      maKhoiQuery: maKhoi,
      selectedNamHK: namHK,
      diemResults: diemResults,
      thongTinSV: thongTinSV,
      searchByMaKhoi: searchByMaKhoi,
      allRelatedMaMHs: allRelatedMaMHs,
      tbHocKy: tbHocKy,
      monHocTheoHK: monHocTheoHK,
      totalCount: diemResults.length,
      showSearchSection: false,
      sinhVienSearchMode: false
    });
  } catch (error) {
    console.error('Diem sinh vien search error:', error);
    
    // Lấy lại danh sách năm học kỳ
    const namHKList = await DiemSinhVien.distinct('NamHK');
    namHKList.sort((a, b) => b - a);
    
    const formattedNamHKList = namHKList.map(namHK => ({
      value: namHK,
      formatted: formatNamHK(namHK)
    }));
    
    res.render('index', {
      title: 'Lỗi tra cứu điểm',
      error: 'Đã xảy ra lỗi khi tra cứu điểm sinh viên. Vui lòng thử lại.',
      diemSinhVienSearchMode: true,
      namHKList: formattedNamHKList,
      maSVQuery: req.body.maSV,
      maKhoiQuery: req.body.maKhoi,
      selectedNamHK: req.body.namHK ? parseInt(req.body.namHK) : null,
      showSearchSection: false,
      sinhVienSearchMode: false
    });
  }
};