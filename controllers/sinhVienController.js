// controllers/sinhVienController.js
const HienDienSV = require('../models/HienDienSV');

// Hàm để chuyển đổi số NamHocKy sang định dạng dễ đọc
function formatNamHocKy(namHocKy) {
  const namHocKyStr = namHocKy.toString();
  const nam = namHocKyStr.substring(0, 4);
  const hocKy = namHocKyStr.charAt(4);
  return `năm ${nam} HK${hocKy}`;
}

exports.getSearchSinhVienForm = async (req, res) => {
  try {
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown (nếu cần)
    const namHocKyList = await HienDienSV.distinct('NamHocKy');
    namHocKyList.sort((a, b) => b - a);
    
    const formattedNamHocKyList = namHocKyList.map(namHocKy => ({
      value: namHocKy,
      formatted: formatNamHocKy(namHocKy)
    }));
    
    res.render('index', { 
      title: 'Tìm kiếm sinh viên theo khối',
      sinhVienSearchMode: true,
      namHocKyList: formattedNamHocKyList,
      maKhoiQuery: '',
      sinhVienResults: null,
      showResults: false,
      showSearchSection: false  // Ẩn phần tìm kiếm tiêu chí
    });
  } catch (error) {
    console.error('Error loading sinh vien search form:', error);
    res.render('index', { 
      title: 'Lỗi',
      error: 'Đã xảy ra lỗi khi tải trang tìm kiếm sinh viên.',
      sinhVienSearchMode: true,
      showSearchSection: false
    });
  }
};

exports.searchSinhVien = async (req, res) => {
  try {
    const maKhoi = req.body.maKhoi;
    const namHocKy = req.body.namHocKy ? parseInt(req.body.namHocKy) : null;
    
    // Tạo điều kiện tìm kiếm
    let searchCondition = { MaKhoi: maKhoi };
    
    if (namHocKy) {
      searchCondition.NamHocKy = namHocKy;
      // Khi chọn năm học kỳ cụ thể, chỉ hiển thị sinh viên có điểm hiện diện > 0
      searchCondition.HienDienSV = { $gt: 0 };
    }
    
    // Khi chọn tất cả năm học kỳ, cần lấy thêm field NamHocKy
    const selectedFields = namHocKy 
      ? 'MaSV MaKhoa MaNgChng HienDienSV' 
      : 'MaSV MaKhoa MaNgChng HienDienSV NamHocKy';
    
    // Sử dụng cú pháp đúng cho Mongoose sort
    let query = HienDienSV.find(searchCondition).select(selectedFields);
    
    if (namHocKy) {
      query = query.sort('MaSV');
    } else {
      // Khi hiển thị tất cả năm học kỳ, sắp xếp theo MaSV và NamHocKy
      query = query.sort({ MaSV: 1, NamHocKy: 1 });
    }
    
    const sinhVienList = await query;
    
    // Lấy tổng số sinh viên (bao gồm cả những người có điểm = 0) cho thống kê
    let totalCount = sinhVienList.length;
    
    // Nếu đã chọn năm học kỳ, tổng số sinh viên đã được lọc theo HienDienSV > 0
    // Nếu chưa chọn năm học kỳ, đếm số sinh viên có HienDienSV > 0 để hiển thị trong thống kê
    const presentCount = namHocKy ? totalCount : sinhVienList.filter(sv => sv.HienDienSV > 0).length;
    
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown
    const namHocKyList = await HienDienSV.distinct('NamHocKy');
    namHocKyList.sort((a, b) => b - a);
    
    const formattedNamHocKyList = namHocKyList.map(namHocKy => ({
      value: namHocKy,
      formatted: formatNamHocKy(namHocKy)
    }));
    
    // Tạo map chứa định dạng năm học kỳ để sử dụng trong view
    const namHocKyMap = {};
    formattedNamHocKyList.forEach(item => {
      namHocKyMap[item.value] = item.formatted;
    });
    
    // Nếu chọn năm học kỳ cụ thể, cần đếm tổng số sinh viên (kể cả điểm = 0) cho thống kê
    if (namHocKy) {
      const allSVCount = await HienDienSV.countDocuments({ 
        MaKhoi: maKhoi,
        NamHocKy: namHocKy
      });
      totalCount = allSVCount;
    }
    
    res.render('index', {
      title: 'Kết quả tìm kiếm sinh viên',
      sinhVienSearchMode: true,
      namHocKyList: formattedNamHocKyList,
      namHocKyMap: namHocKyMap,
      maKhoiQuery: maKhoi,
      selectedNamHocKy: namHocKy,
      sinhVienResults: sinhVienList,
      totalCount: totalCount,
      presentCount: presentCount,
      showResults: req.body.showResults === 'true',
      showSearchSection: false
    });
  } catch (error) {
    console.error('Sinh vien search error:', error);
    
    // Xử lý lỗi như trước
    // ...
  }
};