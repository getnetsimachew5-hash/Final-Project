const AuditLog = require('../models/AuditLog');
exports.record = (data) => AuditLog.create(data);
