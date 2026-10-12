const express = require('express');
const controller = require('../controllers/themes.controller');

const router = express.Router();

// Public: the list of study themes (no login needed, themes are not user data).
router.get('/', controller.list);

module.exports = router;
