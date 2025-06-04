// controllers/ploProgressController.js

const TieuChiDauRa = require('../models/tieuChiDauRa');
const MonHocTieuChi = require('../models/MonHocTieuChi');
const HienDienSV = require('../models/HienDienSV');
const DiemSinhVien = require('../models/DiemSinhVien');
const ChuongTrinh = require('../models/ChuongTrinh');
const cache = new Map();

// Lưu dữ liệu vào cache
function getCacheKey(maKhoi) {
  return `cache_${maKhoi}`;
}

function saveToCache(maKhoi, data) {
  const key = getCacheKey(maKhoi);
  const cacheData = {
    timestamp: Date.now(),
    data: data
  };
  cache.set(key, cacheData);
  console.log(`💾 Đã lưu cache cho mã khối ${maKhoi}`);
}

function loadFromCache(maKhoi) {
  const key = getCacheKey(maKhoi);
  const cacheData = cache.get(key);
  
  if (cacheData) {
    const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
    console.log(`📁 Tải cache cho mã khối ${maKhoi} (${ageMinutes.toFixed(1)} phút trước)`);
    return cacheData.data;
  }
  
  return null;
}

// Hàm để chuyển đổi số NamHK sang định dạng dễ đọc
function formatNamHK(namHK) {
  const namHKStr = namHK.toString();
  const nam = namHKStr.substring(0, 4);
  const hocKy = namHKStr.charAt(4);
  return `năm ${nam} HK${hocKy}`;
}

// ✅ Hàm chuyển đổi HK3 thành HK1 năm sau
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

async function getAllNamHKRange() {
  try {
    const allNamHK = await DiemSinhVien.distinct('NamHK');
    const sortedNamHK = allNamHK.map(nk => parseInt(nk)).sort((a, b) => a - b);
    return {
      min: sortedNamHK[0],
      max: sortedNamHK[sortedNamHK.length - 1]
    };
  } catch (error) {
    console.error('Error getting NamHK range:', error);
    return { min: 20221, max: 20241 }; // fallback
  }
}
// Thêm function duplicate logic
function duplicateAndFillSemesters(ploData, namHKRange) {
  if (!ploData.semesters) {
    ploData.semesters = {};
  }
  // Tạo array tất cả các semester cần có
  const allSemesters = [];
  for (let nam = Math.floor(namHKRange.min / 10); nam <= Math.floor(namHKRange.max / 10); nam++) {
    for (let hk = 1; hk <= 3; hk++) {
      const namHK = parseInt(`${nam}${hk}`);
      if (namHK >= namHKRange.min && namHK <= namHKRange.max) {
        allSemesters.push(namHK);
      }
    }
  }
  const sortedSemesters = allSemesters.sort((a, b) => a - b);
  const existingSemesters = Object.keys(ploData.semesters).map(s => parseInt(s)).sort((a, b) => a - b);
  // Nếu không có semester nào, return
  if (existingSemesters.length === 0) {
    return ploData;
  }
  // Tạo template từ semester đầu tiên có dữ liệu
  const firstExistingSemester = existingSemesters[0];
  const template = JSON.parse(JSON.stringify(ploData.semesters[firstExistingSemester]));
  
  // Reset điểm về 0 cho template
  template.tongDiemSinhVien = 0;
  template.trangThaiDat = false;
  template.achievedPercent = 0;
  template.notAttemptedPercent = 100;
  template.achievedRatio = `0/${template.tongTrongSoLyThuyet || 0}`;
  if (template.monHocStatus) {
    Object.keys(template.monHocStatus).forEach(maMH => {
      template.monHocStatus[maMH].diem = null;
      template.monHocStatus[maMH].diemCoTrongSo = 0;
      template.monHocStatus[maMH].status = 'chua_hoc';
    });
  }
  // Fill tất cả các semester
  for (const namHK of sortedSemesters) {
    if (!ploData.semesters[namHK]) {
      // Tìm semester gần nhất có dữ liệu trước đó
      let lastValidSemester = null;
      for (let i = existingSemesters.length - 1; i >= 0; i--) {
        if (existingSemesters[i] < namHK) {
          lastValidSemester = existingSemesters[i];
          break;
        }
      }
      if (lastValidSemester) {
        // Duplicate từ semester trước
        ploData.semesters[namHK] = JSON.parse(JSON.stringify(ploData.semesters[lastValidSemester]));
      } else {
        // Sử dụng template rỗng
        ploData.semesters[namHK] = JSON.parse(JSON.stringify(template));
      }
    }
  }
  return ploData;
}

// Hàm tính điểm chuẩn có trọng số cho PLO
function tinhDiemChuanCoTrongSo(diemChon, tongTrongSoLyThuyet) {
  return diemChon * tongTrongSoLyThuyet;
}

// ✅ Hàm lấy điểm theo loại điểm
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

exports.getPLOProgressForm = async (req, res) => {
  try {
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
  console.log('=== CHECK DATABASE ===');
const allChuongTrinh = await ChuongTrinh.find({});
// console.log('Tất cả chương trình trong DB:', allChuongTrinh.map(ct => ({
//   MaKhoi: ct.MaKhoi,
//   DiemChon: ct.DiemChon
// })));
// console.log('======================');
  try {
    const { maKhoi, maSV } = req.body;
    
    if (!maKhoi) {
      return res.render('index', { 
        title: 'Theo dõi tiến trình PLO của sinh viên',
        ploProgressMode: true, 
        error: 'Vui lòng nhập mã khối' 
      });
    }

    // Lấy range NamHK từ database
    const namHKRange = await getAllNamHKRange();
    //('NamHK Range:', namHKRange);

    // Tìm sinh viên trong mã khối
    const sinhVienInKhoi = await HienDienSV.find({ MaKhoi: maKhoi });
    
    if (!sinhVienInKhoi || sinhVienInKhoi.length === 0) {
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của sinh viên',
        ploProgressMode: true,
        error: `Không tìm thấy sinh viên nào trong mã khối ${maKhoi}`
      });
    }

    if (!maSV) {
      // Chỉ hiển thị danh sách sinh viên
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của sinh viên',
        ploProgressMode: true,
        maKhoiQuery: maKhoi,
        sinhVienOptions: sinhVienInKhoi
      });
    }

    // Kiểm tra sinh viên có trong khối không
    const sinhVienInKhoiCheck = sinhVienInKhoi.find(sv => sv.MaSV === maSV);
    if (!sinhVienInKhoiCheck) {
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của sinh viên',
        ploProgressMode: true,
        maKhoiQuery: maKhoi,
        sinhVienOptions: sinhVienInKhoi,
        selectedMaSV: maSV,
        error: `Sinh viên ${maSV} không thuộc mã khối ${maKhoi}`
      });
    }

    // Lấy thông tin chương trình và điểm chuẩn
    const chuongTrinh = await ChuongTrinh.findOne({ MaKhoi: maKhoi });
    if (!chuongTrinh) {
      return res.render('index', {
        title: 'Theo dõi tiến trình PLO của sinh viên',
        ploProgressMode: true,
        maKhoiQuery: maKhoi,
        sinhVienOptions: sinhVienInKhoi,
        selectedMaSV: maSV,
        error: `Không tìm thấy chương trình cho mã khối ${maKhoi}`
      });
    }

    const diemChon = chuongTrinh.DiemChon;
// console.log('=== DEBUG DIEM CHON ===');
// console.log('MaKhoi tìm kiếm:', maKhoi);
// console.log('ChuongTrinh tìm được:', chuongTrinh);
// console.log('chuongTrinh.DiemChon:', chuongTrinh.DiemChon);
// console.log('diemChon value:', diemChon);
// console.log('diemChon type:', typeof diemChon);
// console.log('=======================');

    // Lấy danh sách PLO và tiêu chí
    const tieuChiList = await TieuChiDauRa.find({ MaKhoi: maKhoi });
    const ploGroups = {};
    
    tieuChiList.forEach(tc => {
      if (!ploGroups[tc.MaPLO]) {
        ploGroups[tc.MaPLO] = [];
      }
      ploGroups[tc.MaPLO].push(tc.MaTieuChi);
    });

    //console.log('PLO Groups found:', Object.keys(ploGroups));

    // Lấy thông tin môn học và tiêu chí
    const monHocTieuChiList = await MonHocTieuChi.find({
      MaTieuChi: { $in: tieuChiList.map(tc => tc.MaTieuChi) }
    });

    //console.log(`Found ${monHocTieuChiList.length} môn học tiêu chí`);

    // Lấy điểm sinh viên
    const diemSinhVienList = await DiemSinhVien.find({ MaSV: maSV });
    //console.log(`Found ${diemSinhVienList.length} điểm records for ${maSV}`);

    // Check cache
    let cacheStatus = 'No cache';
    const cacheKey = `plo_progress_${maSV}_${maKhoi}`;

    // Tạo object sinh viên với thông tin cơ bản
    const sinhVien = {
      MaSV: maSV,
      info: sinhVienInKhoiCheck,
      plos: {}
    };

    // Tính toán cho từng PLO
    for (const [plo, tieuChiIds] of Object.entries(ploGroups)) {
      //console.log(`\n=== Processing PLO ${plo} ===`);
      
      // Lấy môn học liên quan đến PLO này
      const relatedMonHoc = monHocTieuChiList.filter(mh => 
        tieuChiIds.includes(mh.MaTieuChi)
      );

      //console.log(`Found ${relatedMonHoc.length} related subjects for PLO ${plo}`);

      // Tính toán tổng trọng số lý thuyết
      const tongTrongSoLyThuyet = relatedMonHoc.reduce((sum, mh) => sum + mh.TrongSo, 0);
      
      // Khởi tạo dữ liệu PLO
      sinhVien.plos[plo] = {
        tongTrongSoLyThuyet: tongTrongSoLyThuyet,
        tongTrongSoSinhVienCo: 0,
        tongDiemSinhVien: 0,
        diemChuanCoTrongSo: 0, // Sẽ tính lại sau khi có tongTrongSoSinhVienCo
        //diemChuanCoTrongSo: diemChon * tongTrongSoLyThuyet,
        trangThaiDat: false,
        semesters: {},
        chiTietMonHoc: {}
      };

      // Xử lý từng môn học
      for (const monHoc of relatedMonHoc) {
        const maMH = monHoc.MaMH;
        const trongSo = monHoc.TrongSo;
        const loaiDiem = monHoc.LoaiDiem;

        // Tìm điểm của sinh viên cho môn này
        const diemRecords = diemSinhVienList.filter(d => d.MaMH === maMH);
        
        let bestDiem = null;
        let bestNamHK = null;

        // Chọn điểm cao nhất nếu có nhiều lần học
        for (const diemRecord of diemRecords) {
          let currentDiem = null;
          
          switch (loaiDiem) {
            case 'QT':
              currentDiem = diemRecord.QuaTrinh;
              break;
            case 'GK':
              currentDiem = diemRecord.GiuaKy;
              break;
            case 'CK':
              currentDiem = diemRecord.CuoiKy;
              break;
            default:
              console.warn(`Unknown LoaiDiem: ${loaiDiem} for ${maMH}`);
              continue;
          }

          if (currentDiem !== null && currentDiem !== undefined && !isNaN(currentDiem)) {
            if (bestDiem === null || currentDiem > bestDiem) {
              bestDiem = currentDiem;
              bestNamHK = diemRecord.NamHK;
            }
          }
        }

        // Tính điểm có trọng số
        const diemCoTrongSo = bestDiem !== null ? bestDiem * trongSo : 0;
        const status = bestDiem !== null ? 'co_diem' : 'chua_hoc';

        // Cập nhật tổng điểm PLO
        if (bestDiem !== null) {
          sinhVien.plos[plo].tongTrongSoSinhVienCo += trongSo;
          sinhVien.plos[plo].tongDiemSinhVien += diemCoTrongSo;
        }

        // Lưu chi tiết môn học
        sinhVien.plos[plo].chiTietMonHoc[maMH] = {
          diem: bestDiem,
          trongSo: trongSo,
          diemCoTrongSo: diemCoTrongSo,
          loaiDiem: loaiDiem,
          namHK: bestNamHK,
          status: status
        };

        // Lưu vào semester nếu có điểm
        if (bestNamHK && bestDiem !== null) {
          if (!sinhVien.plos[plo].semesters[bestNamHK]) {
            sinhVien.plos[plo].semesters[bestNamHK] = {
              tongTrongSoLyThuyet: 0,
              tongTrongSoSinhVienCo: 0,
              tongDiemSinhVien: 0,
              diemChuanCoTrongSo: 0,
              trangThaiDat: false,
              achievedPercent: 0,
              notAttemptedPercent: 100,
              achievedRatio: '0/0',
              monHocStatus: {},
              originalData: true // Đánh dấu dữ liệu gốc
            };
          }

          const semester = sinhVien.plos[plo].semesters[bestNamHK];
          semester.tongTrongSoLyThuyet += trongSo;
          semester.tongTrongSoSinhVienCo += trongSo;
          semester.tongDiemSinhVien += diemCoTrongSo;
          semester.diemChuanCoTrongSo = diemChon * semester.tongTrongSoLyThuyet;
          semester.monHocStatus[maMH] = {
            diem: bestDiem,
            trongSo: trongSo,
            diemCoTrongSo: diemCoTrongSo,
            loaiDiem: loaiDiem,
            status: status
          };
        }
      }

      // Tính trạng thái đạt PLO
      sinhVien.plos[plo].trangThaiDat = sinhVien.plos[plo].tongDiemSinhVien >= sinhVien.plos[plo].diemChuanCoTrongSo;

      // Tính toán cho các semester
      for (const [namHK, semester] of Object.entries(sinhVien.plos[plo].semesters)) {
        const achievedPercent = semester.tongTrongSoLyThuyet > 0 ? 
          (semester.tongTrongSoSinhVienCo / semester.tongTrongSoLyThuyet) * 100 : 0;
        
        semester.achievedPercent = achievedPercent;
        semester.notAttemptedPercent = 100 - achievedPercent;
        semester.achievedRatio = `${semester.tongTrongSoSinhVienCo}/${semester.tongTrongSoLyThuyet}`;
        semester.trangThaiDat = semester.tongDiemSinhVien >= semester.diemChuanCoTrongSo;
        // Tính lại điểm chuẩn dựa trên trọng số thực tế
        sinhVien.plos[plo].diemChuanCoTrongSo = diemChon * sinhVien.plos[plo].tongTrongSoSinhVienCo;
        sinhVien.plos[plo].trangThaiDat = sinhVien.plos[plo].tongDiemSinhVien >= sinhVien.plos[plo].diemChuanCoTrongSo;
      
      // console.log(`\nPLO ${plo} Final Result:`);
      // console.log(`- Điểm sinh viên: ${sinhVien.plos[plo].tongDiemSinhVien.toFixed(2)}`);
      // console.log(`- Điểm chuẩn cần đạt: ${sinhVien.plos[plo].diemChuanCoTrongSo.toFixed(2)}`);
      // console.log(`- Kết quả: ${sinhVien.plos[plo].trangThaiDat ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
      }

      // 🔥 ÁP DỤNG LOGIC DUPLICATE
      sinhVien.plos[plo] = duplicateAndFillSemesters(sinhVien.plos[plo], namHKRange);
    }

    //console.log(`\n=== Final Results for ${maSV} ===`);
    //console.log('PLOs processed:', Object.keys(sinhVien.plos));

    // Render kết quả
    res.render('index', {
      title: 'Theo dõi tiến trình PLO của sinh viên',
      ploProgressMode: true,
      maKhoiQuery: maKhoi,
      sinhVienOptions: sinhVienInKhoi,
      selectedMaSV: maSV,
      ploProgressResults: {
        sinhVien: sinhVien,
        diemChon: diemChon,
        ploGroups: ploGroups
      },
      cacheStatus: cacheStatus
    });

  } catch (error) {
    console.error('PLO progress search error:', error);
    res.render('index', {
      title: 'Theo dõi tiến trình PLO của sinh viên',
      ploProgressMode: true,
      error: 'Có lỗi xảy ra khi tìm kiếm: ' + error.message
    });
  }
};

// Thêm 2 helper functions này vào đầu file hoặc cuối file
async function getAllNamHKRange() {
  try {
    const allNamHK = await DiemSinhVien.distinct('NamHK');
    const sortedNamHK = allNamHK
      .map(nk => parseInt(nk))
      .filter(nk => !isNaN(nk))
      .sort((a, b) => a - b);
    
    return {
      min: sortedNamHK[0] || 20221,
      max: sortedNamHK[sortedNamHK.length - 1] || 20241
    };
  } catch (error) {
    console.error('Error getting NamHK range:', error);
    return { min: 20221, max: 20241 }; // fallback
  }
}

function duplicateAndFillSemesters(ploData, namHKRange) {
  if (!ploData.semesters) {
    ploData.semesters = {};
  }

  // Tạo array tất cả các semester cần có
  const allSemesters = [];
  const startYear = Math.floor(namHKRange.min / 10);
  const endYear = Math.floor(namHKRange.max / 10);
  
  for (let nam = startYear; nam <= endYear; nam++) {
    for (let hk = 1; hk <= 3; hk++) {
      const namHK = parseInt(`${nam}${hk}`);
      if (namHK >= namHKRange.min && namHK <= namHKRange.max) {
        allSemesters.push(namHK);
      }
    }
  }

  const sortedSemesters = allSemesters.sort((a, b) => a - b);
  const existingSemesters = Object.keys(ploData.semesters)
    .map(s => parseInt(s))
    .filter(s => !isNaN(s))
    .sort((a, b) => a - b);

  //console.log('All semesters needed:', sortedSemesters);
  //console.log('Existing semesters:', existingSemesters);

  // Nếu không có semester nào, return
  if (existingSemesters.length === 0) {
    return ploData;
  }

  // Fill missing semesters
  for (const namHK of sortedSemesters) {
    if (!ploData.semesters[namHK]) {
      // Tìm semester gần nhất có dữ liệu trước đó
      let sourceSemester = null;
      for (let i = existingSemesters.length - 1; i >= 0; i--) {
        if (existingSemesters[i] < namHK) {
          sourceSemester = existingSemesters[i];
          break;
        }
      }

      if (sourceSemester) {
        // Duplicate từ semester trước
        //console.log(`Duplicating ${sourceSemester} -> ${namHK}`);
        ploData.semesters[namHK] = JSON.parse(JSON.stringify(ploData.semesters[sourceSemester]));
        ploData.semesters[namHK].originalData = false; // Đánh dấu là dữ liệu nhân bản
      } else {
        // Tìm semester đầu tiên để forward fill
        const firstSemester = existingSemesters[0];
        if (firstSemester > namHK) {
          //console.log(`Forward filling ${firstSemester} -> ${namHK}`);
          ploData.semesters[namHK] = JSON.parse(JSON.stringify(ploData.semesters[firstSemester]));
          ploData.semesters[namHK].originalData = false; // Đánh dấu là dữ liệu nhân bản
        }
      }
    }
  }

  return ploData;
}

async function trackStudentPLOProgressWithCache(maKhoi, maSV) {
  const startTime = Date.now();
  
  try {
    const cachedData = loadFromCache(maKhoi);
    
    if (cachedData && cachedData.students && cachedData.students[maSV]) {
      const endTime = Date.now();
      //console.log(`⚡ Lấy từ cache: ${endTime - startTime}ms`);
      
      return {
        success: true,
        data: {
          sinhVien: cachedData.students[maSV],
          ploGroups: cachedData.ploGroups,
          namHKList: cachedData.namHKList
        },
        usedCache: true,
        processingTime: endTime - startTime
      };
    }
    
    //console.log(`🔄 Tính toán mới cho khối ${maKhoi}`);
    
    const allStudents = await HienDienSV.find({ MaKhoi: maKhoi }).lean();
    const cacheData = {
      students: {},
      ploGroups: null,
      namHKList: null
    };
    
    const requestedResult = await trackStudentPLOProgress(maKhoi, maSV);
    
    if (!requestedResult.success) {
      return requestedResult;
    }
    
    cacheData.students[maSV] = requestedResult.data.sinhVien;
    cacheData.ploGroups = requestedResult.data.ploGroups;
    cacheData.namHKList = requestedResult.data.namHKList;
    
    setImmediate(async () => {
      console.log(`📦 Tính toán cache cho ${allStudents.length} sinh viên...`);
      
      for (const student of allStudents) {
        if (student.MaSV !== maSV) {
          try {
            const result = await trackStudentPLOProgress(maKhoi, student.MaSV);
            if (result.success) {
              cacheData.students[student.MaSV] = result.data.sinhVien;
            }
          } catch (error) {
            console.log(`❌ Lỗi khi cache SV ${student.MaSV}: ${error.message}`);
          }
        }
      }
      
      saveToCache(maKhoi, cacheData);
      //console.log(`✅ Đã cache xong ${Object.keys(cacheData.students).length} sinh viên`);
    });
    
    const endTime = Date.now();
    console.log(`✅ Hoàn thành: ${endTime - startTime}ms`);
    
    return {
      success: true,
      data: requestedResult.data,
      usedCache: false,
      processingTime: endTime - startTime
    };
    
  } catch (error) {
    console.error('❌ Lỗi:', error);
    return {
      success: false,
      error: `Đã xảy ra lỗi: ${error.message}`,
      usedCache: false
    };
  }
}

/**
 * ✅ Function chính được viết lại theo yêu cầu mới - lưu theo từng năm
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
    
    // BƯỚC 1: Lấy DiemChon từ ChuongTrinh
    const chuongTrinh = await ChuongTrinh.findOne({ MaKhoi: maKhoi }).lean();
    
    if (!chuongTrinh) {
      return {
        success: false,
        error: `Không tìm thấy chương trình cho mã khối "${maKhoi}".`
      };
    }
    
    const diemChon = chuongTrinh.DiemChon;
console.log('=== DEBUG DIEM CHON ===');
console.log('ChuongTrinh object:', JSON.stringify(chuongTrinh, null, 2));
console.log('DiemChon value:', diemChon);
console.log('DiemChon type:', typeof diemChon);
console.log('=======================');
    
    // BƯỚC 2: Lấy PLO và tiêu chí từ TieuChiDauRa
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
    
    // BƯỚC 3: Lấy môn học, loại điểm, trọng số từ MonHocTieuChi
    const maTieuChiList = tieuChiResults.map(tc => tc.MaTieuChi);
    const monHocTieuChiResults = await MonHocTieuChi.find({
      MaTieuChi: { $in: maTieuChiList }
    }).lean();
    
    if (!monHocTieuChiResults || monHocTieuChiResults.length === 0) {
      return {
        success: false,
        error: `Không tìm thấy môn học nào cho các tiêu chí của mã khối "${maKhoi}".`
      };
    }
    
    // Tạo mapping từ tiêu chí sang PLO
    const tieuChiToPLOMap = {};
    tieuChiResults.forEach(tc => {
      tieuChiToPLOMap[tc.MaTieuChi] = tc.MaPLO;
    });
    
    // Nhóm môn học theo PLO với thông tin LoaiDiem và TrongSo
    const ploMonHocMap = {};
    monHocTieuChiResults.forEach(mh => {
      const plo = tieuChiToPLOMap[mh.MaTieuChi];
      
      if (!ploMonHocMap[plo]) {
        ploMonHocMap[plo] = {};
      }
      
      if (!ploMonHocMap[plo][mh.MaMH]) {
        ploMonHocMap[plo][mh.MaMH] = {
          maMH: mh.MaMH,
          loaiDiem: mh.LoaiDiem,
          trongSo: mh.TrongSo
        };
      }
    });
    
    // ✅ BƯỚC 4: Lấy và xử lý điểm sinh viên (normalize HK3 và chọn điểm cao hơn)
    const diemSinhVienResults = await DiemSinhVien.find({ MaSV: maSV }).lean();
    
    // Nhóm điểm theo MaMH và xử lý HK3
    const diemMap = {};
    diemSinhVienResults.forEach(diem => {
      const normalizedNamHK = normalizeNamHK(diem.NamHK);
      const key = `${diem.MaMH}_${normalizedNamHK}`;
      
      if (!diemMap[diem.MaMH]) {
        diemMap[diem.MaMH] = {};
      }
      
      // Nếu đã có điểm cho năm này, chọn điểm cao hơn
      if (diemMap[diem.MaMH][normalizedNamHK]) {
        const existing = diemMap[diem.MaMH][normalizedNamHK];
        const existingDiem = Math.max(
          getDiemTheoLoaiDiem(existing, existing.LoaiDiem) || 0,
          getDiemTheoLoaiDiem(diem, diem.LoaiDiem) || 0
        );
        const newDiem = Math.max(
          getDiemTheoLoaiDiem(existing, diem.LoaiDiem) || 0,
          getDiemTheoLoaiDiem(diem, existing.LoaiDiem) || 0
        );
        
        // Chọn record có điểm cao hơn
        if (newDiem > existingDiem) {
          diemMap[diem.MaMH][normalizedNamHK] = diem;
        }
      } else {
        diemMap[diem.MaMH][normalizedNamHK] = diem;
      }
    });
    
    // ✅ BƯỚC 5: Tính toán tiến trình theo từng năm cho từng PLO
    const ploResults = {};
    const allNamHKSet = new Set();
    
    // Lấy tất cả các năm học kỳ có điểm
    Object.values(diemMap).forEach(yearlyData => {
      Object.keys(yearlyData).forEach(namHK => {
        allNamHKSet.add(parseInt(namHK));
      });
    });
    
    const sortedNamHKList = Array.from(allNamHKSet).sort((a, b) => a - b);
    
    for (const [plo, monHocInfo] of Object.entries(ploMonHocMap)) {
      // Tính tổng trọng số lý thuyết cho PLO này
      let tongTrongSoLyThuyet = 0;
      for (const info of Object.values(monHocInfo)) {
        tongTrongSoLyThuyet += info.trongSo;
      }
      
      const semesterProgress = {};
      let cumulativeDiem = 0;
      let cumulativeTrongSo = 0;
      const cumulativeMonHoc = {};
      
      // ✅ Tính tiến trình tích lũy cho từng năm
      for (const namHK of sortedNamHKList) {
        // Thêm điểm mới của năm này
        for (const [maMH, info] of Object.entries(monHocInfo)) {
          if (diemMap[maMH] && diemMap[maMH][namHK]) {
            const diemSV = diemMap[maMH][namHK];
            const diem = getDiemTheoLoaiDiem(diemSV, info.loaiDiem);
            
            if (diem !== null && !isNaN(diem)) {
              // Nếu đã có điểm cho môn này rồi, thay thế bằng điểm mới
              if (cumulativeMonHoc[maMH]) {
                cumulativeDiem -= cumulativeMonHoc[maMH].diemCoTrongSo;
                cumulativeTrongSo -= cumulativeMonHoc[maMH].trongSo;
              }
              
              const diemCoTrongSo = diem * info.trongSo;
              cumulativeDiem += diemCoTrongSo;
              cumulativeTrongSo += info.trongSo;
              
              cumulativeMonHoc[maMH] = {
                diem: diem,
                loaiDiem: info.loaiDiem,
                trongSo: info.trongSo,
                diemCoTrongSo: diemCoTrongSo,
                namHK: namHK,
                status: 'co_diem'
              };
            }
          }
        }
        
        // Tính toán cho năm này
        const diemChuanCoTrongSo = tinhDiemChuanCoTrongSo(diemChon, tongTrongSoLyThuyet);
        const trangThaiDat = sinhVien.plos[plo].tongDiemSinhVien >= diemChuanCoTrongSo;

        const trongSoChuaCo = (tongTrongSoLyThuyet - cumulativeTrongSo) / tongTrongSoLyThuyet;
        
        // Tạo thông tin môn học cho năm này
        const monHocStatus = {};
        for (const [maMH, info] of Object.entries(monHocInfo)) {
          if (cumulativeMonHoc[maMH]) {
            monHocStatus[maMH] = cumulativeMonHoc[maMH];
          } else {
            monHocStatus[maMH] = {
              diem: null,
              loaiDiem: info.loaiDiem,
              trongSo: info.trongSo,
              diemCoTrongSo: 0,
              namHK: null,
              status: 'chua_hoc'
            };
          }
        }
        
        semesterProgress[namHK] = {
          namHK: namHK,
          tongDiemSinhVien: cumulativeDiem,
          diemChuanCoTrongSo: diemChuanCoTrongSo,
          tongTrongSoSinhVienCo: cumulativeTrongSo,
          trangThaiDat: trangThaiDat,
          trongSoChuaCo: trongSoChuaCo,
          achievedPercent: cumulativeTrongSo > 0 ? (cumulativeTrongSo / tongTrongSoLyThuyet) * 100 : 0,
          notAttemptedPercent: (trongSoChuaCo * 100),
          achievedRatio: `${cumulativeTrongSo.toFixed(1)}/${tongTrongSoLyThuyet.toFixed(1)}`,
          monHocStatus: monHocStatus,
          allAchieved: trangThaiDat && trongSoChuaCo === 0
        };
      }
      
      // Lấy kết quả cuối cùng (năm cao nhất)
      const latestNamHK = Math.max(...sortedNamHKList);
      const finalResult = semesterProgress[latestNamHK] || {
        tongDiemSinhVien: 0,
        diemChuanCoTrongSo: 0,
        tongTrongSoSinhVienCo: 0,
        trangThaiDat: false,
        trongSoChuaCo: 1
      };
      
      ploResults[plo] = {
        maPLO: plo,
        monHocList: Object.keys(monHocInfo),
        tongDiemSinhVien: finalResult.tongDiemSinhVien,
        diemChuanCoTrongSo: finalResult.diemChuanCoTrongSo,
        tongTrongSoSinhVienCo: finalResult.tongTrongSoSinhVienCo,
        tongTrongSoLyThuyet: tongTrongSoLyThuyet,
        trangThaiDat: finalResult.trangThaiDat,
        trongSoChuaCo: finalResult.trongSoChuaCo,
        chiTietMonHoc: finalResult.monHocStatus,
        semesters: semesterProgress // ✅ Lưu tiến trình từng năm
      };
    }
    
    // Tạo danh sách năm học kỳ formatted
    const namHKList = sortedNamHKList.map(namHK => ({
      value: namHK,
      formatted: formatNamHK(namHK)
    }));
    
    const result = {
      sinhVien: {
        MaSV: maSV,
        info: sinhVien,
        plos: ploResults
      },
      ploGroups: ploGroups,
      namHKList: namHKList,
      diemChon: diemChon
    };
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    console.error('❌ Lỗi trackStudentPLOProgress:', error);
    return {
      success: false,
      error: `Đã xảy ra lỗi: ${error.message}`
    };
  }
}


// Export for reuse in other controllers
module.exports = {
  // Main exports
  searchPLOProgress: exports.searchPLOProgress,
  getPLOProgressForm: exports.getPLOProgressForm,
  
  // Helper functions
  formatNamHK,
  normalizeNamHK,
  getAllNamHKRange,
  duplicateAndFillSemesters,
  tinhDiemChuanCoTrongSo,
  getDiemTheoLoaiDiem,
  
  // Cache functions
  saveToCache,
  loadFromCache,
  getCacheKey
};