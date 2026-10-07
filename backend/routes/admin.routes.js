const express = require('express');
const controller = require('../controllers/admin.controller');
const characters = require('../controllers/adminCharacters.controller');
const { requireAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

// Every route below requires a logged-in ADMIN (401 if logged out, 403 for normal users).
router.use(requireAdmin);

router.get('/dashboard', controller.dashboard);

router.get('/characters/api', characters.fetchFromApi);
router.post('/characters/import', characters.importCharacter);
router.get('/characters', characters.listImported);
router.put('/characters/:id', characters.updateDescription);
router.delete('/characters/:id', characters.remove);

module.exports = router;
