const { success } = require('../utils/responses');

// Management for these sections is not built yet; the dashboard only lists them.
const SECTIONS = [
  { key: 'users', label: 'Users', icon: 'users', description: 'Manage user accounts' },
  { key: 'characters', label: 'Characters', icon: 'user-round', description: 'Manage study companions' },
  { key: 'themes', label: 'Themes', icon: 'palette', description: 'Manage app themes' },
  { key: 'quests', label: 'Quests', icon: 'list-checks', description: 'Manage quests' },
  { key: 'files', label: 'Files', icon: 'folder', description: 'Manage uploaded files' },
];

function dashboard(req, res) {
  return success(res, { message: 'Welcome to the Admin Dashboard.', sections: SECTIONS });
}

module.exports = { dashboard };
