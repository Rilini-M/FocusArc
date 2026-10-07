const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Quest attachments (up to MAX_FILES per quest). Files are stored on disk in uploads/quests/
// (outside frontend/, so they are never served publicly) under a random name; the
// quest_attachments table only keeps the original name, the path inside uploads/, the type and
// the size. Files are served by GET /api/quests/:id/attachments/:attachmentId, to the quest's
// owner only.

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const QUEST_DIR = path.join(UPLOAD_ROOT, 'quests');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5; // per quest
const TOO_MANY_FILES = `You can attach a maximum of ${MAX_FILES} files per quest.`;
const NAME_MAX = 120;

fs.mkdirSync(QUEST_DIR, { recursive: true });

// Allowed file types (by extension): study material only. The content type is ours, never the
// browser's, and `inline` types may open in the browser instead of downloading.
const FILE_TYPES = {
  pdf: { type: 'application/pdf', inline: true, magic: 'pdf' },
  png: { type: 'image/png', inline: true, magic: 'png' },
  jpg: { type: 'image/jpeg', inline: true, magic: 'jpg' },
  jpeg: { type: 'image/jpeg', inline: true, magic: 'jpg' },
  gif: { type: 'image/gif', inline: true, magic: 'gif' },
  webp: { type: 'image/webp', inline: true, magic: 'webp' },
  txt: { type: 'text/plain; charset=utf-8', inline: true, magic: 'text' },
  md: { type: 'text/markdown; charset=utf-8', inline: false, magic: 'text' },
  csv: { type: 'text/csv; charset=utf-8', inline: false, magic: 'text' },
  doc: { type: 'application/msword', inline: false, magic: 'ole' },
  xls: { type: 'application/vnd.ms-excel', inline: false, magic: 'ole' },
  ppt: { type: 'application/vnd.ms-powerpoint', inline: false, magic: 'ole' },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false, magic: 'zip' },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false, magic: 'zip' },
  pptx: { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false, magic: 'zip' },
  odt: { type: 'application/vnd.oasis.opendocument.text', inline: false, magic: 'zip' },
  ods: { type: 'application/vnd.oasis.opendocument.spreadsheet', inline: false, magic: 'zip' },
  odp: { type: 'application/vnd.oasis.opendocument.presentation', inline: false, magic: 'zip' },
};

const startsWith = (buffer, bytes, offset = 0) => buffer.slice(offset, offset + bytes.length).equals(Buffer.from(bytes));

// The file's first bytes must match its extension, so e.g. a program renamed to .pdf is refused.
const MAGIC_CHECKS = {
  pdf: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]),
  jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  gif: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]), // GIF8
  webp: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8), // RIFF....WEBP
  zip: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]), // modern Office / OpenDocument
  ole: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), // old Office
  // Plain text: no NUL bytes, and not a script with a #! line.
  text: (b) => !b.includes(0) && !startsWith(b, [0x23, 0x21]),
};

const ALLOWED_LIST = Object.keys(FILE_TYPES).join(', ');

function extensionOf(name) {
  const ext = path.extname(name || '').slice(1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(FILE_TYPES, ext) ? ext : null;
}

// The name shown to the user: no folders, control characters or characters that are unsafe in
// file names or headers, at most NAME_MAX characters, extension kept.
function safeDisplayName(originalName, ext) {
  let name = path.basename(String(originalName || '').replace(/\\/g, '/'));
  name = name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
  let base = name.slice(0, name.length - path.extname(name).length).replace(/^\.+/, '').trim();
  if (!base) base = 'attachment';
  base = [...base].slice(0, NAME_MAX - ext.length - 1).join('');
  return `${base}.${ext}`;
}

// Parses the optional files (field "files", multipart/form-data) into memory, so nothing
// touches the disk before the quest itself has been validated. JSON requests pass through.
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES, fields: 20, fieldSize: 10 * 1024 },
  defParamCharset: 'utf8',
}).array('files', MAX_FILES);

function questUpload(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next();
    let message = 'The upload could not be read. Please try again.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `A file is too large. The limit is ${MAX_FILE_SIZE / 1024 / 1024} MB per file.`;
    } else if (err.code === 'LIMIT_FILE_COUNT' || (err.code === 'LIMIT_UNEXPECTED_FILE' && err.field === 'files')) {
      message = TOO_MANY_FILES;
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Send files in the "files" field.';
    }
    return res.status(400).json({ success: false, message });
  });
}

// Returns an error message naming the file, or null when the uploaded file is acceptable.
function fileError(file) {
  const ext = extensionOf(file.originalname);
  const name = path.basename(String(file.originalname || 'file').replace(/\\/g, '/'));
  if (!ext) return `"${name}": this file type is not allowed. Allowed types: ${ALLOWED_LIST}.`;
  if (!file.size) return `"${name}" is empty.`;
  if (!MAGIC_CHECKS[FILE_TYPES[ext].magic](file.buffer)) {
    return `"${name}": the file's contents don't match its .${ext} extension.`;
  }
  return null;
}

// Writes a checked file to disk under a random name. Returns its quest_attachments columns.
async function saveQuestFile(file) {
  const ext = extensionOf(file.originalname);
  const storedName = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(QUEST_DIR, storedName), file.buffer, { flag: 'wx' });
  return {
    file_name: safeDisplayName(file.originalname, ext),
    file_path: `quests/${storedName}`,
    file_type: FILE_TYPES[ext].type.split(';')[0],
    file_size: file.size,
  };
}

// Absolute path for a stored file_path, or null if it would point outside uploads/quests/.
function storedFilePath(filePath) {
  if (typeof filePath !== 'string' || !/^quests\/[a-f0-9]{32}\.[a-z]+$/.test(filePath)) return null;
  const absolute = path.resolve(UPLOAD_ROOT, filePath);
  return absolute.startsWith(QUEST_DIR + path.sep) ? absolute : null;
}

// Deletes a stored file; a missing file is fine (already gone).
async function removeQuestFile(filePath) {
  const absolute = storedFilePath(filePath);
  if (!absolute) return;
  try {
    await fs.promises.unlink(absolute);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not delete quest file', filePath, err.message);
  }
}

// Response headers for sending a stored file back to its owner. PDFs, images and text open in
// the browser (the Quest Board opens them in a new tab); other types download.
function downloadHeaders(filePath, fileName) {
  const ext = extensionOf(filePath);
  const info = ext ? FILE_TYPES[ext] : { type: 'application/octet-stream', inline: false };
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const headers = {
    'Content-Type': info.type,
    'Content-Disposition': `${info.inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  };
  // Images and text can't run scripts or reach the rest of the app. PDFs are left out because
  // the browser's built-in PDF viewer doesn't load inside a sandboxed page.
  if (ext !== 'pdf') headers['Content-Security-Policy'] = 'sandbox';
  return headers;
}

module.exports = {
  MAX_FILE_SIZE,
  MAX_FILES,
  TOO_MANY_FILES,
  questUpload,
  fileError,
  saveQuestFile,
  storedFilePath,
  removeQuestFile,
  downloadHeaders,
};
