const express = require('express');
const controller = require('../controllers/characters.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/quotes', controller.quotes);

module.exports = router;
