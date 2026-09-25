const express = require('express');
const { register, login, googleLogin, me, updateMe, changePassword } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/authMiddleware');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Login lebih ketat dari register: login yang dibanjiri = tebak password.
router.post('/register', rateLimit(10), register);
router.post('/login', rateLimit(8), login);
router.post('/google', rateLimit(8), googleLogin);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateMe);
// Sama ketatnya dengan login: endpoint ini juga menerima sandi yang bisa ditebak.
router.patch('/password', requireAuth, rateLimit(8), changePassword);

module.exports = router;
