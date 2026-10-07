const pool = require('../config/database');
const { success, failure } = require('../utils/responses');

// Study themes live in the `themes` table. GET /api/themes feeds the frontend's theme pickers
// and the CSS variables each theme applies, so a theme added here needs no frontend change.

// Particle styles the frontend knows how to draw (FOCUSARC_PARTICLE_STYLES in frontend/js/particles.js).
const PARTICLE_STYLES = ['leaf', 'sparkle', 'ember', 'spark', 'dust', 'dot', 'petal', 'star', 'snow', 'bubble', 'firefly', 'lantern'];
const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/; // used in data-theme="..." and CSS selectors
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const KEY_MAX = 40;
const LABEL_MAX = 60;
const SYMBOL_MAX = 8;

const COLUMNS = `theme_key, label, accent, accent_2, accent_3, background, symbol, particle_style,
  particle_density, sort_order, is_active`;

function toTheme(row) {
  return {
    key: row.theme_key,
    label: row.label,
    accent: row.accent,
    accent2: row.accent_2,
    accent3: row.accent_3,
    background: row.background,
    symbol: row.symbol,
    particleStyle: row.particle_style,
    particleDensity: Number(row.particle_density),
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
  };
}

// GET /api/themes — every active theme, in display order. Public: themes are not user data.
async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT ${COLUMNS} FROM themes WHERE is_active = 1 ORDER BY sort_order, id`
    );
    return success(res, rows.map(toTheme));
  } catch (err) {
    return next(err);
  }
}

// True when `key` is an active theme a user may pick.
async function isSelectable(key) {
  const [rows] = await pool.query(`SELECT 1 FROM themes WHERE theme_key = ? AND is_active = 1`, [key]);
  return rows.length > 0;
}

// GET /api/admin/themes — all themes, including inactive ones.
async function listAll(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM themes ORDER BY sort_order, id`);
    return success(res, rows.map(toTheme));
  } catch (err) {
    return next(err);
  }
}

// Checks the editable theme fields in `body`. With `partial`, missing fields are left alone
// (update); otherwise label and both main colors are required (create).
// Returns { error } or { values } with database column names.
function readThemeFields(body, partial) {
  const values = {};
  const has = (field) => body[field] !== undefined;

  if (has('label') || !partial) {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label || label.length > LABEL_MAX) return { error: `Label is required (up to ${LABEL_MAX} characters).` };
    values.label = label;
  }

  const colors = { accent: 'accent', accent2: 'accent_2', accent3: 'accent_3', background: 'background' };
  for (const [field, column] of Object.entries(colors)) {
    const required = !partial && (field === 'accent' || field === 'accent2');
    if (!has(field) && !required) continue;
    const value = body[field];
    // The optional colors can be cleared with null; they then fall back to the defaults.
    if (value === null && (field === 'accent3' || field === 'background')) {
      values[column] = null;
    } else if (typeof value !== 'string' || !COLOR_RE.test(value)) {
      return { error: `${field} must be a color like #2dd4bf.` };
    } else {
      values[column] = value.toLowerCase();
    }
  }

  if (has('symbol')) {
    const symbol = body.symbol === null ? '' : String(body.symbol).trim();
    // Shown via CSS content: '...', so quotes, backslashes and angle brackets are not allowed.
    if ([...symbol].length > 2 || symbol.length > SYMBOL_MAX || /['"\\<>]/.test(symbol)) {
      return { error: 'Symbol must be one or two characters, without quotes or backslashes.' };
    }
    values.symbol = symbol || null;
  }

  if (has('particleStyle')) {
    if (!PARTICLE_STYLES.includes(body.particleStyle)) {
      return { error: `particleStyle must be one of: ${PARTICLE_STYLES.join(', ')}.` };
    }
    values.particle_style = body.particleStyle;
  }

  if (has('particleDensity')) {
    const density = Number(body.particleDensity);
    if (!Number.isFinite(density) || density < 0 || density > 1) {
      return { error: 'particleDensity must be a number from 0 to 1.' };
    }
    values.particle_density = density;
  }

  if (has('sortOrder')) {
    if (!Number.isInteger(body.sortOrder)) return { error: 'sortOrder must be a whole number.' };
    values.sort_order = body.sortOrder;
  }

  if (has('isActive')) {
    if (typeof body.isActive !== 'boolean') return { error: 'isActive must be true or false.' };
    values.is_active = body.isActive ? 1 : 0;
  }

  return { values };
}

// POST /api/admin/themes — add a theme. Body: { key, label, accent, accent2, accent3?,
// background?, symbol?, particleStyle?, particleDensity?, sortOrder?, isActive? }
async function create(req, res, next) {
  const key = typeof req.body.key === 'string' ? req.body.key.trim() : '';
  if (!key || key.length > KEY_MAX || !KEY_RE.test(key)) {
    return failure(res, `Key must be lowercase letters, numbers and single dashes (up to ${KEY_MAX} characters), like "deep-sea".`);
  }

  const { error, values } = readThemeFields(req.body, false);
  if (error) return failure(res, error);

  try {
    const [existing] = await pool.query(`SELECT 1 FROM themes WHERE theme_key = ?`, [key]);
    if (existing.length > 0) return failure(res, 'A theme with this key already exists.', 409);

    if (values.sort_order === undefined) {
      const [[{ next: nextOrder }]] = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM themes`);
      values.sort_order = nextOrder;
    }

    await pool.query(`INSERT INTO themes SET ?`, [{ theme_key: key, ...values }]);
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM themes WHERE theme_key = ?`, [key]);
    return success(res, toTheme(rows[0]), 201);
  } catch (err) {
    return next(err);
  }
}

// PUT /api/admin/themes/:key — change any of a theme's fields (not its key). Themes are never
// deleted, because users may have them saved; set isActive: false to hide one instead.
async function update(req, res, next) {
  const { key } = req.params;
  const { error, values } = readThemeFields(req.body, true);
  if (error) return failure(res, error);
  if (Object.keys(values).length === 0) return failure(res, 'Nothing to update.');
  if (key === 'default' && values.is_active === 0) {
    return failure(res, 'The FocusArc theme is the fallback for everyone and cannot be hidden.');
  }

  try {
    const [result] = await pool.query(`UPDATE themes SET ? WHERE theme_key = ?`, [values, key]);
    if (result.affectedRows === 0) return failure(res, 'Theme not found.', 404);
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM themes WHERE theme_key = ?`, [key]);
    return success(res, toTheme(rows[0]));
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, listAll, create, update, isSelectable };
