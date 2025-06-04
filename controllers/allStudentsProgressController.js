// controllers/allStudentsProgressController.js

const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const HienDienSV = require('../models/HienDienSV');
const DiemSinhVien = require('../models/DiemSinhVien');
const ChuongTrinh = require('../models/ChuongTrinh');

// Import helper functions từ ploProgressController
const ploProgressController = require('./ploProgressController');

// Cache cho tất cả sinh viên
const allStudentsCache = new Map();

function getAllStudentsCacheKey(maKhoi) {
  return `all_students_${maKhoi}`;
}

function saveAllStudentsToCache(maKhoi, data) {
  const key = getAllStudentsCacheKey(maKhoi);
  const cacheData = {
    timestamp: Date.now(),
    data: data
  };
  allStudentsCache.set(key, cacheData);
  console.log(`💾 Đã cache tất cả sinh viên cho khối ${maKhoi}`);
}

function loadAllStudentsFromCache(maKhoi) {
  const key = getAllStudentsCacheKey(maKhoi);
  const cacheData = allStudentsCache.get(key);
  
  if (cacheData) {
    const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
    console.log(`📁 Tải cache tất cả sinh viên khối ${maKhoi} (${ageMinutes.toFixed(1)} phút trước)`);
    return cacheData.data;
  }
  return null;
}

// Hiển thị form tất cả sinh viên
exports.getAllStudentsProgressForm = async (req, res) => {
  try {
    res.render('index', { 
      title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
      allStudentsProgressMode: true,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false
    });
  } catch (error) {
    console.error('Error loading all students progress form:', error);
    res.render('index', { 
      title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
      error: 'Đã xảy ra lỗi khi tải trang tiến trình tất cả sinh viên.',
      allStudentsProgressMode: true,
      showSearchSection: false
    });
  }
};

// Tìm kiếm tất cả sinh viên
exports.searchAllStudentsProgress = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const maKhoi = req.body.maKhoi;
    
    if (!maKhoi) {
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
        allStudentsProgressMode: true,
        maKhoiQuery: '',
        error: 'Vui lòng nhập mã khối.',
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false
      });
    }

    console.log(`\n🔍 BẮT ĐẦU XỬ LÝ TẤT CẢ SINH VIÊN - Khối: ${maKhoi}`);

    // Kiểm tra cache trước
    let cachedData = loadAllStudentsFromCache(maKhoi);
    if (cachedData) {
      const endTime = Date.now();
      
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
        allStudentsProgressMode: true,
        maKhoiQuery: maKhoi,
        allStudentsProgress: cachedData.allStudentsProgress,
        ploGroups: cachedData.ploGroups,
        namHKList: cachedData.namHKList,
        totalStudents: cachedData.totalStudents,
        diemChon: cachedData.diemChon,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false,
        cacheStatus: '⚡ Dữ liệu từ cache',
        processingTime: endTime - startTime
      });
    }

    // Không có cache - tính toán mới
    console.log(`🔄 Tính toán mới cho tất cả sinh viên khối ${maKhoi}`);
    
    const result = await processAllStudentsProgress(maKhoi);
    
    if (!result.success) {
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
        allStudentsProgressMode: true,
        maKhoiQuery: maKhoi,
        error: result.error,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false
      });
    }

    // Lưu vào cache
    saveAllStudentsToCache(maKhoi, result.data);
    
    const endTime = Date.now();
    console.log(`✅ Hoàn thành tất cả sinh viên trong ${endTime - startTime}ms`);
    
    res.render('index', {
      title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
      allStudentsProgressMode: true,
      maKhoiQuery: maKhoi,
      allStudentsProgress: result.data.allStudentsProgress,
      ploGroups: result.data.ploGroups,
      namHKList: result.data.namHKList,
      totalStudents: result.data.totalStudents,
      diemChon: result.data.diemChon,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false,
      cacheStatus: '🔄 Tính toán mới',
      processingTime: endTime - startTime
    });
    
  } catch (error) {
    console.error('All students progress search error:', error);
    res.render('index', {
      title: 'Theo dõi tiến trình PLO của tất cả sinh viên',
      error: 'Đã xảy ra lỗi khi tìm kiếm tiến trình tất cả sinh viên: ' + error.message,
      allStudentsProgressMode: true,
      maKhoiQuery: req.body.maKhoi,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false
    });
  }
};

// Hàm xử lý tất cả sinh viên
async function processAllStudentsProgress(maKhoi) {
  try {
    // 1. Lấy thông tin chương trình và điểm chuẩn
    const chuongTrinh = await ChuongTrinh.findOne({ MaKhoi: maKhoi });
    if (!chuongTrinh || !chuongTrinh.DiemChon) {
      return {
        success: false,
        error: `Không tìm thấy chương trình hoặc điểm chuẩn cho mã khối ${maKhoi}`
      };
    }
    const diemChon = chuongTrinh.DiemChon;

    // 2. LẤY DANH SÁCH MaSV ĐỘC NHẤT TỪ HIENDIENSVS
    const uniqueMaSVList = await HienDienSV.distinct('MaSV', { MaKhoi: maKhoi });
    
    if (!uniqueMaSVList || uniqueMaSVList.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy sinh viên nào thuộc mã khối "${maKhoi}".`
      };
    }

    // Tạo danh sách sinh viên từ MaSV độc nhất
    const sinhVienList = uniqueMaSVList.map(maSV => ({ MaSV: maSV }));
    
    //console.log(`👥 Tìm thấy ${sinhVienList.length} sinh viên độc nhất trong khối ${maKhoi}`);

    // 3. Lấy PLO groups
    const tieuChiList = await TieuChiDauRa.find({ MaKhoi: maKhoi }).lean();
    const ploGroups = {};
    tieuChiList.forEach(tc => {
      if (!ploGroups[tc.MaPLO]) {
        ploGroups[tc.MaPLO] = [];
      }
      ploGroups[tc.MaPLO].push(tc.MaTieuChi);
    });

    // 4. Tạo timeline NamHK
    const allNamHK = await DiemSinhVien.distinct('NamHK');
    const sortedNamHK = allNamHK.map(nk => parseInt(nk)).sort((a, b) => a - b);
    const namHKList = sortedNamHK.map(namHK => ({
      value: namHK,
      formatted: ploProgressController.formatNamHK(namHK)
    }));

    // 5. Xử lý từng sinh viên
    const allStudentsProgress = [];
    
    for (let i = 0; i < sinhVienList.length; i++) {
      const student = sinhVienList[i];
      //console.log(`🔄 Xử lý ${i + 1}/${sinhVienList.length}: ${student.MaSV}`);
      
      try {
        const progressResult = await calculatePLOProgressForStudent(
          student.MaSV, 
          maKhoi, 
          diemChon, 
          student, 
          ploGroups, 
          tieuChiList,
          sortedNamHK
        );
        
        if (progressResult.success) {
          allStudentsProgress.push({
            sinhVien: student,
            ploProgress: progressResult.data
          });
        } else {
          console.log(`❌ Lỗi xử lý sinh viên ${student.MaSV}: ${progressResult.error}`);
        }
      } catch (error) {
        console.log(`❌ Exception xử lý sinh viên ${student.MaSV}:`, error.message);
      }
    }

    return {
      success: true,
      data: {
        allStudentsProgress,
        ploGroups,
        namHKList,
        totalStudents: allStudentsProgress.length,
        diemChon
      }
    };

  } catch (error) {
    console.error('Error in processAllStudentsProgress:', error);
    return {
      success: false,
      error: `Đã xảy ra lỗi khi xử lý tất cả sinh viên: ${error.message}`
    };
  }
}

// Tính PLO cho từng sinh viên VỚI CUMULATIVE PROGRESS (FIX: KHỞI TẠO TẤT CẢ SEMESTER VỚI 0)
async function calculatePLOProgressForStudent(maSV, maKhoi, diemChon, sinhVien, ploGroups, tieuChiList, sortedNamHK) {
  try {
    // Lấy tất cả điểm của sinh viên
    const diemSinhVienList = await DiemSinhVien.find({ MaSV: maSV }).lean();

    // Lấy thông tin môn học và tiêu chí
    const monHocTieuChiList = await MonHocTieuChi.find({
      MaTieuChi: { $in: tieuChiList.map(tc => tc.MaTieuChi) }
    }).lean();

    const results = {};

    // Tính từng PLO
    for (const [plo, tieuChiIds] of Object.entries(ploGroups)) {
      // Lấy môn học liên quan đến PLO này
      const relatedMonHoc = monHocTieuChiList.filter(mh => 
        tieuChiIds.includes(mh.MaTieuChi)
      );

      // Tính toán tổng trọng số lý thuyết
      const tongTrongSoLyThuyet = relatedMonHoc.reduce((sum, mh) => sum + mh.TrongSo, 0);

      // Xử lý từng môn học
      const courseDetails = {};
      for (const monHoc of relatedMonHoc) {
        const maMH = monHoc.MaMH;
        const trongSo = parseFloat(monHoc.TrongSo) || 0;
        const loaiDiem = monHoc.LoaiDiem || 'CK';

        // Tìm điểm sinh viên cho môn học này
        const diemRecords = diemSinhVienList.filter(d => d.MaMH === maMH);

        let bestScore = null;
        let bestNamHK = null;

        // Chọn điểm cao nhất nếu có nhiều lần thi
        for (const diemRecord of diemRecords) {
          const diem = ploProgressController.getDiemTheoLoaiDiem(diemRecord, loaiDiem);

          if (diem !== null && (bestScore === null || diem > bestScore)) {
            bestScore = diem;
            bestNamHK = parseInt(diemRecord.NamHK);
          }
        }

        courseDetails[maMH] = {
          trongSo: trongSo,
          loaiDiem: loaiDiem,
          status: bestScore !== null ? 'co_diem' : 'chua_co_diem',
          diem: bestScore || 0,
          diemCoTrongSo: bestScore ? (bestScore * trongSo) : 0,
          namHK: bestNamHK
        };
      }

      // BƯỚC 1: TÍNH ĐIỂM THỰC TẾ CHO TỪNG SEMESTER
      const semesterActualData = {};
      for (const namHK of sortedNamHK) {
        semesterActualData[namHK] = {
          achievedCourses: 0,
          cumulativeScore: 0
        };
      }

      // Điền data thực tế từ courseDetails
      Object.values(courseDetails).forEach(courseDetail => {
        if (courseDetail.status === 'co_diem' && courseDetail.namHK) {
          const namHK = courseDetail.namHK;
          if (semesterActualData[namHK]) {
            semesterActualData[namHK].achievedCourses++;
            semesterActualData[namHK].cumulativeScore += courseDetail.diemCoTrongSo;
          }
        }
      });

      // BƯỚC 2: TÍNH CUMULATIVE PROGRESS CHO TỪNG SEMESTER
      const cumulativeProgress = {};
      let runningAchievedCourses = 0;
      let runningCumulativeScore = 0;
      
      for (const namHK of sortedNamHK) {
        const actualData = semesterActualData[namHK];
        
        // Cộng dồn từ semester này
        runningAchievedCourses += actualData.achievedCourses;
        runningCumulativeScore += actualData.cumulativeScore;
        
        // TÍNH TRỌNG SỐ CÓ ĐIỂM ĐÃ TÍCH LŨY ĐẾN SEMESTER NÀY
        let tongTrongSoCoTichLuy = 0;
        Object.values(courseDetails).forEach(courseDetail => {
          if (courseDetail.status === 'co_diem' && courseDetail.namHK && courseDetail.namHK <= namHK) {
            tongTrongSoCoTichLuy += courseDetail.trongSo;
          }
        });
        
        const requiredScore = diemChon * tongTrongSoCoTichLuy;
        const isAchieved = runningCumulativeScore >= requiredScore;
        const isCompleted = (tongTrongSoCoTichLuy > 0.99) && isAchieved;
        
        // Cập nhật cumulative progress
        cumulativeProgress[namHK] = {
          achievedCourses: runningAchievedCourses,
          totalCourses: relatedMonHoc.length,
          cumulativeScore: runningCumulativeScore,
          requiredScore: requiredScore,
          isAchieved: isAchieved,
          isCompleted: isCompleted,
          hasProgress: actualData.achievedCourses > 0 || runningAchievedCourses > 0,
          tongTrongSoCoTichLuy: tongTrongSoCoTichLuy
        };
      }

      // Lưu kết quả cho PLO này
      results[plo] = {
        tongTrongSoLyThuyet: tongTrongSoLyThuyet,
        chiTietMonHoc: courseDetails,
        cumulativeProgress: cumulativeProgress
      };
    }

    return {
      success: true,
      data: results
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Export
exports.processAllStudentsProgress = processAllStudentsProgress;