const express = require('express');
const controller = require('../controllers/quests.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateQuest, validateStatus } = require('../middleware/validate');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', validateQuest, controller.create);
router.put('/:id', validateQuest, controller.update);
router.patch('/:id/status', validateStatus, controller.updateStatus);
router.delete('/:id', controller.remove);

module.exports = router;
