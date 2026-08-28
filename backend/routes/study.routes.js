const express = require('express');
const controller = require('../controllers/study.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.post('/', controller.create);
router.get('/', controller.list);
router.get('/summary', controller.summary);
router.get('/active', controller.activeSession);
router.post('/start', controller.startSession);
router.post('/:id/stop', controller.stopSession);

module.exports = router;
