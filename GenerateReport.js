const REPORT_SPREADSHEET_ID = '1OA7hYpVWxdOzTTlmQDvryO2c_sgS1wKbGJHfu4itJo4';
const MAIN_SPREADSHEET_ID = '1UxQn7mAinamXXZ6WuK0Zp8aRdfYqXCQ6mf-n4fYVZ8c';

function generateMonthlyReport(selectedMonth) {
  const ss = SpreadsheetApp.openById(REPORT_SPREADSHEET_ID); // פותח תחילה את גיליון הדוחות
  let reportSheet = ss.getSheetByName(selectedMonth);

  if (!reportSheet) {
    try {
      reportSheet = ss.insertSheet(selectedMonth);
      logToSheet(`Created sheet: ${selectedMonth}`);
    } catch (e) {
      logToSheet(`Error creating sheet ${selectedMonth}: ${e}`);
      return; // יציאה מהפונקציה אם יצירת הגיליון נכשלה
    }
  } else {
    reportSheet.clearContents();
    logToSheet(`Sheet already exists, clearing contents: ${selectedMonth}`);
  }

  const mainSS = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID); // פותח את הגיליון הראשי לאחר יצירת הגיליון
  const mainSheet = mainSS.getSheetByName('כרטיס משמרת');
  const rofanSheet = mainSS.getSheetByName('כרטיס רפואן'); // משתנה שלא בשימוש בקוד הזה
  const data = mainSheet.getRange('A2:W' + mainSheet.getLastRow()).getValues();

  logToSheet(`--- Raw Data from Main Sheet (before filtering for ${selectedMonth}) ---`);
  data.forEach((row, index) => {
    if (row[0]) { // Check if there is a date in the first column (Column A)
      logToSheet(`Relevant Row ${index + 2} (Sheet Row Number): ${JSON.stringify(row)}`); // Log only rows with dates, index+2 for sheet row number
    }
  });
  logToSheet(`--- End of Raw Data Log ---`);


  const [month, year] = selectedMonth.split('.');

  // סינון נתונים לפי חודש
  const filteredData = data.filter(row => {
    if (!row[0]) return false;
    const date = new Date(row[0]);
    return date.getMonth() + 1 === parseInt(month) &&
           date.getFullYear() === parseInt(year);
  });
  logToSheet(`Filtered data length for ${selectedMonth}: ${filteredData.length}`); // נוסף רישום ל-Log

  // קיבוץ לפי רפואן
  const rofanimData = {};
  filteredData.forEach((row, index) => {
    const rofanName = row[1]; // עמודה B - שם רפואן
    logToSheet(`Processing Rofan: ${rofanName} (Row in Filtered Data: ${index + 1})`); // Log Rofan being processed
    if (!rofanimData[rofanName]) {
      rofanimData[rofanName] = {
        name: rofanName,
        homeShifts: 0,
        clinicShifts: 0,
        hachsharaHours: 0,
        demoHours: 0,
        trioHours: 0,
        refuahShlemaHours: 0,
        totalHours: 0,
        hourlyRate: getHourlyRate(rofanName),
        bonus: 0
      };
    }

    // עדכון ספירת משמרות
    if (row[9] === 'בית') { // עמודה J - מיקום
      rofanimData[rofanName].homeShifts++;
    } else if (row[9] === 'מרפאה') {
      rofanimData[rofanName].clinicShifts++;
    }

    const shiftType = row[2]; // עמודה C - סוג משמרת
    const duration = row[7]; // עמודה H - משך זמן
    logToSheet(`  Shift Duration String: ${duration}`); // Log duration string
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
    }
    logToSheet(`  Parsed Hours: ${hours}, Minutes: ${minutes}`); // Log parsed hours and minutes

    const totalShiftHours = hours + (minutes / 60);
    logToSheet(`  Total Shift Hours (decimal): ${totalShiftHours}`); // Log totalShiftHours

    switch (shiftType) {
      case 'הכשרה':
        rofanimData[rofanName].hachsharaHours += totalShiftHours;
        logToSheet(`    Added ${totalShiftHours} hours to הכשרה`); // Log shift type contribution
        break;
      case 'דמו':
        rofanimData[rofanName].demoHours += totalShiftHours;
        logToSheet(`    Added ${totalShiftHours} hours to דמו`); // Log shift type contribution
        break;
      case 'מיזם טריו':
        rofanimData[rofanName].trioHours += totalShiftHours;
        logToSheet(`    Added ${totalShiftHours} hours to מיזם טריו`); // Log shift type contribution
        break;
      case 'רפואה שלמה':
        rofanimData[rofanName].refuahShlemaHours += totalShiftHours;
        logToSheet(`    Added ${totalShiftHours} hours to רפואה שלמה`); // Log shift type contribution
        break;
    }

    const bonus = row[22] || 0; // עמודה W - בונוס
    rofanimData[rofanName].totalHours += totalShiftHours;
    rofanimData[rofanName].bonus += bonus; // Use the bonus variable
    logToSheet(`  Added Bonus: ${bonus}`); // Log bonus addition
  });

  logToSheet(`--- Final Rofanim Data Object for ${selectedMonth} ---`);
  logToSheet(JSON.stringify(rofanimData, null, 2)); // Log final rofanimData object with indentation
  logToSheet(`--- End of Rofanim Data Log ---`);


  // Prepare data for the sheet
  let reportData = [];
  try {
    reportData = Object.values(rofanimData).map(rofan => {
      logToSheet(`Hourly rate for ${rofan.name}: ${rofan.hourlyRate}`);
      return [
        rofan.name,
        rofan.homeShifts,
        rofan.clinicShifts,
        rofan.hachsharaHours.toFixed(2),
        rofan.demoHours.toFixed(2),
        rofan.trioHours.toFixed(2),
        rofan.refuahShlemaHours.toFixed(2),
        rofan.totalHours.toFixed(2),
        rofan.hourlyRate.toFixed(2),
        rofan.bonus.toFixed(2)
      ];
    });
  } catch (e) {
    logToSheet(`Error building reportData: ${e}`);
    return; // עצירת ביצוע אם יש שגיאה
  }

  // New logging to see the final rows
  reportData.forEach((row, index) => {
    logToSheet(`Row ${index}: ${JSON.stringify(row)}`);
  });

  // Set headers
  const headers = [
    'שם רפואן', 'משמרות בית', 'משמרות מרפאה', 'הכשרה', 'דמו', 'מיזם טריו',
    'רפואה שלמה', 'סה"כ שעות', 'שכר שעתי', 'בונוס'
  ];
  reportSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Write data to the sheet
  try {
    if (reportData.length > 0 && reportData[0].length > 0) {
      reportSheet.getRange(2, 1, reportData.length, reportData[0].length).setValues(reportData);
      logToSheet(`Data written to sheet successfully. Rows: ${reportData.length}, Columns: ${reportData[0].length}`);
    } else {
      logToSheet("No data to write to the sheet.");
    }
  } catch (e) {
    logToSheet(`Error writing data to sheet: ${e}`);
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('יצירת דוח')
      .addItem('צור דוח חודשי', 'showDialog')
      .addToUi();
}

function showDialog() {
  const html = HtmlService.createHtmlOutput(createDialogContent())
      .setWidth(300)
      .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'יצירת דוח חודשי');
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

function createDialogContent() {
  const months = getAvailableMonths();
  let monthOptions = '';
  months.forEach(month => {
    monthOptions += `<option value="${month}">${month}</option>`;
  });

  return `
    <p>בחר חודש ליצירת דוח:</p>
    <select id="monthSelect">
      ${monthOptions}
    </select>
    <br><br>
    <button onclick="createReport()">צור דוח</button>
    <script>
      function createReport() {
        var month = document.getElementById("monthSelect").value;
        google.script.run.generateMonthlyReport(month);
        google.script.host.close();
      }
    </script>
  `;
}

function logToSheet(message) {
  const reportSS = SpreadsheetApp.openById(REPORT_SPREADSHEET_ID);
  let logSheet = reportSS.getSheetByName('Log');

  if (!logSheet) {
    logSheet = reportSS.insertSheet('Log');
    logSheet.appendRow(['Timestamp', 'Log Message']); // הוספת כותרות
  }

  logSheet.appendRow([new Date(), message]);
}

// Function getHourlyRate is a placeholder, you need to implement it based on your logic.
function getHourlyRate(rofanName) {
  // Implement your logic to fetch hourly rate for the rofan.
  // For example, you might want to read it from 'כרטיס רפואן' sheet or use a fixed rate.
  // For now, returning a default value for demonstration.
  return 50; // Default hourly rate
}