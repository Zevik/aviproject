// קבועים
const MAIN_SPREADSHEET_ID = '1UxQn7mAinamXXZ6WuK0Zp8aRdfYqXCQ6mf-n4fYVZ8c';
const SOCIAL_TERMS_SPREADSHEET_ID = '1ejV2ooTn9I2Gn3FrTGmHfrJ8hcz17178ipui2AQ_gZY';

function doGet(e) {
  const page = e.parameter.page || 'Index';
  return HtmlService.createHtmlOutputFromFile(page)
      .setTitle(page === 'Index' ? 'חישוב שעות ותשלומים' : 'דוח חודשי')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getMonthlyReportData(selectedMonth, shiftType) {
  const mainSheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס משמרת');
  const logSheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('LOG');
  const data = mainSheet.getRange('A2:W' + mainSheet.getLastRow()).getValues();
  
  const [month, year] = selectedMonth.split('.');
  
  // Filter data by month and shift type
  const filteredData = data.filter(row => {
    if (!row[0]) return false;
    const date = new Date(row[0]);
    return date.getMonth() + 1 === parseInt(month) && 
           date.getFullYear() === parseInt(year) &&
           row[2] === shiftType;  // Column C - shift type
  });

  logSheet.appendRow(['--- התחלת חישוב דוח חודשי ---']);
  logSheet.appendRow(['חודש:', selectedMonth]);
  logSheet.appendRow(['סוג משמרת:', shiftType]);
  logSheet.appendRow(['מספר רשומות:', filteredData.length]);

  // Group by Rofan
  const rofanimData = {};
  filteredData.forEach(row => {
    const rofanName = row[1];  // Column B - Rofan name
    const rofanId = getRofanId(rofanName);
    
    if (!rofanimData[rofanName]) {
      rofanimData[rofanName] = {
        name: rofanName,
        homeShifts: 0,
        clinicShifts: 0,
        totalHours: 0,
        bonus: row[22] || 0,  // Column W - bonus
        hourlyRate: getHourlyRate(rofanName),
        socialTerms: getSocialTermsData(rofanId, selectedMonth).socialTerms,
        employerCost: getSocialTermsData(rofanId, selectedMonth).employerCost
      };

      logSheet.appendRow(['--- נתוני רפואן ---']);
      logSheet.appendRow(['שם:', rofanName]);
      logSheet.appendRow(['ת.ז.:', rofanId]);
      logSheet.appendRow(['תעריף שעתי:', rofanimData[rofanName].hourlyRate]);
    }

    // Update shifts count
    if (row[9] === 'בית') {  // Column J - location
      rofanimData[rofanName].homeShifts++;
    } else if (row[9] === 'מרפאה') {
      rofanimData[rofanName].clinicShifts++;
    }

    // Update total hours
    const duration = row[7];  // Column H - duration
    if (duration) {
      let hours = 0;
      let minutes = 0;
      
      const matchWithHyphen = duration.match(/(\d+)\s*שעות-(\d+)\s*דקות/);
      const matchWithSpace = duration.match(/(\d+)\s*שעות\s*(\d+)\s*דקות/);
      
      if (matchWithHyphen) {
        hours = parseInt(matchWithHyphen[1]);
        minutes = parseInt(matchWithHyphen[2]);
      } else if (matchWithSpace) {
        hours = parseInt(matchWithSpace[1]);
        minutes = parseInt(matchWithSpace[2]);
      } else {
        logSheet.appendRow(['שגיאה בפרסור משך משמרת:', duration]);
      }
      
      rofanimData[rofanName].totalHours += hours + (minutes / 60);
      
      logSheet.appendRow(['--- פרטי משמרת ---']);
      logSheet.appendRow(['תאריך:', row[0]]);
      logSheet.appendRow(['משך:', duration]);
      logSheet.appendRow(['שעות מחושבות:', `${hours}:${minutes}`]);
    }
  });

  // Log final results
  Object.values(rofanimData).forEach(rofan => {
    logSheet.appendRow(['--- סיכום רפואן ---']);
    logSheet.appendRow(['שם:', rofan.name]);
    logSheet.appendRow(['סה"כ שעות:', rofan.totalHours]);
    logSheet.appendRow(['משמרות בית:', rofan.homeShifts]);
    logSheet.appendRow(['משמרות מרפאה:', rofan.clinicShifts]);
  });

  logSheet.appendRow(['--- סיום חישוב דוח חודשי ---']);

  return Object.values(rofanimData);
}

function getAvailableMonths() {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס משמרת');
  const dates = sheet.getRange('A2:A' + sheet.getLastRow()).getValues();
  
  // מיפוי התאריכים לפורמט MM.YYYY
  const months = dates.map(date => {
    if (!date[0]) return null;
    const d = new Date(date[0]);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  });
  
  // הסרת כפילויות ותאריכים ריקים
  return [...new Set(months.filter(month => month))].sort().reverse();
}

function getDefaultMonth() {
  const today = new Date();
  today.setMonth(today.getMonth() - 1); // החודש הקודם
  return `${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
}

function getRofanimList() {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס משמרת');
  const rofanim = sheet.getRange('B2:B' + sheet.getLastRow()).getValues();
  return [...new Set(rofanim.flat().filter(name => name))].sort();
}

function getRofimList() {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס משמרת');
  const rofim = sheet.getRange('D2:D' + sheet.getLastRow()).getValues();
  return [...new Set(rofim.flat().filter(name => name))].sort();
}

function getRofanData(rofanName, selectedMonth) {
 const mainSheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס משמרת');
 const logSheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('LOG');
 
 // מציאת כל הרשומות של הרפואן בחודש הנבחר
 const data = mainSheet.getRange('A2:J' + mainSheet.getLastRow()).getValues();
 
 // קבלת תעודת זהות של הרפואן
 const rofanId = getRofanId(rofanName);

 // לוג
 logSheet.appendRow(['--- התחלת חישוב נתונים ---']);
 logSheet.appendRow(['תאריך', new Date()]);
 logSheet.appendRow(['רפואן', rofanName]);
 logSheet.appendRow(['ת.ז. רפואן', rofanId]);
 logSheet.appendRow(['חודש נבחר', selectedMonth]);
 
 // פילטור לפי חודש ורפואן
 const [month, year] = selectedMonth.split('.');
 const filteredData = data.filter(row => {
   if (!row[0]) return false;
   const date = new Date(row[0]);
   return date.getMonth() + 1 === parseInt(month) && 
          date.getFullYear() === parseInt(year) && 
          row[1] === rofanName;  // עמודה B - שם רפואן
 });

 logSheet.appendRow(['מספר רשומות שנמצאו', filteredData.length]);

 // חישוב מספר המשמרות לפי מיקום
 const homeShifts = filteredData.filter(row => row[9] === 'בית').length;
 const clinicShifts = filteredData.filter(row => row[9] === 'מרפאה').length;

 // לוג פירוט המשמרות שנמצאו
 filteredData.forEach((row, index) => {
   logSheet.appendRow([
     `--- משמרת ${index + 1} ---`,
     'תאריך:', row[0],
     'סוג משמרת:', row[2],
     'משך:', row[7],
     'מיקום:', row[9]
   ]);
 });

 // חישוב שעות לפי סוג משמרת
 const hoursByType = {};
 filteredData.forEach(row => {
   const shiftType = row[2];  // עמודה C - סוג משמרת
   const duration = row[7];    // עמודה H - משך משמרת
   if (!hoursByType[shiftType]) hoursByType[shiftType] = 0;
   
   const matchWithHyphen = duration.match(/(\d+)\s*שעות-(\d+)\s*דקות/);
   const matchWithSpace = duration.match(/(\d+)\s*שעות\s*(\d+)\s*דקות/);
   
   if (matchWithHyphen) {
     const hours = parseInt(matchWithHyphen[1]);
     const minutes = parseInt(matchWithHyphen[2]);
     hoursByType[shiftType] += hours + (minutes / 60);
   } else if (matchWithSpace) {
     const hours = parseInt(matchWithSpace[1]);
     const minutes = parseInt(matchWithSpace[2]);
     hoursByType[shiftType] += hours + (minutes / 60);
   } else {
     logSheet.appendRow(['שגיאה בפרסור משך משמרת:', duration]);
   }
 });

 // לוג סיכום שעות לפי סוג
 logSheet.appendRow(['--- סיכום שעות לפי סוג ---']);
 Object.entries(hoursByType).forEach(([type, hours]) => {
   logSheet.appendRow(['סוג:', type, 'שעות:', hours]);
 });

 // קבלת נתונים סוציאליים
 const socialData = getSocialTermsData(rofanId, selectedMonth);
 logSheet.appendRow(['--- נתונים סוציאליים ---']);
 logSheet.appendRow(['תנאים סוציאליים:', socialData.socialTerms]);
 logSheet.appendRow(['עלות מעסיק:', socialData.employerCost]);

 const result = {
   name: rofanName,
   homeShifts,
   clinicShifts,
   totalHours: calculateTotalHours(filteredData),
   hoursByType,
   hourlyRate: getHourlyRate(rofanName),
   socialTerms: socialData.socialTerms,
   employerCost: socialData.employerCost
 };

 // לוג תוצאה סופית
 logSheet.appendRow(['--- תוצאה סופית ---']);
 logSheet.appendRow(['סה"כ שעות:', result.totalHours]);
 logSheet.appendRow(['משמרות בית:', result.homeShifts]);
 logSheet.appendRow(['משמרות מרפאה:', result.clinicShifts]);
 logSheet.appendRow(['תעריף שעתי:', result.hourlyRate]);
 logSheet.appendRow(['--- סיום חישוב נתונים ---']);

 return result;
}

function getRofanDataWithShiftFilter(rofanName, selectedMonth, shiftTypeFilter) {
  const mainSheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס משמרת');
  const data = mainSheet.getRange('A2:J' + mainSheet.getLastRow()).getValues();
  
  // קבלת תעודת זהות של הרפואן
  const rofanId = getRofanId(rofanName);

  // פילטור לפי חודש, רפואן וסוג משמרת
  const [month, year] = selectedMonth.split('.');
  const filteredData = data.filter(row => {
    if (!row[0]) return false;
    const date = new Date(row[0]);
    const monthMatch = date.getMonth() + 1 === parseInt(month) && 
                      date.getFullYear() === parseInt(year);
    const rofanMatch = row[1] === rofanName;
    
    let shiftTypeMatch = true;
    if (shiftTypeFilter !== 'all') {
      if (shiftTypeFilter === 'refuah_shlema') {
        shiftTypeMatch = row[2] === 'רפואה שלמה';
      } else if (shiftTypeFilter === 'other') {
        shiftTypeMatch = row[2] !== 'רפואה שלמה';
      }
    }
    
    return monthMatch && rofanMatch && shiftTypeMatch;
  });

  const homeShifts = filteredData.filter(row => row[9] === 'בית').length;
  const clinicShifts = filteredData.filter(row => row[9] === 'מרפאה').length;

  // חישוב שעות לפי סוג משמרת
  const hoursByType = {};
  filteredData.forEach(row => {
    const shiftType = row[2];
    const duration = row[7];
    if (!hoursByType[shiftType]) hoursByType[shiftType] = 0;
    
    const matchWithHyphen = duration.match(/(\d+)\s*שעות-(\d+)\s*דקות/);
    const matchWithSpace = duration.match(/(\d+)\s*שעות\s*(\d+)\s*דקות/);
    
    if (matchWithHyphen) {
      const hours = parseInt(matchWithHyphen[1]);
      const minutes = parseInt(matchWithHyphen[2]);
      hoursByType[shiftType] += hours + (minutes / 60);
    } else if (matchWithSpace) {
      const hours = parseInt(matchWithSpace[1]);
      const minutes = parseInt(matchWithSpace[2]);
      hoursByType[shiftType] += hours + (minutes / 60);
    }
  });

  const socialData = getSocialTermsData(rofanId, selectedMonth);

  return {
    name: rofanName,
    homeShifts,
    clinicShifts,
    totalHours: calculateTotalHours(filteredData),
    hoursByType,
    hourlyRate: getHourlyRate(rofanName),
    socialTerms: socialData.socialTerms,
    employerCost: socialData.employerCost
  };
}

function getRofeData(rofeName, selectedMonth) {
  const mainSheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס משמרת');
  const rofeSheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס לקוח');
  
  const data = mainSheet.getRange('A2:J' + mainSheet.getLastRow()).getValues();
  
  const [month, year] = selectedMonth.split('.');
  const filteredData = data.filter(row => {
    if (!row[0]) return false;
    const date = new Date(row[0]);
    return date.getMonth() + 1 === parseInt(month) && 
           date.getFullYear() === parseInt(year) && 
           row[3] === rofeName;  // עמודה D - שם רופא
  });

  // חישוב שעות לפי סוג משמרת
  const demoHours = calculateHoursByType(filteredData, 'דמו');
  const trioHours = calculateHoursByType(filteredData, 'מיזם טריו');
  const refuahShlemaHours = calculateHoursByType(filteredData, 'רפואה שלמה');

  // קבלת תעריפים מכרטיס לקוח
  const rofeRates = getRofeRates(rofeName);

  return {
    name: rofeName,
    totalShifts: filteredData.length,
    demoHours,
    trioHours,
    refuahShlemaHours,
    demoRate: rofeRates.demoRate,
    trioRate: rofeRates.trioRate,
    refuahShlemaRate: rofeRates.refuahShlemaRate,
    vat: 1.18
  };
}

function getRofeRates(rofeName) {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס לקוח');
  const data = sheet.getRange('B:S').getValues();
  const row = data.find(row => row[0] === rofeName);
  return {
    demoRate: row ? row[16] : 0,            // עמודה R - עלות שעת דמו
    trioRate: row ? row[17] : 0,            // עמודה S - עלות שעת מיזם טריו
    refuahShlemaRate: row ? row[17] : 0     // עמודה S - עלות שעת רפואה שלמה (אותו תעריף כמו מיזם טריו)
  };
}


function calculateHoursByType(data, shiftType) {
  const filteredData = data.filter(row => row[2] === shiftType); // עמודה C - סוג משמרת
  return calculateTotalHours(filteredData);
}


// פונקציות עזר

function calculateTotalHours(data) {
  return data.reduce((total, row) => {
    const duration = row[7]; // עמודה H
    if (!duration) return total;
    
    const match = duration.match(/(\d+)\s*שעות-(\d+)\s*דקות/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      return total + hours + (minutes / 60);
    }
    
    const alternateMatch = duration.match(/(\d+)\s*שעות\s*(\d+)\s*דקות/);
    if (alternateMatch) {
      const hours = parseInt(alternateMatch[1]);
      const minutes = parseInt(alternateMatch[2]);
      return total + hours + (minutes / 60);
    }
    
    console.log('Warning: Could not parse duration format:', duration);
    return total;
  }, 0);
}

function getRofanId(rofanName) {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס רפואן');
  const data = sheet.getRange('B:F').getValues();
  const row = data.find(row => row[0] === rofanName);
  return row ? row[4] : null; // עמודה F - תעודת זהות
}

function getSocialTermsData(rofanId, selectedMonth) {
  if (!rofanId) return { socialTerms: 0, employerCost: 0 };
  
  try {
    const socialSheet = SpreadsheetApp.openById(SOCIAL_TERMS_SPREADSHEET_ID).getSheetByName(selectedMonth);
    if (!socialSheet) return { socialTerms: 0, employerCost: 0 };
    
    const data = socialSheet.getRange('D:R').getValues();
    const row = data.find(row => row[0] === rofanId);
    
    return {
      socialTerms: row ? row[6] : 0,  // עמודה J
      employerCost: row ? row[14] : 0 // עמודה R
    };
  } catch (e) {
    return { socialTerms: 0, employerCost: 0 };
  }
}

function getHourlyRate(rofanName) {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס רפואן');
  const data = sheet.getRange('B:Q').getValues();
  const row = data.find(row => row[0] === rofanName);
  return row ? row[15] : 0; // עמודה Q
}

function getRofeHourlyRate(rofeName) {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName('כרטיס לקוח');
  const data = sheet.getRange('B:S').getValues();
  const row = data.find(row => row[0] === rofeName);
  return row ? row[17] : 0; // עמודה S
}