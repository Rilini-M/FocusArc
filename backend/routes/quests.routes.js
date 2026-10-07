const express = require('express');
const controller = require('../controllers/quests.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateQuest } = require('../middleware/validate');
const { questUpload } = require('../services/questFiles.service');

const router = express.Router();

router.use(authenticate);

// Quest status is set by the server from study sessions (questStatus.service.js), so there is
// no route to change it by hand.
router.get('/', controller.list);
router.post('/', questUpload, validateQuest, controller.create);
router.put('/:id', questUpload, validateQuest, controller.update);
router.get('/:id/attachments/:attachmentId', controller.attachment);
router.delete('/:id', controller.remove);

module.exports = router;
