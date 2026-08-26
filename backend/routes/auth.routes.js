const express = require('express');
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateRegistration, validateLogin } = require('../middleware/validate');

const router = express.Router();

router.post('/register', validateRegistration, controller.register);
router.post('/login', validateLogin, controller.login);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
