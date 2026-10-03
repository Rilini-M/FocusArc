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

app.use(express.static(path.join(__dirname, '..', 'frontend')));
// No long max-age: browsers revalidate (ETag/Last-Modified), so replacing an image with the
// same filename shows up on the next load instead of after a week-long cache.
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), { maxAge: 0 }));

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
