// controllers/sinhVienTheoKhoiController.js
const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const DiemSinhVien = require('../models/DiemSinhVien');
const HienDienSV = require('../models/HienDienSV');

// Hàm để chuyển đổi số NamHK sang định dạng dễ đọc
function formatNamHK(namHK) {
  const namHKStr = namHK.toString();
  const nam = namHKStr.substring(0, 4);
  const hocKy = namHKStr.charAt(4);
  return `năm ${nam} HK${hocKy}`;
}

// Hàm lấy danh sách MaTieuChi từ MaKhoi
async function getTieuChiByKhoi(maKhoi) {
  return await TieuChiDauRa.find({ MaKhoi: maKhoi });
}

// Hàm nhóm tiêu chí theo PLO
function groupTieuChiByPLO(tieuChiResults) {
  const ploGroups = {};
  tieuChiResults.forEach(tc => {
    if (!ploGroups[tc.MaPLO]) {
      ploGroups[tc.MaPLO] = [];
    }
    ploGroups[tc.MaPLO].push(tc);
  });
  
  // Chuyển đổi thành mảng cho dễ sắp xếp
  const ploGroupsArray = Object.keys(ploGroups).map(plo => ({
    MaPLO: plo,
    TieuChiList: ploGroups[plo],
    MaTieuChiList: ploGroups[plo].map(tc => tc.MaTieuChi)
  }));
  
  // Sắp xếp theo MaPLO
  ploGroupsArray.sort((a, b) => {
    if (a.MaPLO < b.MaPLO) return -1;
    if (a.MaPLO > b.MaPLO) return 1;
    return 0;
  });
  
  return ploGroupsArray;
}

// Hàm lấy danh sách MaMH từ danh sách MaTieuChi
async function getMonHocByTieuChi(ploGroupsArray) {
  const ploMonHocMap = {};
  const allMonHocResults = [];
  
  for (const ploGroup of ploGroupsArray) {
    const monHocResults = await MonHocTieuChi.find({ 
      MaTieuChi: { $in: ploGroup.MaTieuChiList }
    });
    
    ploGroup.MonHocList = [...new Set(monHocResults.map(mh => mh.MaMH))];
    ploMonHocMap[ploGroup.MaPLO] = ploGroup.MonHocList;
    
    // Thêm vào tổng hợp
    allMonHocResults.push(...monHocResults);
  }
  
  // Lấy danh sách tất cả MaMH (không trùng lặp)
  const allMaMHList = [...new Set(allMonHocResults.map(mh => mh.MaMH))];
  
  return {
    ploMonHocMap,
    allMonHocResults,
    allMaMHList
  };
}

// Hàm lấy điểm của sinh viên
async function getDiemSinhVien(maMHList, namHK) {
  return await DiemSinhVien.find({
    MaMH: { $in: maMHList },
    NamHK: namHK
  });
}

// Hàm lấy thông tin sinh viên
async function getSinhVienDetails(maSVList) {
  return await HienDienSV.find({
    MaSV: { $in: maSVList }
  }).select('MaSV MaKhoa MaNgChng MaKhoi');
}

// Hàm tạo bảng ánh xạ môn học - PLO
function createMonHocToPLOMap(ploMonHocMap) {
  const monHocToPLO = {};
  
  for (const [plo, monHocList] of Object.entries(ploMonHocMap)) {
    monHocList.forEach(maMH => {
      if (!monHocToPLO[maMH]) {
        monHocToPLO[maMH] = [];
      }
      if (!monHocToPLO[maMH].includes(plo)) {
        monHocToPLO[maMH].push(plo);
      }
    });
  }
  
  return monHocToPLO;
}

// Hàm tái cấu trúc dữ liệu theo PLO và MaMH
function structureDataByPLOAndMonHoc(diemResults, ploMonHocMap, monHocToPLO) {
  // Cấu trúc: { PLO1: { MaMH1: [điểm1, điểm2...], MaMH2: [điểm1, điểm2...] }, PLO2: {...} }
  const ploMonHocDiemMap = {};
  
  // Khởi tạo cấu trúc cho mỗi PLO
  for (const plo in ploMonHocMap) {
    ploMonHocDiemMap[plo] = {};
    
    // Khởi tạo mảng trống cho mỗi môn học thuộc PLO này
    ploMonHocMap[plo].forEach(maMH => {
      ploMonHocDiemMap[plo][maMH] = [];
    });
  }
  
  // Phân loại điểm vào cấu trúc
  diemResults.forEach(diem => {
    const maMH = diem.MaMH;
    // Lấy danh sách PLO của môn học này
    const ploList = monHocToPLO[maMH] || [];
    
    // Thêm điểm vào mỗi PLO có chứa môn học này
    ploList.forEach(plo => {
      if (ploMonHocDiemMap[plo] && ploMonHocDiemMap[plo][maMH]) {
        ploMonHocDiemMap[plo][maMH].push(diem);
      }
    });
  });
  
  return ploMonHocDiemMap;
}

// Hàm phân tích điểm theo sinh viên và PLO
function analyzeDiemByPLO(diemResults, monHocToPLO) {
  const svDiemMap = {};
  const svPLOStatusMap = {};
  
  diemResults.forEach(diem => {
    // Tạo map điểm theo sinh viên
    if (!svDiemMap[diem.MaSV]) {
      svDiemMap[diem.MaSV] = [];
    }
    svDiemMap[diem.MaSV].push(diem);
    
    // Thêm thông tin PLO vào điểm
    const ploList = monHocToPLO[diem.MaMH] || [];
    diem.PLOList = ploList;
    
    // Cập nhật trạng thái PLO của sinh viên
    if (!svPLOStatusMap[diem.MaSV]) {
      svPLOStatusMap[diem.MaSV] = {};
    }
    
    ploList.forEach(plo => {
      if (!svPLOStatusMap[diem.MaSV][plo]) {
        svPLOStatusMap[diem.MaSV][plo] = {
          monHocCount: 0,
          totalScore: 0,
          validScores: 0,
          monHocList: []
        };
      }
      
      svPLOStatusMap[diem.MaSV][plo].monHocCount++;
      svPLOStatusMap[diem.MaSV][plo].monHocList.push(diem.MaMH);
      
      if (diem.DiemSoHP && !isNaN(parseFloat(diem.DiemSoHP))) {
        svPLOStatusMap[diem.MaSV][plo].totalScore += parseFloat(diem.DiemSoHP);
        svPLOStatusMap[diem.MaSV][plo].validScores++;
      }
    });
  });
  
  // Tính điểm trung bình cho từng PLO
  for (const maSV in svPLOStatusMap) {
    for (const plo in svPLOStatusMap[maSV]) {
      const status = svPLOStatusMap[maSV][plo];
      if (status.validScores > 0) {
        status.avgScore = (status.totalScore / status.validScores).toFixed(2);
      } else {
        status.avgScore = 'N/A';
      }
    }
  }
  
  return {
    svDiemMap,
    svPLOStatusMap
  };
}

// Hàm tạo dữ liệu kết quả cuối cùng
function createFinalResults(maSVList, svMap, svDiemMap, svPLOStatusMap) {
  return maSVList.map(maSV => {
    // Tính điểm trung bình tổng thể
    const diemList = svDiemMap[maSV] || [];
    let totalScore = 0;
    let validScores = 0;
    
    diemList.forEach(diem => {
      if (diem.DiemSoHP && !isNaN(parseFloat(diem.DiemSoHP))) {
        totalScore += parseFloat(diem.DiemSoHP);
        validScores++;
      }
    });
    
    const avgScore = validScores > 0 ? (totalScore / validScores).toFixed(2) : 'N/A';
    
    return {
      sinhVien: svMap[maSV] || { MaSV: maSV },
      diemList: diemList,
      monHocCount: diemList.length,
      avgScore: avgScore,
      ploStatus: svPLOStatusMap[maSV] || {}
    };
  });
}

// Hàm lấy danh sách năm học kỳ
async function getNamHKList() {
  const namHKList = await DiemSinhVien.distinct('NamHK');
  namHKList.sort((a, b) => b - a);
  
  return namHKList.map(namHK => ({
    value: namHK,
    formatted: formatNamHK(namHK)
  }));
}

// Hàm hiển thị form tìm kiếm
exports.getSearchSVKhoiForm = async (req, res) => {
  try {
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown
    const formattedNamHKList = await getNamHKList();
    
    res.render('index', { 
      title: 'Tìm sinh viên theo khối và năm học kỳ',
      sinhVienTheoKhoiSearchMode: true,
      namHKList: formattedNamHKList,
      maKhoiQuery: '',
      selectedNamHK: null,
      svKhoiResults: null,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      formatNamHK: formatNamHK
    });
  } catch (error) {
    console.error('Error loading sinh vien theo khoi form:', error);
    res.render('index', { 
      title: 'Lỗi',
      error: 'Đã xảy ra lỗi khi tải trang tìm sinh viên theo khối.',
      sinhVienTheoKhoiSearchMode: true,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      formatNamHK: formatNamHK
    });
  }
};

// Hàm xử lý tìm kiếm
exports.searchSVTheoKhoi = async (req, res) => {
  try {
    const maKhoi = req.body.maKhoi;
    const namHK = req.body.namHK ? parseInt(req.body.namHK) : null;
    
    // Kiểm tra các thông tin đầu vào
    if (!maKhoi || !namHK) {
      const formattedNamHKList = await getNamHKList();
      
      return res.render('index', {
        title: 'Tìm sinh viên theo khối và năm học kỳ',
        sinhVienTheoKhoiSearchMode: true,
        namHKList: formattedNamHKList,
        maKhoiQuery: maKhoi,
        selectedNamHK: namHK,
        error: 'Vui lòng nhập đầy đủ mã khối và chọn năm học kỳ.',
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        formatNamHK: formatNamHK
      });
    }
    
    // Bước 1: Tìm các MaTieuChi từ MaKhoi
    const tieuChiResults = await getTieuChiByKhoi(maKhoi);
    
    if (tieuChiResults.length === 0) {
      const formattedNamHKList = await getNamHKList();
      
      return res.render('index', {
        title: 'Tìm sinh viên theo khối và năm học kỳ',
        sinhVienTheoKhoiSearchMode: true,
        namHKList: formattedNamHKList,
        maKhoiQuery: maKhoi,
        selectedNamHK: namHK,
        error: `Không tìm thấy tiêu chí nào cho mã khối "${maKhoi}".`,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        formatNamHK: formatNamHK
      });
    }
    
    // Bước 2: Nhóm tiêu chí theo PLO
    const ploGroupsArray = groupTieuChiByPLO(tieuChiResults);
    
    // Bước 3: Lấy danh sách MaMH từ MaTieuChi
    const { ploMonHocMap, allMonHocResults, allMaMHList } = await getMonHocByTieuChi(ploGroupsArray);
    
    if (allMonHocResults.length === 0) {
      const formattedNamHKList = await getNamHKList();
      
      return res.render('index', {
        title: 'Tìm sinh viên theo khối và năm học kỳ',
        sinhVienTheoKhoiSearchMode: true,
        namHKList: formattedNamHKList,
        maKhoiQuery: maKhoi,
        selectedNamHK: namHK,
        error: `Không tìm thấy môn học nào liên quan đến mã khối "${maKhoi}".`,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        formatNamHK: formatNamHK
      });
    }
    
    // Bước 4: Lấy điểm của sinh viên
    const diemResults = await getDiemSinhVien(allMaMHList, namHK);
    
    if (diemResults.length === 0) {
      const formattedNamHKList = await getNamHKList();
      
      return res.render('index', {
        title: 'Tìm sinh viên theo khối và năm học kỳ',
        sinhVienTheoKhoiSearchMode: true,
        namHKList: formattedNamHKList,
        maKhoiQuery: maKhoi,
        selectedNamHK: namHK,
        error: `Không tìm thấy sinh viên nào có điểm môn học thuộc khối "${maKhoi}" trong năm học kỳ ${formatNamHK(namHK)}.`,
        showSearchSection: false,
        sinhVienSearchMode: false,
        diemSinhVienSearchMode: false,
        formatNamHK: formatNamHK
      });
    }
    
    // Bước 5: Lấy danh sách duy nhất của sinh viên
    const maSVList = [...new Set(diemResults.map(diem => diem.MaSV))];
    
    // Bước 6: Lấy thông tin chi tiết về các sinh viên
    const sinhVienDetails = await getSinhVienDetails(maSVList);
    
    // Tạo Map để lưu trữ thông tin sinh viên để truy cập nhanh
    const svMap = {};
    sinhVienDetails.forEach(sv => {
      svMap[sv.MaSV] = sv;
    });
    
    // Bước 7: Tạo bảng ánh xạ môn học - PLO
    const monHocToPLO = createMonHocToPLOMap(ploMonHocMap);
    
    // Bước 8: Tái cấu trúc dữ liệu theo PLO và môn học
    const ploMonHocDiemMap = structureDataByPLOAndMonHoc(diemResults, ploMonHocMap, monHocToPLO);
    
    // Bước 9: Phân tích điểm theo sinh viên và PLO
    const { svDiemMap, svPLOStatusMap } = analyzeDiemByPLO(diemResults, monHocToPLO);
    
    // Bước 10: Tạo dữ liệu kết quả cuối cùng
    const svResults = createFinalResults(maSVList, svMap, svDiemMap, svPLOStatusMap);
    
    // Sắp xếp kết quả theo MaSV
    svResults.sort((a, b) => {
      if (a.sinhVien.MaSV < b.sinhVien.MaSV) return -1;
      if (a.sinhVien.MaSV > b.sinhVien.MaSV) return 1;
      return 0;
    });
    
    // Lấy danh sách năm học kỳ để hiển thị dropdown
    const formattedNamHKList = await getNamHKList();
    
    // Tăng cường đối tượng ploGroupsArray với thông tin môn học và điểm
    ploGroupsArray.forEach(ploGroup => {
      // Lấy danh sách môn học cho PLO này
      const monHocList = ploMonHocMap[ploGroup.MaPLO] || [];
      
      // Thêm thông tin chi tiết về môn học và điểm
      ploGroup.MonHocDiemMap = {};
      
      monHocList.forEach(maMH => {
        ploGroup.MonHocDiemMap[maMH] = ploMonHocDiemMap[ploGroup.MaPLO][maMH] || [];
      });
    });
    
    res.render('index', {
      title: 'Kết quả tìm sinh viên theo khối và năm học kỳ',
      sinhVienTheoKhoiSearchMode: true,
      namHKList: formattedNamHKList,
      maKhoiQuery: maKhoi,
      selectedNamHK: namHK,
      svKhoiResults: svResults,
      totalSV: svResults.length,
      ploGroupsArray: ploGroupsArray,
      ploMonHocDiemMap: ploMonHocDiemMap,
      maMHList: allMaMHList,
      namHKFormatted: formatNamHK(namHK),
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      formatNamHK: formatNamHK
    });
    
  } catch (error) {
    console.error('Sinh vien theo khoi search error:', error);
    
    // Lấy lại danh sách năm học kỳ
    const formattedNamHKList = await getNamHKList();
    
    res.render('index', {
      title: 'Lỗi tìm kiếm',
      error: 'Đã xảy ra lỗi khi tìm sinh viên theo khối. Vui lòng thử lại.',
      sinhVienTheoKhoiSearchMode: true,
      namHKList: formattedNamHKList,
      maKhoiQuery: req.body.maKhoi,
      selectedNamHK: req.body.namHK ? parseInt(req.body.namHK) : null,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false,
      formatNamHK: formatNamHK
    });
  }
};



// Tạo hàm tìm kiếm sinh viên độc lập với request/response
exports.findSinhVienByKhoiAndNamHK = async function(maKhoi, namHK) {
  try {
    // Bước 1: Tìm các MaTieuChi từ MaKhoi
    const tieuChiResults = await getTieuChiByKhoi(maKhoi);
    
    if (tieuChiResults.length === 0) {
      return { 
        success: false,
        error: `Không tìm thấy tiêu chí nào cho mã khối "${maKhoi}".`
      };
    }
    
    // Bước 2: Nhóm tiêu chí theo PLO
    const ploGroupsArray = groupTieuChiByPLO(tieuChiResults);
    
    // Bước 3: Lấy danh sách MaMH từ MaTieuChi
    const { ploMonHocMap, allMonHocResults, allMaMHList } = await getMonHocByTieuChi(ploGroupsArray);
    
    if (allMonHocResults.length === 0) {
      return { 
        success: false,
        error: `Không tìm thấy môn học nào liên quan đến mã khối "${maKhoi}".`
      };
    }
    
    // Bước 4: Lấy điểm của sinh viên
    const diemResults = await getDiemSinhVien(allMaMHList, namHK);
    
    if (diemResults.length === 0) {
      return { 
        success: false,
        error: `Không tìm thấy sinh viên nào có điểm môn học thuộc khối "${maKhoi}" trong năm học kỳ ${formatNamHK(namHK)}.`
      };
    }
    
    // Bước 5: Lấy danh sách duy nhất của sinh viên
    const maSVList = [...new Set(diemResults.map(diem => diem.MaSV))];
    
    // Bước 6: Lấy thông tin chi tiết về các sinh viên
    const sinhVienDetails = await getSinhVienDetails(maSVList);
    
    // Tạo Map để lưu trữ thông tin sinh viên để truy cập nhanh
    const svMap = {};
    sinhVienDetails.forEach(sv => {
      svMap[sv.MaSV] = sv;
    });
    
    // Bước 7: Tạo bảng ánh xạ môn học - PLO
    const monHocToPLO = createMonHocToPLOMap(ploMonHocMap);
    
    // Bước 8: Tái cấu trúc dữ liệu theo PLO và môn học
    const ploMonHocDiemMap = structureDataByPLOAndMonHoc(diemResults, ploMonHocMap, monHocToPLO);
    
    // Bước 9: Phân tích điểm theo sinh viên và PLO
    const { svDiemMap, svPLOStatusMap } = analyzeDiemByPLO(diemResults, monHocToPLO);
    
    // Bước 10: Tạo dữ liệu kết quả cuối cùng
    const svResults = createFinalResults(maSVList, svMap, svDiemMap, svPLOStatusMap);
    
    // Sắp xếp kết quả theo MaSV
    svResults.sort((a, b) => {
      if (a.sinhVien.MaSV < b.sinhVien.MaSV) return -1;
      if (a.sinhVien.MaSV > b.sinhVien.MaSV) return 1;
      return 0;
    });
    
    // Tăng cường đối tượng ploGroupsArray với thông tin môn học và điểm
    ploGroupsArray.forEach(ploGroup => {
      // Lấy danh sách môn học cho PLO này
      const monHocList = ploMonHocMap[ploGroup.MaPLO] || [];
      
      // Thêm thông tin chi tiết về môn học và điểm
      ploGroup.MonHocDiemMap = {};
      
      monHocList.forEach(maMH => {
        ploGroup.MonHocDiemMap[maMH] = ploMonHocDiemMap[ploGroup.MaPLO][maMH] || [];
      });
    });
    
    // Trả về kết quả
    return {
      success: true,
      data: {
        svResults,
        totalSV: svResults.length,
        ploGroupsArray,
        ploMonHocDiemMap,
        maMHList: allMaMHList,
        namHKFormatted: formatNamHK(namHK)
      }
    };
    
  } catch (error) {
    console.error('Find SV theo khoi error:', error);
    return { 
      success: false, 
      error: 'Đã xảy ra lỗi khi tìm sinh viên theo khối: ' + error.message 
    };
  }
};
// Cách dùng hàm ở chỗ khác
// // Trong một file controller khác, ví dụ controllers/someOtherController.js
// const svKhoiController = require('./sinhVienTheoKhoiController');

// // Sử dụng hàm này trong một route handler
// exports.someRouteHandler = async (req, res) => {
//   try {
//     const maKhoi = '20DIQN'; // Ví dụ mã khối
//     const namHK = 20201;     // Ví dụ năm học kỳ
    
//     // Gọi hàm và lấy kết quả
//     const result = await svKhoiController.findSinhVienByKhoiAndNamHK(maKhoi, namHK);
    
//     if (!result.success) {
//       console.error('Error:', result.error);
//       // Xử lý lỗi
//       return res.status(400).json({ error: result.error });
//     }
    
//     // Làm việc với kết quả
//     const { svResults, ploGroupsArray, ploMonHocDiemMap } = result.data;
    
//     // Ví dụ: Đếm số sinh viên đạt điểm > 8 trong một PLO cụ thể
//     let highScoreCount = 0;
//     const targetPLO = 'PLO1';
    
//     if (ploMonHocDiemMap[targetPLO]) {
//       // Lặp qua các môn học của PLO này
//       Object.keys(ploMonHocDiemMap[targetPLO]).forEach(maMH => {
//         const diemList = ploMonHocDiemMap[targetPLO][maMH];
//         // Đếm số điểm > 8
//         diemList.forEach(diem => {
//           if (diem.DiemSoHP && parseFloat(diem.DiemSoHP) > 8) {
//             highScoreCount++;
//           }
//         });
//       });
//     }
    
//     // Trả về kết quả phân tích
//     res.json({
//       totalStudents: svResults.length,
//       highScoreCount,
//       // Các dữ liệu khác...
//     });
    
//   } catch (error) {
//     console.error('Error in someRouteHandler:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };



module.exports.formatNamHK = formatNamHK;