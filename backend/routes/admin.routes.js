const express = require('express');
const controller = require('../controllers/admin.controller');
const { requireAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

router.use(requireAdmin);

router.get('/dashboard', controller.dashboard);

module.exports = router;
