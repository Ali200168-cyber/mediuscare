const { verifyToken, allowRoles } = require("./auth");

module.exports = function roleAuth(allowedRoles = []) {
  return [
    verifyToken,
    (req, res, next) => {
      if (!allowedRoles.length) return next();
      return allowRoles(...allowedRoles)(req, res, next);
    },
  ];
};
