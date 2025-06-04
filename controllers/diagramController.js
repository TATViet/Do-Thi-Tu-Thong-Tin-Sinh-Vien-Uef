// controllers/diagramController.js (WITH CACHING LIKE allStudentsProgressController.js)

const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const HienDienSV = require('../models/HienDienSV');
const DiemSinhVien = require('../models/DiemSinhVien');
const ChuongTrinh = require('../models/ChuongTrinh');
const ploProgressController = require('./ploProgressController');

// Cache cho diagram data
const diagramCache = new Map();

function getDiagramCacheKey(maKhoi) {
  return `diagram_${maKhoi}`;
}

function saveDiagramToCache(maKhoi, data) {
  const key = getDiagramCacheKey(maKhoi);
  const cacheData = {
    timestamp: Date.now(),
    data: data
  };
  diagramCache.set(key, cacheData);
  console.log(`💾 Đã cache diagram cho khối ${maKhoi}`);
}

function loadDiagramFromCache(maKhoi) {
  const key = getDiagramCacheKey(maKhoi);
  const cacheData = diagramCache.get(key);
  
  if (cacheData) {
    const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
    console.log(`📁 Tải cache diagram khối ${maKhoi} (${ageMinutes.toFixed(1)} phút trước)`);
    return cacheData.data;
  }
  return null;
}

exports.getDiagramForm = async (req, res) => {
  try {
    res.render('index', { 
      title: 'Biểu đồ PLO',
      diagramMode: true,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false,
      allStudentsProgressMode: false
    });
  } catch (error) {
    console.error('Error loading diagram form:', error);
    res.render('index', { 
      title: 'Biểu đồ PLO',
      error: 'Đã xảy ra lỗi khi tải trang biểu đồ.',
      diagramMode: true,
      showSearchSection: false
    });
  }
};

exports.generateDiagram = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const maKhoi = req.body.maKhoi;
    
    if (!maKhoi) {
      return res.render('index', {
        title: 'Biểu đồ PLO',
        diagramMode: true,
        maKhoiQuery: '',
        error: 'Vui lòng nhập mã khối.',
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false,
        allStudentsProgressMode: false
      });
    }

    console.log(`\n📊 BẮT ĐẦU TẠO BIỂU ĐỒ CHO KHỐI: ${maKhoi}`);

    // Kiểm tra cache trước
    let cachedData = loadDiagramFromCache(maKhoi);
    if (cachedData) {
      const endTime = Date.now();
      
      return res.render('index', {
        title: 'Biểu đồ PLO',
        diagramMode: true,
        maKhoiQuery: maKhoi,
        chartData: cachedData.chartData,
        chartStats: cachedData.stats,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false,
        allStudentsProgressMode: false,
        cacheStatus: '⚡ Dữ liệu từ cache',
        processingTime: endTime - startTime
      });
    }

    // Không có cache - tính toán mới
    console.log(`🔄 Tính toán mới diagram cho khối ${maKhoi}`);
    
    const chartResult = await generatePLOStatistics(maKhoi);
    
    if (!chartResult.success) {
      return res.render('index', {
        title: 'Biểu đồ PLO',
        diagramMode: true,
        maKhoiQuery: maKhoi,
        error: chartResult.error,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        ploProgressMode: false,
        allStudentsProgressMode: false
      });
    }

    // Lưu vào cache
    saveDiagramToCache(maKhoi, chartResult.data);

    const endTime = Date.now();
    console.log(`✅ Hoàn thành tạo biểu đồ trong ${endTime - startTime}ms`);
    
    res.render('index', {
      title: 'Biểu đồ PLO',
      diagramMode: true,
      maKhoiQuery: maKhoi,
      chartData: chartResult.data.chartData,
      chartStats: chartResult.data.stats,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false,
      allStudentsProgressMode: false,
      cacheStatus: '🔄 Tính toán mới',
      processingTime: endTime - startTime
    });
    
  } catch (error) {
    console.error('Diagram generation error:', error);
    res.render('index', {
      title: 'Biểu đồ PLO',
      error: 'Đã xảy ra lỗi khi tạo biểu đồ: ' + error.message,
      diagramMode: true,
      maKhoiQuery: req.body.maKhoi,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      ploProgressMode: false,
      allStudentsProgressMode: false
    });
  }
};

// FUNCTION CHÍNH 
async function generatePLOStatistics(maKhoi) {
  try {
    // 1. Lấy danh sách sinh viên từ HienDienSV
    const allHienDienRecords = await HienDienSV.find({ MaKhoi: maKhoi }).lean();
    const validYearData = getValidStudentsByYearWithDuplication(allHienDienRecords);
    const sortedNamHK = Object.keys(validYearData).map(n => parseInt(n)).sort((a, b) => a - b);
    
    if (sortedNamHK.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy sinh viên hợp lệ cho mã khối ${maKhoi}`
      };
    }

    // 2. Lấy danh sách PLO
    const tieuChiList = await TieuChiDauRa.find({ MaKhoi: maKhoi }).lean();
    if (!tieuChiList || tieuChiList.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy tiêu chí PLO cho mã khối ${maKhoi}`
      };
    }

    const ploGroups = {};
    tieuChiList.forEach(tc => {
      if (!ploGroups[tc.MaPLO]) {
        ploGroups[tc.MaPLO] = [];
      }
      ploGroups[tc.MaPLO].push(tc.MaTieuChi);
    });

    // 3. Tạo thống kê cho từng PLO
    const chartData = [];
    const maxStudentsPerYear = Math.max(...Object.values(validYearData).map(data => data.totalStudents));

    for (const [plo, tieuChiIds] of Object.entries(ploGroups)) {
      const attemptedAllLine = [];  // Đã thi hết
      const completedAllLine = [];  // Hoàn thành

      for (const namHK of sortedNamHK) {
        const yearData = validYearData[namHK];
        
        if (!yearData || yearData.validStudents.length === 0) {
          attemptedAllLine.push([namHK, 0]);
          completedAllLine.push([namHK, 0]);
          continue;
        }

        const semesterStats = await calculatePLOStatsForSemesterUsingExistingLogic(
          yearData.validStudents,
          namHK,
          maKhoi,
          plo
        );

        attemptedAllLine.push([namHK, semesterStats.attemptedAllPercentage]);
        completedAllLine.push([namHK, semesterStats.completedAllPercentage]);
      }

      chartData.push({
        plo: plo,
        ploName: `PLO ${plo}`,
        achievedLine: {
          name: `PLO ${plo} - Đã thi hết`,
          data: attemptedAllLine,
          color: 'solid',
          description: 'Tỷ lệ sinh viên đã thi hết tất cả môn'
        },
        completedLine: {
          name: `PLO ${plo} - Hoàn thành`,
          data: completedAllLine,
          color: 'light',
          description: 'Tỷ lệ sinh viên hoàn thành PLO (đạt điểm chuẩn)'
        }
      });
    }

    return {
      success: true,
      data: {
        chartData,
        stats: {
          totalStudents: maxStudentsPerYear,
          totalPLOs: Object.keys(ploGroups).length,
          timeRange: {
            from: ploProgressController.formatNamHK(sortedNamHK[0]),
            to: ploProgressController.formatNamHK(sortedNamHK[sortedNamHK.length - 1])
          }
        }
      }
    };

  } catch (error) {
    console.error('Error in generatePLOStatistics:', error);
    return {
      success: false,
      error: `Lỗi tạo thống kê PLO: ${error.message}`
    };
  }
}

  // ✅ HÀM MỚI: LẤY SINH VIÊN VỚI DUPLICATION LOGIC CHO HIENDIENSV = 3
  function getValidStudentsByYearWithDuplication(hienDienRecords) {
    const validYearData = {};
    const studentStatusMap = {}; // Theo dõi status cuối cùng của mỗi sinh viên

    // 1. Thu thập tất cả dữ liệu và xác định status cuối cùng
    hienDienRecords.forEach(record => {
      const namHK = record.NamHocKy;
      const maSV = record.MaSV;
      const hienDienStatus = record.HienDienSV;

      if (!validYearData[namHK]) {
        validYearData[namHK] = {
          validStudents: [],
          totalStudents: 0
        };
      }

      validYearData[namHK].totalStudents++;

      // Theo dõi status của sinh viên qua các năm
      if (!studentStatusMap[maSV]) {
        studentStatusMap[maSV] = [];
      }
      studentStatusMap[maSV].push({ namHK, status: hienDienStatus });

      // Chỉ lấy sinh viên có HienDienSV = 0 hoặc 3
      if (hienDienStatus === 0 || hienDienStatus === 3) {
        if (!validYearData[namHK].validStudents.includes(maSV)) {
          validYearData[namHK].validStudents.push(maSV);
        }
      }
    });

    // 2. Xử lý duplication cho sinh viên có status = 3
    const allNamHK = Object.keys(validYearData).map(n => parseInt(n)).sort((a, b) => a - b);
    const latestNamHK = allNamHK[allNamHK.length - 1];

    Object.keys(studentStatusMap).forEach(maSV => {
      const studentRecords = studentStatusMap[maSV].sort((a, b) => a.namHK - b.namHK);
      let lastValidStatus = null;
      let lastValidNamHK = null;

      // Tìm status cuối cùng hợp lệ (0 hoặc 3)
      for (const record of studentRecords) {
        if (record.status === 0 || record.status === 3) {
          lastValidStatus = record.status;
          lastValidNamHK = record.namHK;
        }
      }

      // ✅ NẾU SINH VIÊN CÓ STATUS = 3, DUPLICATE TỚI NĂM MỚI NHẤT
      if (lastValidStatus === 3) {
        for (const namHK of allNamHK) {
          if (namHK > lastValidNamHK && namHK <= latestNamHK) {
            if (!validYearData[namHK].validStudents.includes(maSV)) {
              validYearData[namHK].validStudents.push(maSV);
            }
          }
        }
      }
    });

    // 3. Debug thông tin về HienDienSV = 1 (không có điểm)
    const status1Students = hienDienRecords.filter(r => r.HienDienSV === 1);
    if (status1Students.length > 0) {
      console.log(`\n📋 Tìm thấy ${status1Students.length} sinh viên có HienDienSV = 1 (không tính vào thống kê):`);
      status1Students.slice(0, 5).forEach(r => {
        console.log(`   ${r.MaSV} - ${ploProgressController.formatNamHK(r.NamHocKy)}`);
      });
      if (status1Students.length > 5) {
        console.log(`   ... và ${status1Students.length - 5} sinh viên khác`);
      }
    }

    return validYearData;
  }

  // HÀM TÍNH THỐNG KÊ PLO (ploProgressController)
  async function calculatePLOStatsForSemesterUsingExistingLogic(validStudents, namHK, maKhoi, plo) {
    let attemptedAllCount = 0;  // Đã thi hết
    let completedAllCount = 0;  // Hoàn thành

    for (const maSV of validStudents) {
      try {
        const studentPLOData = await getStudentPLODataUsingExistingLogic(maSV, maKhoi, namHK);
        
        if (studentPLOData && studentPLOData.plos && studentPLOData.plos[plo]) {
          const ploData = studentPLOData.plos[plo];
          
          //LOGIC: CHỈ CẦN TRỌNG SỐ TUYỆT ĐỐI > 0.999
          const hasAttemptedAll = ploData.tongTrongSoSinhVienCo > 0.999;
          const hasCompletedPLO = ploData.trangThaiDat === true && ploData.tongTrongSoSinhVienCo > 0.999;
          
          if (hasAttemptedAll) {
            attemptedAllCount++;
          }
          
          if (hasCompletedPLO) {
            completedAllCount++;
          }
        }
      } catch (error) {
        console.log(`❌ Lỗi tính PLO ${plo} cho sinh viên ${maSV}:`, error.message);
      }
    }

    const totalValidStudents = validStudents.length;
    const attemptedAllPercentage = totalValidStudents > 0 
      ? Math.round((attemptedAllCount / totalValidStudents) * 100) 
      : 0;
    const completedAllPercentage = totalValidStudents > 0 
      ? Math.round((completedAllCount / totalValidStudents) * 100) 
      : 0;

    return {
      totalValidStudents,
      attemptedAllCount,
      completedAllCount,
      attemptedAllPercentage,
      completedAllPercentage
    };
  }

  // HÀM LẤY DỮ LIỆU PLO CỦA SINH VIÊN SỬ DỤNG LOGIC CÓ SẴN
  async function getStudentPLODataUsingExistingLogic(maSV, maKhoi, targetNamHK) {
    try {
      // Lấy thông tin chương trình và điểm chuẩn
      const chuongTrinh = await ChuongTrinh.findOne({ MaKhoi: maKhoi });
      if (!chuongTrinh) return null;
      const diemChon = chuongTrinh.DiemChon;

      // Lấy danh sách PLO và tiêu chí
      const tieuChiList = await TieuChiDauRa.find({ MaKhoi: maKhoi });
      const ploGroups = {};
      
      tieuChiList.forEach(tc => {
        if (!ploGroups[tc.MaPLO]) {
          ploGroups[tc.MaPLO] = [];
        }
        ploGroups[tc.MaPLO].push(tc.MaTieuChi);
      });

      // Lấy thông tin môn học và tiêu chí
      const monHocTieuChiList = await MonHocTieuChi.find({
        MaTieuChi: { $in: tieuChiList.map(tc => tc.MaTieuChi) }
      });

      // Lấy điểm sinh viên TỚI SEMESTER NÀY
      const diemSinhVienList = await DiemSinhVien.find({ 
        MaSV: maSV,
        NamHK: { $lte: targetNamHK }
      });

      // Tạo object sinh viên
      const sinhVien = {
        MaSV: maSV,
        plos: {}
      };

      // Tính toán cho từng PLO SỬ DỤNG LOGIC CÓ SẴN
      for (const [plo, tieuChiIds] of Object.entries(ploGroups)) {
        const relatedMonHoc = monHocTieuChiList.filter(mh => 
          tieuChiIds.includes(mh.MaTieuChi)
        );

        const tongTrongSoLyThuyet = relatedMonHoc.reduce((sum, mh) => sum + mh.TrongSo, 0);
        
        sinhVien.plos[plo] = {
          tongTrongSoLyThuyet: tongTrongSoLyThuyet,
          tongTrongSoSinhVienCo: 0,
          tongDiemSinhVien: 0,
          diemChuanCoTrongSo: 0,
          trangThaiDat: false,
          chiTietMonHoc: {}
        };

        // Xử lý từng môn học
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

          const coGiaTri = bestScore !== null;
          const diemCoTrongSo = coGiaTri ? (bestScore * trongSo) : 0;

          sinhVien.plos[plo].chiTietMonHoc[maMH] = {
            trongSo: trongSo,
            loaiDiem: loaiDiem,
            status: coGiaTri ? 'co_diem' : 'chua_co_diem',
            diem: bestScore || 0,
            diemCoTrongSo: diemCoTrongSo,
            namHK: bestNamHK
          };

          if (coGiaTri) {
            sinhVien.plos[plo].tongTrongSoSinhVienCo += trongSo;
            sinhVien.plos[plo].tongDiemSinhVien += diemCoTrongSo;
          }
        }

        // Xác định trạng thái đạt PLO
        // TÍNH ĐIỂM CHUẨN ĐÚNG DỰA TRÊN TRỌNG SỐ CÓ ĐIỂM
      sinhVien.plos[plo].diemChuanCoTrongSo = diemChon * sinhVien.plos[plo].tongTrongSoSinhVienCo;
      // Xác định trạng thái đạt PLO
      sinhVien.plos[plo].trangThaiDat = 
        sinhVien.plos[plo].tongDiemSinhVien >= sinhVien.plos[plo].diemChuanCoTrongSo;
            }

      return sinhVien;

    } catch (error) {
      console.error('Error in getStudentPLODataUsingExistingLogic:', error);
      return null;
    }
  }