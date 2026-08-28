require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth.routes');
const questsRoutes = require('./routes/quests.routes');
const studyRoutes = require('./routes/study.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const charactersRoutes = require('./routes/characters.routes');
const settingsRoutes = require('./routes/settings.routes');
const profileRoutes = require('./routes/profile.routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { success } = require('./utils/responses');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Static frontend + production assets (reference/ is intentionally NOT served).
// /assets (fonts, character art, backgrounds, logo) never changes during normal use, so it
// gets a real cache lifetime — without this, the default max-age=0 forced the browser to
// revalidate the font files on every single navigation, which is what made the
// font-display timing (see global.css) actually visible instead of a one-time cost.
// frontend/ (HTML/CSS/JS) is left at the default — it's still under active development.
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), { maxAge: '7d' }));

app.get('/api/health', (req, res) => success(res, { status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/quests', questsRoutes);
app.use('/api/study-sessions', studyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/characters', charactersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/profile', profileRoutes);

app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`FocusArc server running at http://localhost:${PORT}`);
});
