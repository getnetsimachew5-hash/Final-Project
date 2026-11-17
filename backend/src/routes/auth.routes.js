const r = require('express').Router();
const c = require('../controllers/auth.controller');
const { verifyJWT } = require('../middleware/auth');

r.post('/register', c.register);
r.post('/login', c.login);
r.get('/me', verifyJWT, c.me);

module.exports = r;