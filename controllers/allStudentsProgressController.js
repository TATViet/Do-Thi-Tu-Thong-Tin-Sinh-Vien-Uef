// controllers/allStudentsProgressController.js
const ploProgressController = require('./ploProgressController');
const HienDienSV = require('../models/HienDienSV');
const DiemSinhVien = require('../models/DiemSinhVien');

// Hiển thị form tìm kiếm tất cả sinh viên
exports.getAllStudentsProgressForm = async (req, res) => {
  try {
    res.render('index', {
      title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
      allStudentsProgressMode: true
    });
  } catch (error) {
    console.error('Error loading all students progress form:', error);
    res.render('index', {
      title: 'Lỗi',
      error: 'Đã xảy ra lỗi khi tải trang theo dõi tiến trình của tất cả sinh viên.',
      allStudentsProgressMode: true
    });
  }
};

// Tìm kiếm và hiển thị tiến trình của tất cả sinh viên
exports.searchAllStudentsProgress = async (req, res) => {
  try {
    const maKhoi = req.body.maKhoi;
    
    if (!maKhoi) {
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
        allStudentsProgressMode: true,
        error: 'Vui lòng nhập Mã Khối.'
      });
    }
    
    // Lấy danh sách sinh viên thuộc khối
    const sinhVienList = await HienDienSV.find({ MaKhoi: maKhoi }).lean();
    
    if (!sinhVienList || sinhVienList.length === 0) {
      return res.render('index', {
        title: 'Kết quả theo dõi tiến trình PLO',
        allStudentsProgressMode: true,
        maKhoiQuery: maKhoi,
        error: `Không tìm thấy sinh viên nào thuộc mã khối "${maKhoi}".`
      });
    }
    
    // Lấy tất cả NamHK từ DiemSinhVien cho khối này
    const sinhVienIds = sinhVienList.map(sv => sv.MaSV);
    const diemResults = await DiemSinhVien.find({ 
      MaSV: { $in: sinhVienIds } 
    }).lean();
    
    // Trích xuất tất cả năm học kỳ
    let allSemesters = [...new Set(diemResults.map(d => d.NamHK))];
    allSemesters = allSemesters.map(Number); // Chuyển về kiểu số
    
    // Tìm NamHocKy cao nhất từ DiemSinhVien
    const maxNamHK = allSemesters.length > 0 ? Math.max(...allSemesters) : 20211; // Mặc định nếu không có dữ liệu
    
    // Thêm tất cả các học kỳ từ 2020.1 đến max NamHocKy
    const startYear = 2020;
    const maxYear = Math.floor(maxNamHK / 10);
    const maxSemester = maxNamHK % 10;
    
    // Xây dựng danh sách đầy đủ các học kỳ
    allSemesters = [];
    for (let year = startYear; year <= maxYear; year++) {
      for (let semester = 1; semester <= 2; semester++) {
        // Kiểm tra nếu là năm cuối cùng thì chỉ thêm các học kỳ <= maxSemester
        if (year < maxYear || (year === maxYear && semester <= maxSemester)) {
          allSemesters.push(year * 10 + semester);
        }
      }
    }
    
    // Tính toán tiến trình cho tất cả sinh viên
    const allStudentsProgress = [];
    
    // Lấy kết quả cho sinh viên đầu tiên để có thông tin chung
    let ploGroups = null;
    
    // Xử lý từng sinh viên
    for (const sv of sinhVienList) {
      const maSV = sv.MaSV;
      
      try {
        const result = await ploProgressController.trackStudentPLOProgress(maKhoi, maSV);
        
        if (result.success) {
          // Nếu chưa có thông tin chung, lấy từ kết quả đầu tiên
          if (!ploGroups) {
            ploGroups = result.data.ploGroups;
          }
          
          // Đảm bảo dữ liệu cho tất cả học kỳ
          const fullProgressData = ploProgressController.ensureFullSemesters(
            result.data.sinhVien, 
            allSemesters
          );
          
          allStudentsProgress.push({
            sinhVien: sv,
            ploProgress: fullProgressData.plos
          });
        }
      } catch (error) {
        console.error(`Error processing student ${maSV}:`, error);
        // Tiếp tục với sinh viên tiếp theo nếu có lỗi
      }
    }
    
    // Tạo danh sách học kỳ dạng đối tượng cho view
    const namHKList = allSemesters.map(namHK => ({
      value: namHK,
      formatted: ploProgressController.formatNamHK(namHK)
    }));
    
    // Render trang với data phù hợp
    res.render('index', {
      title: 'Tiến trình PLO của tất cả sinh viên',
      allStudentsProgressMode: true,
      maKhoiQuery: maKhoi,
      allStudentsProgress: allStudentsProgress,
      ploGroups: ploGroups,
      namHKList: namHKList,
      totalStudents: sinhVienList.length,
      displayedStudents: allStudentsProgress.length,
      formatNamHK: ploProgressController.formatNamHK
    });
    
  } catch (error) {
    console.error('All students progress search error:', error);
    res.render('index', {
      title: 'Lỗi',
      error: 'Đã xảy ra lỗi khi tìm kiếm tiến trình PLO của tất cả sinh viên: ' + error.message,
      allStudentsProgressMode: true,
      maKhoiQuery: req.body.maKhoi
    });
  }
};