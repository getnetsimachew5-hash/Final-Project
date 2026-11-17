const r = require('express').Router();
const { verifyJWT } = require('../middleware/auth');
const c = require('../controllers/message.controller');

// Every authenticated actor shares the same message center. Role-level
// permissions are enforced in the controller (who may message whom).
r.use(verifyJWT);

r.get('/',                c.listMessages);
r.get('/unread-count',    c.unreadCount);
r.get('/contacts',        c.contacts);
r.get('/students',        c.searchStudents);
r.get('/threads/:threadId', c.getThread);
r.post('/',               c.sendMessage);
r.post('/read',           c.markRead);

module.exports = r;
