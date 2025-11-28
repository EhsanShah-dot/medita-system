// middleware/jalali.js
const { toGregorian, isValidJalaliDate } = require('../utils/dateConverter');

const jalaliMiddleware = (req, res, next) => {
  // Convert Jalali dates in request body to Gregorian
  if (req.body && req.body.delivery_date && typeof req.body.delivery_date === 'string') {
    if (isValidJalaliDate(req.body.delivery_date)) {
      req.body.delivery_date_gregorian = toGregorian(req.body.delivery_date);
    }
  }
  
  // Convert Jalali dates in query parameters
  if (req.query.delivery_date && typeof req.query.delivery_date === 'string') {
    if (isValidJalaliDate(req.query.delivery_date)) {
      req.query.delivery_date_gregorian = toGregorian(req.query.delivery_date);
    }
  }
  
  next();
};

module.exports = jalaliMiddleware;