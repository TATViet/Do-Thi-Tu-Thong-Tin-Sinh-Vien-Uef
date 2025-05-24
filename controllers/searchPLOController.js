// controllers/searchPLOController.js
const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const HienDienSV = require('../models/HienDienSV');

// Hàm để chuyển đổi số NamHocKy sang định dạng dễ đọc
function formatNamHocKy(namHocKy) {
  const namHocKyStr = namHocKy.toString();
  const nam = namHocKyStr.substring(0, 4);
  const hocKy = namHocKyStr.charAt(4);
  return `năm ${nam} HK${hocKy}`;
}

exports.getSearchPage = async (req, res) => {
  try {
    // Lấy tất cả các NamHocKy khác nhau từ collection HienDienSV để hiển thị trong view
    const namHocKyList = await HienDienSV.distinct('NamHocKy');
    namHocKyList.sort((a, b) => b - a);
    
    // Tạo một mảng mới với cả số và định dạng dễ đọc
    const formattedNamHocKyList = namHocKyList.map(namHocKy => ({
      value: namHocKy,
      formatted: formatNamHocKy(namHocKy)
    }));
    
    res.render('index', { 
      title: 'Tìm kiếm tiêu chí',
      results: null,
      query: '',
      namHocKyList: formattedNamHocKyList,
      showSearchSection: true
    });
  } catch (error) {
    console.error('Error:', error);
    res.render('index', { 
      title: 'Tìm kiếm tiêu chí',
      results: null,
      query: '',
      namHocKyList: [],
      error: 'Đã xảy ra lỗi khi tải trang.',
      showSearchSection: true
    });
  }
};

exports.searchPLO = async (req, res) => {
  try {
    const maKhoi = req.body.maKhoi;
    
    // Tìm kiếm tất cả bản ghi có MaKhoi trùng với input
    const tieuChiResults = await TieuChiDauRa.find({ MaKhoi: maKhoi });
    
    // Tạo mảng kết quả mở rộng
    const extendedResults = [];
    
    // Với mỗi kết quả TieuChiDauRa, tìm các MonHocTieuChi tương ứng
    for (const tieuChi of tieuChiResults) {
      // Tìm tất cả môn học liên kết với mã tiêu chí này
      const monHocList = await MonHocTieuChi.find({ MaTieuChi: tieuChi.MaTieuChi });
      
      // Tạo object mở rộng chứa thông tin TieuChiDauRa và danh sách môn học
      extendedResults.push({
        tieuChi: tieuChi,
        monHocList: monHocList
      });
    }
    
    // Lấy tất cả các NamHocKy khác nhau (cần thiết để hiển thị trong view)
    const namHocKyList = await HienDienSV.distinct('NamHocKy');
    namHocKyList.sort((a, b) => b - a);
    
    // Tạo một mảng mới với cả số và định dạng dễ đọc
    const formattedNamHocKyList = namHocKyList.map(namHocKy => ({
      value: namHocKy,
      formatted: formatNamHocKy(namHocKy)
    }));
    
    // Trả về trang với kết quả mở rộng
    res.render('index', {
      title: 'Kết quả tìm kiếm',
      results: extendedResults,
      query: maKhoi,
      namHocKyList: formattedNamHocKyList,
      showSearchSection: true
    });
  } catch (error) {
    console.error('Search error:', error);
    res.render('index', {
      title: 'Lỗi tìm kiếm',
      results: null,
      query: req.body.maKhoi,
      namHocKyList: [],
      error: 'Đã xảy ra lỗi khi tìm kiếm. Vui lòng thử lại.',
      showSearchSection: true
    });
  }
};