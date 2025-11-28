const jalaliMoment = require('jalali-moment');

function toJalali(gregorianDate, format = 'jYYYY/jMM/jDD') {
  if (!gregorianDate) return null;
  try {
    return jalaliMoment(gregorianDate).format(format);
  } catch (err) {
    console.error('Error converting to Jalali:', err);
    return null;
  }
}

function toGregorian(jalaliDate, format = 'YYYY-MM-DD') {
  if (!jalaliDate) return null;
  try {
    return jalaliMoment(jalaliDate, 'jYYYY/jMM/jDD').format(format);
  } catch (err) {
    console.error('Error converting to Gregorian:', err);
    return null;
  }
}

function getJalaliMonthInfo(year, month) {
  try {
    const startDate = jalaliMoment(`${year}/${month}/1`, 'jYYYY/jMM/jDD');
    const endDate = startDate.clone().endOf('jMonth');
    
    return {
      start_date: startDate.format('YYYY-MM-DD'),
      end_date: endDate.format('YYYY-MM-DD'),
      days_in_month: endDate.jDate(),
      month_name: getMonthName(month)
    };
  } catch (err) {
    console.error('Error getting Jalali month info:', err);
    return null;
  }
}

function getMonthName(month) {
  const months = [
    '', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];
  return months[month] || 'نامشخص';
}

function isValidJalaliDate(dateString) {
  try {
    return jalaliMoment(dateString, 'jYYYY/jMM/jDD').isValid();
  } catch (err) {
    return false;
  }
}

module.exports = {
  toJalali,
  toGregorian,
  getJalaliMonthInfo,
  getMonthName,
  isValidJalaliDate
};