// controllers/TuDienHK.js
const HienDienSV = require('../models/HienDienSV');

// Hàm để chuyển đổi số NamHocKy sang định dạng dễ đọc
function formatNamHocKy(namHocKy) {
  const namHocKyStr = namHocKy.toString();
  const nam = namHocKyStr.substring(0, 4);
  const hocKy = namHocKyStr.charAt(4);
  return `năm ${nam} HK${hocKy}`;
}

exports.getNameHocKyList = async (req, res) => {
  try {
    // Lấy tất cả các NamHocKy khác nhau từ collection HienDienSV
    const namHocKyList = await HienDienSV.distinct('NamHocKy');
    
    // Sắp xếp các NamHocKy theo thứ tự giảm dần
    namHocKyList.sort((a, b) => b - a);
    
    // Tạo một mảng mới với cả số và định dạng dễ đọc
    const formattedNamHocKyList = namHocKyList.map(namHocKy => ({
      value: namHocKy,
      formatted: formatNamHocKy(namHocKy)
    }));
    
    res.render('index', { 
      title: 'Danh sách năm học kỳ',
      results: null,
      query: '',
      namHocKyList: formattedNamHocKyList,
      showSearchSection: true
    });
  } catch (error) {
    console.error('Error fetching NamHocKy list:', error);
    res.render('index', { 
      title: 'Lỗi',
      results: null,
      query: '',
      namHocKyList: [],
      error: 'Đã xảy ra lỗi khi lấy danh sách năm học kỳ.',
      showSearchSection: true
    });
  }
};