const express = require('express');
const controller = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateTheme } = require('../middleware/validate');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.get);
router.put('/', controller.update);
router.patch('/character', controller.updateCharacter);
router.patch('/theme', validateTheme, controller.updateTheme);

module.exports = router;
