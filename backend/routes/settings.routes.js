const express = require('express');
const controller = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateTheme, validateAppearance } = require('../middleware/validate');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.get);
router.patch('/character', controller.updateCharacter);
router.patch('/theme', validateTheme, controller.updateTheme);
router.patch('/appearance', validateAppearance, controller.updateAppearance);

module.exports = router;
