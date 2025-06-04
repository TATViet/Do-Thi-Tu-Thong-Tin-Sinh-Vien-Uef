// controllers/tyTrongChuanController.js - SỬA TERMINOLOGY

const TyTrongChuan = require('../models/TyTrongChuan');
const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const HienDienSV = require('../models/HienDienSV');
const DiemSinhVien = require('../models/DiemSinhVien');
const ChuongTrinh = require('../models/ChuongTrinh');
const ploProgressController = require('./ploProgressController');

// Cache cho tỷ trọng chuẩn
const tyTrongChuanCache = new Map();

function getTyTrongChuanCacheKey(maKhoi) {
  return `ty_trong_chuan_${maKhoi}`;
}

function saveTyTrongChuanToCache(maKhoi, data) {
  const key = getTyTrongChuanCacheKey(maKhoi);
  const cacheData = {
    timestamp: Date.now(),
    data: data
  };
  tyTrongChuanCache.set(key, cacheData);
  console.log(`💾 Đã cache tỷ trọng chuẩn cho khối ${maKhoi}`);
}

function loadTyTrongChuanFromCache(maKhoi) {
  const key = getTyTrongChuanCacheKey(maKhoi);
  const cacheData = tyTrongChuanCache.get(key);
  
  if (cacheData) {
    const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
    console.log(`📁 Tải cache tỷ trọng chuẩn khối ${maKhoi} (${ageMinutes.toFixed(1)} phút trước)`);
    return cacheData.data;
  }
  return null;
}

// HÀM CHUYỂN ĐỔI NAMHK SANG FORMAT TY TRONG CHUAN
function convertNamHKToTyTrongChuanFormat(namHK) {
  const namHKStr = namHK.toString();
  const nam = parseInt(namHKStr.substring(0, 4));
  const hocKy = parseInt(namHKStr.charAt(4));
  const namThuMay = nam - 2020 + 1;
  return `HK${hocKy}/${namThuMay}`;
}

// Helper function giống ploProgressController
function getDiemTheoLoaiDiem(diemSinhVien, loaiDiem) {
  let diem;
  switch(loaiDiem) {
    case 'QT': diem = diemSinhVien.QuaTrinh; break;
    case 'GK': diem = diemSinhVien.GiuaKy; break;
    case 'CK': diem = diemSinhVien.CuoiKy; break;
    default: diem = diemSinhVien.CuoiKy; break;
  }
  
  if (diem === null || diem === undefined || diem === '') {
    return null;
  }
  
  const diemSo = Number(diem);
  return isNaN(diemSo) ? null : diemSo;
}

// Hiển thị form tỷ trọng chuẩn
exports.getTyTrongChuanForm = async (req, res) => {
  try {
    res.render('index', { 
      title: 'Phân tích tỷ trọng chuẩn PLO',
      tyTrongChuanMode: true,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false,
      allStudentsProgressMode: false,
      diagramMode: false
    });
  } catch (error) {
    console.error('Error loading ty trong chuan form:', error);
    res.render('index', { 
      title: 'Phân tích tỷ trọng chuẩn PLO',
      error: 'Đã xảy ra lỗi khi tải trang phân tích tỷ trọng chuẩn.',
      tyTrongChuanMode: true,
      showSearchSection: false
    });
  }
};

// Tìm kiếm và phân tích tỷ trọng chuẩn - OPTIMIZED
exports.searchTyTrongChuan = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const maKhoi = req.body.maKhoi;
    
    if (!maKhoi) {
      return res.render('index', {
        title: 'Phân tích tỷ trọng chuẩn PLO',
        tyTrongChuanMode: true,
        maKhoiQuery: '',
        error: 'Vui lòng nhập mã khối.',
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false,
        allStudentsProgressMode: false,
        diagramMode: false
      });
    }

    console.log(`\n📊 BẮT ĐẦU PHÂN TÍCH TỶ TRỌNG CHUẨN - Khối: ${maKhoi}`);

    // Kiểm tra cache trước
    let cachedData = loadTyTrongChuanFromCache(maKhoi);
    if (cachedData) {
      const endTime = Date.now();
      
      return res.render('index', {
        title: 'Phân tích tỷ trọng chuẩn PLO',
        tyTrongChuanMode: true,
        maKhoiQuery: maKhoi,
        tyTrongChuanResults: cachedData.tyTrongChuanResults,
        namHKList: cachedData.namHKList,
        ploList: cachedData.ploList,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false,
        allStudentsProgressMode: false,
        diagramMode: false,
        cacheStatus: '⚡ Dữ liệu từ cache',
        processingTime: endTime - startTime
      });
    }

    // Không có cache - tính toán mới
    const result = await processTyTrongChuan(maKhoi);
    
    if (!result.success) {
      return res.render('index', {
        title: 'Phân tích tỷ trọng chuẩn PLO',
        tyTrongChuanMode: true,
        maKhoiQuery: maKhoi,
        error: result.error,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false,
        allStudentsProgressMode: false,
        diagramMode: false
      });
    }

    // Lưu vào cache
    saveTyTrongChuanToCache(maKhoi, result.data);
    
    const endTime = Date.now();
    console.log(`✅ Hoàn thành phân tích tỷ trọng chuẩn trong ${endTime - startTime}ms`);
    
    res.render('index', {
      title: 'Phân tích tỷ trọng chuẩn PLO',
      tyTrongChuanMode: true,
      maKhoiQuery: maKhoi,
      tyTrongChuanResults: result.data.tyTrongChuanResults,
      namHKList: result.data.namHKList,
      ploList: result.data.ploList,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false,
      allStudentsProgressMode: false,
      diagramMode: false,
      cacheStatus: '🔄 Tính toán mới (batch processing)',
      processingTime: endTime - startTime
    });
    
  } catch (error) {
    console.error('Ty trong chuan search error:', error);
    res.render('index', {
      title: 'Phân tích tỷ trọng chuẩn PLO',
      error: 'Đã xảy ra lỗi khi phân tích tỷ trọng chuẩn: ' + error.message,
      tyTrongChuanMode: true,
      maKhoiQuery: req.body.maKhoi,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false,
      allStudentsProgressMode: false,
      diagramMode: false
    });
  }
};

// ✅ HÀM XỬ LÝ TỶ TRỌNG CHUẨN - BATCH PROCESSING
async function processTyTrongChuan(maKhoi) {
  try {
    console.log(`🔄 Bắt đầu xử lý tỷ trọng chuẩn cho khối ${maKhoi}`);

    // 1. Lấy dữ liệu tỷ trọng chuẩn
    const tyTrongChuanRecord = await TyTrongChuan.findOne({});
    if (!tyTrongChuanRecord) {
      return {
        success: false,
        error: 'Không tìm thấy dữ liệu tỷ trọng chuẩn trong hệ thống'
      };
    }

    // 2. Lấy danh sách PLO và tiêu chí cho khối
    const tieuChiList = await TieuChiDauRa.find({ MaKhoi: maKhoi }).lean();
    if (!tieuChiList || tieuChiList.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy PLO nào cho mã khối "${maKhoi}".`
      };
    }

    const ploGroups = {};
    tieuChiList.forEach(tc => {
      if (!ploGroups[tc.MaPLO]) {
        ploGroups[tc.MaPLO] = [];
      }
      ploGroups[tc.MaPLO].push(tc.MaTieuChi);
    });

    console.log(`📊 Tìm thấy ${Object.keys(ploGroups).length} PLO: ${Object.keys(ploGroups).join(', ')}`);

    // 3. Lấy danh sách NamHK có sinh viên tham gia
    const allNamHK = await HienDienSV.distinct('NamHocKy', { 
      MaKhoi: maKhoi,
      HienDienSV: { $in: [0, 3] }
    });
    const sortedNamHK = allNamHK.map(nk => parseInt(nk)).sort((a, b) => a - b);
    
    if (sortedNamHK.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy sinh viên tham gia nào cho mã khối "${maKhoi}".`
      };
    }

    console.log(`📅 Tìm thấy ${sortedNamHK.length} học kỳ: ${sortedNamHK.join(', ')}`);

    const namHKList = sortedNamHK.map(namHK => ({
      value: namHK,
      formatted: ploProgressController.formatNamHK(namHK)
    }));

    // 4. Lấy thông tin chương trình và điểm chuẩn
    const chuongTrinh = await ChuongTrinh.findOne({ MaKhoi: maKhoi });
    if (!chuongTrinh) {
      return {
        success: false,
        error: `Không tìm thấy chương trình cho mã khối ${maKhoi}`
      };
    }

    const diemChon = chuongTrinh.DiemChon;
    console.log(`⚙️ Điểm chuẩn: ${diemChon}`);

    // ✅ 5. BATCH PROCESSING - TÍNH TẤT CẢ SINH VIÊN CHO TẤT CẢ PLO
    const batchData = await calculateBatchPLOData(maKhoi, Object.keys(ploGroups), sortedNamHK, diemChon);

    // 6. Tạo bảng kết quả theo NamHK
    const tyTrongChuanResults = [];
    
    for (const namHK of sortedNamHK) {
      console.log(`\n🔍 Xử lý ${ploProgressController.formatNamHK(namHK)}...`);
      
      const tyTrongChuanFormat = convertNamHKToTyTrongChuanFormat(namHK);
      
      // Lấy sinh viên tham gia trong NamHK này
      const participatingStudents = await HienDienSV.find({
        MaKhoi: maKhoi,
        NamHocKy: namHK,
        HienDienSV: { $in: [0, 3] }
      }).lean();

      const totalStudentsInSemester = participatingStudents.length;
      console.log(`   👥 ${totalStudentsInSemester} sinh viên tham gia`);

      const semesterResult = {
        namHK: namHK,
        namHKFormatted: ploProgressController.formatNamHK(namHK),
        totalStudents: totalStudentsInSemester,
        ploResults: []
      };

      // Phân tích từng PLO
      for (const plo of Object.keys(ploGroups)) {
        // Tìm tỷ trọng yêu cầu từ TyTrongChuan
        const ploStandard = tyTrongChuanRecord.PLOData.find(p => 
          p.PLO === plo ||                    
          p.PLO === `PLO ${plo}` ||          
          p.PLO === `PLO ${plo.replace('PLO', '')}` ||  
          p.PLO === plo.replace('PLO', '')   
        );
        
        let standardValue = 0;
        let hasStandard = false;

        if (ploStandard) {
          const standardForSemester = ploStandard.TyTrong.find(tt => tt.NamHK === tyTrongChuanFormat);
          if (standardForSemester) {
            standardValue = standardForSemester.GiaTri;
            hasStandard = true;
          }
        }

        // ✅ ĐẾM SINH VIÊN ĐẠT YÊU CẦU TỪ BATCH DATA
        let studentsMetStandard = 0;
        
        for (const student of participatingStudents) {
          const maSV = student.MaSV;
          const studentPLOData = batchData[maSV]?.[plo]?.[namHK];
          
          if (studentPLOData) {
            // ✅ TÍNH TỶ LỆ HOÀN THÀNH PLO CỦA SINH VIÊN (GIỐNG ploProgressController)
            const completionPercentage = studentPLOData.tongTrongSoLyThuyet > 0 ? 
              (studentPLOData.tongTrongSoSinhVienCo / studentPLOData.tongTrongSoLyThuyet) * 100 : 0;
            
            // ✅ SO SÁNH VỚI TỶ TRỌNG YÊU CẦU
            if (completionPercentage >= standardValue) {
              studentsMetStandard++;
            }
          }
        }

        const percentage = totalStudentsInSemester > 0 ? 
          Math.round((studentsMetStandard / totalStudentsInSemester) * 100) : 0;

        console.log(`   📈 PLO ${plo}: ${studentsMetStandard}/${totalStudentsInSemester} đạt ${standardValue}% (${percentage}%)`);

        semesterResult.ploResults.push({
          plo: plo,
          studentsMetStandard: studentsMetStandard,
          percentage: percentage,
          standardValue: standardValue,
          hasStandard: hasStandard
        });
      }

      tyTrongChuanResults.push(semesterResult);
    }

    return {
      success: true,
      data: {
        tyTrongChuanResults,
        namHKList,
        ploList: Object.keys(ploGroups).sort()
      }
    };

  } catch (error) {
    console.error('Error in processTyTrongChuan:', error);
    return {
      success: false,
      error: `Đã xảy ra lỗi khi xử lý tỷ trọng chuẩn: ${error.message}`
    };
  }
}

// ✅ HÀM BATCH PROCESSING - TÍNH TẤT CẢ PLO CHO TẤT CẢ SINH VIÊN
async function calculateBatchPLOData(maKhoi, ploList, namHKList, diemChon) {
  console.log('🚀 Bắt đầu batch processing...');
  
  // Lấy tất cả dữ liệu cần thiết một lần
  const [monHocTieuChiData, allDiemSinhVien, allHienDienSV] = await Promise.all([
    getMonHocTieuChiForKhoi(maKhoi, ploList),
    DiemSinhVien.find({}).lean(),
    HienDienSV.find({ 
      MaKhoi: maKhoi,
      HienDienSV: { $in: [0, 3] }
    }).lean()
  ]);

  // Tạo lookup maps để tăng tốc
  const diemLookup = {};
  allDiemSinhVien.forEach(d => {
    if (!diemLookup[d.MaSV]) diemLookup[d.MaSV] = {};
    if (!diemLookup[d.MaSV][d.MaMH]) diemLookup[d.MaSV][d.MaMH] = [];
    diemLookup[d.MaSV][d.MaMH].push(d);
  });

  const hienDienLookup = {};
  allHienDienSV.forEach(h => {
    if (!hienDienLookup[h.MaSV]) hienDienLookup[h.MaSV] = [];
    hienDienLookup[h.MaSV].push(h);
  });

  const result = {};

  // Lấy danh sách sinh viên unique
  const allStudents = [...new Set(allHienDienSV.map(h => h.MaSV))];
  
  console.log(`📊 Processing ${allStudents.length} sinh viên cho ${ploList.length} PLO`);

  // Xử lý từng sinh viên
  for (const maSV of allStudents) {
    result[maSV] = {};
    
    // Xử lý từng PLO
    for (const plo of ploList) {
      result[maSV][plo] = {};
      
      // Xử lý từng NamHK (tích lũy)
      for (const namHK of namHKList) {
        const ploData = calculateStudentPLOForNamHK(
          maSV, 
          plo, 
          namHK, 
          monHocTieuChiData[plo] || [],
          diemLookup[maSV] || {},
          hienDienLookup[maSV] || []
        );
        
        result[maSV][plo][namHK] = ploData;
      }
    }
  }

  console.log('✅ Hoàn thành batch processing');
  return result;
}

// ✅ HÀM LẤY THÔNG TIN MÔN HỌC TIÊU CHÍ CHO KHỐI
async function getMonHocTieuChiForKhoi(maKhoi, ploList) {
  const tieuChiList = await TieuChiDauRa.find({ 
    MaKhoi: maKhoi,
    MaPLO: { $in: ploList }
  }).lean();

  const monHocTieuChiList = await MonHocTieuChi.find({
    MaTieuChi: { $in: tieuChiList.map(tc => tc.MaTieuChi) }
  }).lean();

  // Group by PLO
  const result = {};
  ploList.forEach(plo => {
    const relatedTieuChi = tieuChiList.filter(tc => tc.MaPLO === plo).map(tc => tc.MaTieuChi);
    result[plo] = monHocTieuChiList.filter(mh => relatedTieuChi.includes(mh.MaTieuChi));
  });

  return result;
}

// ✅ TÍNH PLO CỦA SINH VIÊN CHO MỘT NamHK (TÍCH LŨY)
function calculateStudentPLOForNamHK(maSV, plo, targetNamHK, monHocList, diemData, hienDienData) {
  // Kiểm tra sinh viên có tham gia đến NamHK này không
  const participatedByTargetNamHK = hienDienData.some(h => h.NamHocKy <= targetNamHK);
  
  if (!participatedByTargetNamHK) {
    return {
      tongTrongSoLyThuyet: 0,
      tongTrongSoSinhVienCo: 0,
      hasData: false
    };
  }

  let tongTrongSoLyThuyet = 0;
  let tongTrongSoSinhVienCo = 0;

  // Xử lý từng môn học trong PLO
  for (const monHoc of monHocList) {
    const maMH = monHoc.MaMH;
    const trongSo = parseFloat(monHoc.TrongSo) || 0;
    const loaiDiem = monHoc.LoaiDiem || 'CK';
    
    tongTrongSoLyThuyet += trongSo;

    // ✅ TÌM ĐIỂM TỐT NHẤT CỦA SINH VIÊN CHO MÔN NÀY ĐẾN targetNamHK
    const diemRecords = (diemData[maMH] || []).filter(d => d.NamHK <= targetNamHK);
    
    let bestScore = null;
    
    for (const diemRecord of diemRecords) {
      const diem = getDiemTheoLoaiDiem(diemRecord, loaiDiem);
      if (diem !== null && (bestScore === null || diem > bestScore)) {
        bestScore = diem;
      }
    }

    // ✅ NẾU CÓ ĐIỂM, TÍNH VÀO TRỌNG SỐ ĐÃ CÓ
    if (bestScore !== null) {
      tongTrongSoSinhVienCo += trongSo;
    }
  }

  // ✅ CAP TỶ LỆ HOÀN THÀNH TẠI 100% (1.0)
  const cappedTongTrongSoSinhVienCo = Math.min(tongTrongSoSinhVienCo, 1.0);
  const cappedTongTrongSoLyThuyet = Math.min(tongTrongSoLyThuyet, 1.0);

  return {
    tongTrongSoLyThuyet: cappedTongTrongSoLyThuyet,
    tongTrongSoSinhVienCo: cappedTongTrongSoSinhVienCo,
    originalTongTrongSoLyThuyet: tongTrongSoLyThuyet, // Giữ giá trị gốc để debug
    originalTongTrongSoSinhVienCo: tongTrongSoSinhVienCo,
    hasData: true
  };
}

module.exports = {
  getTyTrongChuanForm: exports.getTyTrongChuanForm,
  searchTyTrongChuan: exports.searchTyTrongChuan,
  formatNamHK: ploProgressController.formatNamHK
};
