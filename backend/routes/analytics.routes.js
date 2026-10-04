const express = require('express');
const controller = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/overview', controller.overview);
router.get('/quest-progress', controller.questProgress);

module.exports = router;
