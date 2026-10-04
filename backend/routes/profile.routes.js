const express = require('express');
const controller = require('../controllers/profile.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateProfile } = require('../middleware/validate');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.get);
router.put('/', validateProfile, controller.update);
router.put('/password', controller.updatePassword);
router.delete('/', controller.remove);

module.exports = router;
