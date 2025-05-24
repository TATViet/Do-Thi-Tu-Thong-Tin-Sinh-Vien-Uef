// controllers/ploProgressController.js

const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const HienDienSV = require('../models/HienDienSV');
const DiemSinhVien = require('../models/DiemSinhVien');

// Hàm để chuyển đổi số NamHK sang định dạng dễ đọc
function formatNamHK(namHK) {
  const namHKStr = namHK.toString();
  const nam = namHKStr.substring(0, 4);
  const hocKy = namHKStr.charAt(4);
  return `năm ${nam} HK${hocKy}`;
}

// Hàm chuyển đổi HK3 thành HK1 năm sau
function normalizeNamHK(namHK) {
  const namHKStr = namHK.toString();
  const nam = parseInt(namHKStr.substring(0, 4));
  const hocKy = parseInt(namHKStr.charAt(4));
  
  // Nếu là HK3, chuyển thành HK1 năm sau
  if (hocKy === 3) {
    return (nam + 1) * 10 + 1; // Ví dụ: 20203 -> 20211
  }
  
  return namHK;
}

// Hàm kiểm tra tất cả các tiêu chí có đạt không
function checkAllPassed(diem, tieuChiList) {
  let allPassed = true;
  
  for (const tc of tieuChiList) {
    let passed = false;
    
    // Kiểm tra theo loại điểm
    switch (tc.loaiDiem) {
      case 'CK':
        passed = diem.CuoiKy !== undefined && diem.CuoiKy >= tc.diemChon;
        break;
      case 'GK':
        passed = diem.GiuaKy !== undefined && diem.GiuaKy >= tc.diemChon;
        break;
      case 'QT':
        passed = diem.QuaTrinh !== undefined && diem.QuaTrinh >= tc.diemChon;
        break;
      default:
        passed = diem.DiemSoHP !== undefined && diem.DiemSoHP >= tc.diemChon;
    }
    
    if (!passed) {
      allPassed = false;
      break;
    }
  }
  
  return allPassed;
}

exports.getPLOProgressForm = async (req, res) => {
  try {
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown (nếu cần)
    const namHKList = await DiemSinhVien.distinct('NamHK');
    namHKList.sort((a, b) => b - a);
    
    const formattedNamHKList = namHKList.map(namHK => ({
      value: namHK,
      formatted: formatNamHK(namHK)
    }));
    
    res.render('index', { 
      title: 'Theo dõi tiến trình PLO của sinh viên',
      ploProgressMode: true,
      namHKList: formattedNamHKList,
      maKhoiQuery: '',
      formatNamHK: formatNamHK,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false
    });
  } catch (error) {
    console.error('Error loading PLO progress form:', error);
    res.render('index', { 
      title: 'Lỗi',
      error: 'Đã xảy ra lỗi khi tải trang theo dõi tiến trình PLO.',
      ploProgressMode: true,
      formatNamHK: formatNamHK,
      showSearchSection: false
    });
  }
};

exports.searchPLOProgress = async (req, res) => {
  try {
    const maKhoi = req.body.maKhoi;
    const maSV = req.body.maSV; // Thêm field này để nhận mã SV từ form
    
    // Lấy danh sách sinh viên thuộc khối để hiển thị
    let sinhVienList = [];
    let ploProgressResults = null;
    let uniqueSinhVienList = []; // Thêm biến này
    let studentInfo = null; //có thể xóa cái này
    
    if (maKhoi) {
      // Lấy danh sách sinh viên thuộc khối để hiển thị trong danh sách
      sinhVienList = await HienDienSV.find({ MaKhoi: maKhoi }).lean();
      
      if (!sinhVienList || sinhVienList.length === 0) {
        return res.render('index', {
          title: 'Kết quả theo dõi tiến trình PLO',
          ploProgressMode: true,
          maKhoiQuery: maKhoi,
          error: `Không tìm thấy sinh viên nào thuộc mã khối "${maKhoi}".`,
          formatNamHK: formatNamHK,
          showSearchSection: false,
          sinhVienSearchMode: false,
          diemSinhVienSearchMode: false
        });
      }
      
      // Nếu có maSV, gọi hàm xử lý tiến trình PLO
      if (maSV) {
        const progressResults = await trackStudentPLOProgress(maKhoi, maSV);
        
        if (progressResults.success) {
          ploProgressResults = progressResults.data;
          studentInfo = progressResults.data.sinhVien.info;
        } else {
          // Nếu có lỗi, hiển thị thông báo lỗi
          return res.render('index', {
            title: 'Kết quả theo dõi tiến trình PLO',
            ploProgressMode: true,
            maKhoiQuery: maKhoi,
            sinhVienOptions: sinhVienList,
            studentInfo: studentInfo,
            selectedMaSV: maSV,
            error: progressResults.error,
            formatNamHK: formatNamHK,
            showSearchSection: false,
            sinhVienSearchMode: false,
            diemSinhVienSearchMode: false
          });
        }
      }
    }
    
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown
    const namHKList = await DiemSinhVien.distinct('NamHK');
    namHKList.sort((a, b) => b - a);
    
    const formattedNamHKList = namHKList.map(namHK => ({
      value: namHK,
      formatted: formatNamHK(namHK)
    }));
    
    // Render trang với data phù hợp
    res.render('index', {
      title: 'Kết quả theo dõi tiến trình PLO',
      ploProgressMode: true,
      namHKList: formattedNamHKList,
      maKhoiQuery: maKhoi,
      sinhVienOptions: sinhVienList,
      selectedMaSV: maSV,
      ploProgressResults: ploProgressResults,
      formatNamHK: formatNamHK,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false
    });
    
  } catch (error) {
    console.error('PLO progress search error:', error);
    
    // Lấy danh sách năm học kỳ để hiển thị trong dropdown
    const namHKList = await DiemSinhVien.distinct('NamHK');
    namHKList.sort((a, b) => b - a);
    
    const formattedNamHKList = namHKList.map(namHK => ({
      value: namHK,
      formatted: formatNamHK(namHK)
    }));
    
    res.render('index', {
      title: 'Lỗi',
      error: 'Đã xảy ra lỗi khi tìm kiếm tiến trình PLO: ' + error.message,
      ploProgressMode: true,
      namHKList: formattedNamHKList,
      maKhoiQuery: req.body.maKhoi,
      formatNamHK: formatNamHK,
      showSearchSection: false,
      sinhVienSearchMode: false,
      diemSinhVienSearchMode: false
    });
  }
};

/**
 * Function chính để theo dõi tiến trình của sinh viên theo PLO
 * @param {string} maKhoi - Mã khối người dùng nhập
 * @param {string} maSV - Mã sinh viên cần kiểm tra
 * @returns {Promise<Object>} - Kết quả phân tích
 */
async function trackStudentPLOProgress(maKhoi, maSV) {
  try {
    // Kiểm tra sinh viên có thuộc khối hay không
    const sinhVien = await HienDienSV.findOne({ MaKhoi: maKhoi, MaSV: maSV }).lean();
    
    if (!sinhVien) {
      return {
        success: false,
        error: `Sinh viên có mã ${maSV} không thuộc mã khối "${maKhoi}".`
      };
    }
    
    // BƯỚC 1: Lấy thông tin tiêu chí và nhóm PLO từ MaKhoi
    const tieuChiResults = await TieuChiDauRa.find({ MaKhoi: maKhoi }).lean();
    
    if (!tieuChiResults || tieuChiResults.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy tiêu chí nào cho mã khối "${maKhoi}".`
      };
    }
    
    // Nhóm tiêu chí theo PLO
    const ploGroups = {};
    tieuChiResults.forEach(tc => {
      const plo = tc.MaPLO;
      if (!ploGroups[plo]) {
        ploGroups[plo] = {
          maPLO: plo,
          nhomPLO: tc.NhomPLO || 'Không xác định',
          tieuChiList: []
        };
      }
      ploGroups[plo].tieuChiList.push(tc.MaTieuChi);
    });
    
    // Lấy danh sách MaTieuChi
    const maTieuChiList = tieuChiResults.map(tc => tc.MaTieuChi);
    
    // BƯỚC 2: Lấy thông tin chi tiết môn học từ MaTieuChi
    const monHocTieuChiResults = await MonHocTieuChi.find({
      MaTieuChi: { $in: maTieuChiList }
    }).lean();
    
    if (!monHocTieuChiResults || monHocTieuChiResults.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy môn học nào cho các tiêu chí của mã khối "${maKhoi}".`
      };
    }
    
    // Tạo map từ MaTieuChi đến PLO
    const tieuChiToPLOMap = {};
    tieuChiResults.forEach(tc => {
      tieuChiToPLOMap[tc.MaTieuChi] = tc.MaPLO;
    });
    
    // Tạo map từ môn học đến các tiêu chí và PLO liên quan
    const monHocMap = {};
    monHocTieuChiResults.forEach(mh => {
      const maMH = mh.MaMH;
      const maTieuChi = mh.MaTieuChi;
      const plo = tieuChiToPLOMap[maTieuChi];
      
      if (!monHocMap[maMH]) {
        monHocMap[maMH] = {
          maMH: maMH,
          ploList: new Set(),
          tieuChiDetails: {}
        };
      }
      
      monHocMap[maMH].ploList.add(plo);
      
      // Lưu thông tin chi tiết về tiêu chí, loại điểm, điểm chuẩn và trọng số
      if (!monHocMap[maMH].tieuChiDetails[maTieuChi]) {
        monHocMap[maMH].tieuChiDetails[maTieuChi] = {
          maTieuChi: maTieuChi,
          plo: plo,
          loaiDiem: mh.LoaiDiem || 'CK', // Mặc định là CK nếu không có
          diemChon: mh.DiemChon || 5,    // Mặc định là 5 nếu không có
          trongSo: mh.TrongSo || 1        // Mặc định là 1 nếu không có
        };
      }
    });
    
    // Lấy danh sách duy nhất các môn học
    const maMHList = Object.keys(monHocMap);
    
    // BƯỚC 3: Lấy tất cả điểm của sinh viên
    const allDiemResults = await DiemSinhVien.find({
      MaSV: maSV,
      MaMH: { $in: maMHList }
    }).lean();
    
    // Chuẩn hóa dữ liệu điểm số (chuyển HK3 thành HK1 năm sau)
    const normalizedDiemResults = [];
    allDiemResults.forEach(diem => {
      const normalizedDiem = {...diem};
      normalizedDiem.originalNamHK = diem.NamHK; // Lưu lại giá trị gốc
      normalizedDiem.NamHK = normalizeNamHK(diem.NamHK);
      normalizedDiemResults.push(normalizedDiem);
    });
    
    // Lấy các năm học kỳ duy nhất sau khi chuẩn hóa
    const uniqueNormalizedNamHKList = [...new Set(normalizedDiemResults.map(diem => diem.NamHK))];
    
    // Lọc chỉ giữ lại HK1 và HK2
    const filteredNamHKList = uniqueNormalizedNamHKList.filter(namHK => {
      const hocKy = namHK.toString().charAt(4);
      return hocKy === '1' || hocKy === '2';
    }).sort((a, b) => a - b); // Sắp xếp tăng dần
    
    // Tạo cấu trúc dữ liệu theo yêu cầu MaSV -> PLO -> NamHK -> MaMH
    const studentPLOProgress = {
      MaSV: maSV,
      info: sinhVien,
      plos: {}
    };
    
    // Khởi tạo cấu trúc dữ liệu cho từng PLO
    Object.keys(ploGroups).forEach(plo => {
      studentPLOProgress.plos[plo] = {
        maPLO: plo,
        nhomPLO: ploGroups[plo].nhomPLO,
        semesters: {}
      };
      
      // Khởi tạo dữ liệu cho từng học kỳ đã lọc
      filteredNamHKList.forEach(namHK => {
        studentPLOProgress.plos[plo].semesters[namHK] = {
          namHK: namHK,
          formattedNamHK: formatNamHK(namHK),
          monHocStatus: {},
          totalWeight: 0,
          achievedWeight: 0,
          notAchievedWeight: 0,
          notAttemptedWeight: 0,
          achievedRatio: "0/0",
          achievedPercent: 0,
          notAchievedPercent: 0,
          notAttemptedPercent: 0,
          allAchieved: false
        };
      });
    });
    
    // Tính toán tổng trọng số cho từng PLO
    Object.keys(ploGroups).forEach(plo => {
      let totalPLOWeight = 0;
      
      // Duyệt qua từng môn học và tính tổng trọng số
      maMHList.forEach(maMH => {
        const monHocInfo = monHocMap[maMH];
        if (!monHocInfo.ploList.has(plo)) return;
        
        // Tìm các tiêu chí của môn học thuộc PLO này
        const tieuChiList = Object.values(monHocInfo.tieuChiDetails)
          .filter(tc => tc.plo === plo);
        
        // Nếu không có tiêu chí nào, bỏ qua
        if (tieuChiList.length === 0) return;
        
        // Tính tổng trọng số của môn học cho PLO này
        let totalMonHocWeight = 0;
        tieuChiList.forEach(tc => {
          totalMonHocWeight += tc.trongSo;
        });
        
        totalPLOWeight += totalMonHocWeight;
      });
      
      // Cập nhật tổng trọng số cho từng học kỳ đã lọc
      filteredNamHKList.forEach(namHK => {
        studentPLOProgress.plos[plo].semesters[namHK].totalWeight = totalPLOWeight;
      });
    });
    
    // Nhóm điểm theo môn học và năm học kỳ đã chuẩn hóa
    const normalizedDiemByMaMHAndNamHK = {};
    
    if (normalizedDiemResults && normalizedDiemResults.length > 0) {
      normalizedDiemResults.forEach(diem => {
        const maMH = diem.MaMH;
        const namHK = diem.NamHK;
        const key = `${maMH}_${namHK}`;
        
        if (!normalizedDiemByMaMHAndNamHK[key]) {
          normalizedDiemByMaMHAndNamHK[key] = [];
        }
        
        normalizedDiemByMaMHAndNamHK[key].push(diem);
      });
    }
    
    // Tính toán trạng thái môn học cho từng học kỳ
    maMHList.forEach(maMH => {
      const monHocInfo = monHocMap[maMH];
      
      // Duyệt qua từng PLO liên quan đến môn học
      monHocInfo.ploList.forEach(plo => {
        // Tìm các tiêu chí của môn học thuộc PLO này
        const tieuChiList = Object.values(monHocInfo.tieuChiDetails)
          .filter(tc => tc.plo === plo);
        
        // Nếu không có tiêu chí nào, bỏ qua
        if (tieuChiList.length === 0) return;
        
        // Tính tổng trọng số của môn học cho PLO này
        let totalMonHocWeight = 0;
        tieuChiList.forEach(tc => {
          totalMonHocWeight += tc.trongSo;
        });
        
        // Khởi tạo trạng thái môn học là "chưa có" cho tất cả học kỳ đã lọc
        filteredNamHKList.forEach(namHK => {
          studentPLOProgress.plos[plo].semesters[namHK].monHocStatus[maMH] = {
            maMH: maMH,
            status: 'chuaco',
            trongSo: totalMonHocWeight
          };
          
          // Cập nhật trọng số chưa học
          studentPLOProgress.plos[plo].semesters[namHK].notAttemptedWeight += totalMonHocWeight;
        });
        
        // Biến theo dõi trạng thái hiện tại và học kỳ đã đạt
        let currentStatus = 'chuaco';
        let achievedInHK = null;
        
        // Duyệt qua từng học kỳ đã lọc theo thứ tự tăng dần
        for (const namHK of filteredNamHKList) {
          const key = `${maMH}_${namHK}`;
          const diemList = normalizedDiemByMaMHAndNamHK[key] || [];
          
          if (diemList.length > 0) {
            // Sắp xếp để ưu tiên điểm có trạng thái "đạt" trước
            diemList.sort((a, b) => {
              // Kiểm tra xem a có đạt không
              const aAllPassed = checkAllPassed(a, tieuChiList);
              // Kiểm tra xem b có đạt không
              const bAllPassed = checkAllPassed(b, tieuChiList);
              
              // Ưu tiên điểm đạt
              if (aAllPassed && !bAllPassed) return -1;
              if (!aAllPassed && bAllPassed) return 1;
              
              // Nếu cùng trạng thái, ưu tiên điểm học kỳ gốc lớn hơn
              return b.originalNamHK - a.originalNamHK;
            });
            
            // Lấy điểm tốt nhất (đã được sắp xếp ở trên)
            const bestDiem = diemList[0];
            
            // Kiểm tra đạt hay không theo điểm tốt nhất
            const allPassed = checkAllPassed(bestDiem, tieuChiList);
            
            // Nếu đã có trạng thái 'dat' ở học kỳ trước, giữ nguyên
            if (currentStatus === 'dat') {
              // Không làm gì, giữ trạng thái 'dat'
            } else {
              // Cập nhật trạng thái hiện tại dựa trên điểm tốt nhất
              currentStatus = allPassed ? 'dat' : 'khongdat';
              
              // Nếu đạt, lưu lại học kỳ đã đạt
              if (allPassed) {
                achievedInHK = namHK;
              }
            }
          }
          
          // Cập nhật trạng thái môn học cho học kỳ hiện tại
          const semesterInfo = studentPLOProgress.plos[plo].semesters[namHK];
          
          // Trạng thái môn học cũ
          const oldStatus = semesterInfo.monHocStatus[maMH].status;
          
          // Nếu trạng thái thay đổi, cập nhật lại trọng số
          if (oldStatus !== currentStatus) {
            // Trừ trọng số cũ
            switch (oldStatus) {
              case 'dat':
                semesterInfo.achievedWeight -= totalMonHocWeight;
                break;
              case 'khongdat':
                semesterInfo.notAchievedWeight -= totalMonHocWeight;
                break;
              case 'chuaco':
                semesterInfo.notAttemptedWeight -= totalMonHocWeight;
                break;
            }
            
            
            // Cộng trọng số mới
            switch (currentStatus) {
              case 'dat':
                semesterInfo.achievedWeight += totalMonHocWeight;
                break;
              case 'khongdat':
                semesterInfo.notAchievedWeight += totalMonHocWeight;
                break;
              case 'chuaco':
                semesterInfo.notAttemptedWeight += totalMonHocWeight;
                break;
            }
            
            // Cập nhật trạng thái môn học
            semesterInfo.monHocStatus[maMH] = {
              maMH: maMH,
              status: currentStatus,
              trongSo: totalMonHocWeight,
              achievedInHK: achievedInHK // Thêm thông tin về học kỳ đã đạt
            };
          }
        }
      });
    });
    
    // Tính tỷ lệ đạt/tổng và phần trăm cho từng học kỳ
    Object.keys(ploGroups).forEach(plo => {
      const ploData = studentPLOProgress.plos[plo];
      
      filteredNamHKList.forEach(namHK => {
        const semester = ploData.semesters[namHK];
        const totalWeight = semester.totalWeight;
        
        // Tính tỷ lệ đạt/tổng
        semester.achievedRatio = `${semester.achievedWeight.toFixed(2)}/${totalWeight.toFixed(2)}`;
        
        // Tính phần trăm cho từng loại trạng thái
        if (totalWeight > 0) {
          semester.achievedPercent = (semester.achievedWeight / totalWeight * 100);
          semester.notAchievedPercent = (semester.notAchievedWeight / totalWeight * 100);
          semester.notAttemptedPercent = (semester.notAttemptedWeight / totalWeight * 100);
        }
        
        // Kiểm tra xem tất cả các môn học đều đạt chưa
        semester.allAchieved = (semester.achievedWeight > 0 && semester.achievedWeight >= totalWeight);
      });
    });


// Lấy tất cả các NamHK từ DiemSinhVien
    const allNamHKResults = await DiemSinhVien.distinct('NamHK');
    // Tạo mảng số từ kết quả
    let allSemesters = allNamHKResults.map(Number);
    
    // Xác định học kỳ cao nhất
    const maxNamHK = allSemesters.length > 0 ? Math.max(...allSemesters) : 20241;
    const maxYear = Math.floor(maxNamHK / 10);
    const maxSemester = maxNamHK % 10;
    
    // Tạo danh sách đầy đủ học kỳ từ 2020.1 đến học kỳ cao nhất
    allSemesters = [];
    for (let year = 2020; year <= maxYear; year++) {
      for (let semester = 1; semester <= 2; semester++) {
        if (year < maxYear || (year === maxYear && semester <= maxSemester)) {
          allSemesters.push(year * 10 + semester);
        }
      }
    }
    
    // Sử dụng hàm ensureFullSemesters để đảm bảo dữ liệu đầy đủ
    const updatedStudentPLOProgress = ensureFullSemesters(studentPLOProgress, allSemesters);
    
    return {
      success: true,
      data: {
        sinhVien: updatedStudentPLOProgress,
        ploGroups: ploGroups,
        namHKList: filteredNamHKList.map(namHK => ({
          value: namHK,
          formatted: formatNamHK(namHK)
        }))
      }
    };
    
  } catch (error) {
    console.error('Error in trackStudentPLOProgress:', error);
    return {
      success: false,
      error: `Đã xảy ra lỗi khi xử lý dữ liệu: ${error.message}`
    };
  }
}

exports.trackStudentPLOProgress = trackStudentPLOProgress;


// Thêm vào cuối file controllers/ploProgressController.js

// Hàm này sẽ đảm bảo dữ liệu PLO được đầy đủ cho tất cả học kỳ
function ensureFullSemesters(studentPLOProgress, allSemesters) {
  if (!studentPLOProgress || !studentPLOProgress.plos) return studentPLOProgress;
  
  // Duyệt qua từng PLO
  Object.keys(studentPLOProgress.plos).forEach(plo => {
    const semesters = studentPLOProgress.plos[plo].semesters || {};
    
    // Sắp xếp các học kỳ đã có theo thứ tự tăng dần
    const existingSemesters = Object.keys(semesters).map(Number).sort((a, b) => a - b);
    if (existingSemesters.length === 0) return; // Không có dữ liệu học kỳ nào
    
    // Điền vào tất cả các khoảng trống giữa các học kỳ
    for (let i = 0; i < existingSemesters.length; i++) {
      const currentSemester = existingSemesters[i];
      const nextSemester = (i < existingSemesters.length - 1) ? existingSemesters[i + 1] : null;
      
      if (nextSemester) {
        // Tìm tất cả các học kỳ nằm giữa currentSemester và nextSemester
        allSemesters.forEach(namHK => {
          const numNamHK = Number(namHK);
          if (numNamHK > currentSemester && numNamHK < nextSemester && !semesters[numNamHK]) {
            // Sao chép dữ liệu từ học kỳ hiện tại
            semesters[numNamHK] = JSON.parse(JSON.stringify(semesters[currentSemester]));
            semesters[numNamHK].namHK = numNamHK;
            semesters[numNamHK].formattedNamHK = formatNamHK(numNamHK);
          }
        });
      }
    }
    
    // Sao chép dữ liệu từ học kỳ mới nhất cho các học kỳ sau đó
    const latestSemester = existingSemesters[existingSemesters.length - 1];
    allSemesters.forEach(namHK => {
      const numNamHK = Number(namHK);
      if (numNamHK > latestSemester && !semesters[numNamHK]) {
        // Sao chép dữ liệu từ học kỳ mới nhất
        semesters[numNamHK] = JSON.parse(JSON.stringify(semesters[latestSemester]));
        semesters[numNamHK].namHK = numNamHK;
        semesters[numNamHK].formattedNamHK = formatNamHK(numNamHK);
      }
    });
  });
  
  return studentPLOProgress;
}

function getUniqueStudents(sinhVienList) {
  const uniqueMaSVs = new Set();
  const uniqueSVs = [];
  
  sinhVienList.forEach(sv => {
    if (!uniqueMaSVs.has(sv.MaSV)) {
      uniqueMaSVs.add(sv.MaSV);
      uniqueSVs.push(sv);
    }
  });
  
  return uniqueSVs;
}

// Export các hàm cần thiết
exports.trackStudentPLOProgress = trackStudentPLOProgress;
exports.formatNamHK = formatNamHK;
exports.ensureFullSemesters = ensureFullSemesters;
exports.getUniqueStudents = getUniqueStudents;

// const studentPLOProgress = {
//   MaSV: maSV,                    // Mã sinh viên
//   info: sinhVien,                // Thông tin sinh viên
//   plos: {                        // Các PLO
//     [plo]: {                     // Mỗi PLO
//       maPLO: plo,                // Mã PLO
//       nhomPLO: ploGroups[plo].nhomPLO, // Nhóm PLO
//       semesters: {               // Các học kỳ
//         [namHK]: {               // Mỗi học kỳ
//           namHK: namHK,          // Mã năm học kỳ
//           formattedNamHK: formatNamHK(namHK), // Năm học kỳ đã format
//           monHocStatus: {        // Trạng thái các môn học
//             [maMH]: {            // Mỗi môn học
//               maMH: maMH,        // Mã môn học
//               status: 'dat'/'khongdat'/'chuaco', // Trạng thái
//               trongSo: totalMonHocWeight, // Trọng số
//               achievedInHK: achievedInHK  // Học kỳ đã đạt
//             }
//           },
//           totalWeight: 0,        // Tổng trọng số
//           achievedWeight: 0,      // Trọng số đã đạt
//           notAchievedWeight: 0,   // Trọng số không đạt
//           notAttemptedWeight: 0,  // Trọng số chưa học
//           achievedRatio: "0/0",   // Tỷ lệ đạt/tổng
//           achievedPercent: 0,     // Phần trăm đạt
//           notAchievedPercent: 0,  // Phần trăm không đạt
//           notAttemptedPercent: 0, // Phần trăm chưa học
//           allAchieved: false      // Tất cả đều đạt
//         }
//       }
//     }
//   }
// };