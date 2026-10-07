const express = require('express');
const controller = require('../controllers/admin.controller');
const characters = require('../controllers/adminCharacters.controller');
const themes = require('../controllers/themes.controller');
const { requireAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

// Every route below requires a logged-in ADMIN (401 if logged out, 403 for normal users).
router.use(requireAdmin);

router.get('/dashboard', controller.dashboard);

router.get('/characters/api', characters.fetchFromApi);
router.post('/characters/import', characters.importCharacter);
router.post('/characters/import-bulk', characters.importBulk);
router.post('/characters/generate-quotes', characters.generateMissingQuotes);
router.get('/characters', characters.listImported);
router.put('/characters/:id', characters.updateDescription);
router.delete('/characters/:id', characters.remove);

// Study themes: add or edit themes without touching frontend code (no delete; hide with isActive).
router.get('/themes', themes.listAll);
router.post('/themes', themes.create);
router.put('/themes/:key', themes.update);

module.exports = router;
