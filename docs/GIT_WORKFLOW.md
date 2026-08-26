# Git Workflow

Git was not installed on the primary dev machine as of project kickoff (2026-08-26); this
document describes the workflow to use once it is set up.

## Branches

- `main` — always deployable
- Feature branches, one per unit of work:
  `feature/backend-database`, `feature/backend-auth`, `feature/backend-quests`,
  `feature/backend-analytics`, `feature/frontend-login`, `feature/frontend-questboard`,
  `feature/frontend-analytics`, `feature/frontend-character`, `feature/frontend-settings`,
  `feature/theme-system`

## Commit messages

Conventional, scoped, one logical change per commit — never one giant commit for the whole app:

```
feat(database): create initial MySQL schema
feat(auth): implement user registration
feat(auth): implement login authentication
feat(quests): implement quest CRUD
feat(quests): enforce maximum 10 quests
feat(study): implement study sessions
feat(analytics): implement analytics endpoints
feat(frontend): implement login page
feat(frontend): implement quest board
feat(frontend): implement character guide
feat(frontend): implement analytics page
feat(frontend): implement settings page
feat(theme): implement theme system
docs: document database architecture
docs: document REST API
fix(quests): correct quest status handling
refactor(frontend): organize shared UI styles
```

## Authorship

- **Richa** commits backend, database, API, server logic, auth, and backend/database docs.
- **Aashika** commits HTML, CSS, vanilla JS frontend, UI/UX, and frontend docs.

Each contributor's commits use their own real, configured `git config user.name`/`user.email` —
never a shared or fabricated identity, and never an AI/assistant identity. If work happened
before Git existed in the project, it's recorded retroactively in
[DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) with its real date rather than backdated into fake
commits.

## Before every commit

1. `git status` — review exactly what's staged.
2. Review the diff for anything unexpected (accidental files, secrets in `.env` — which must
   stay untracked per `.gitignore`).
3. Run relevant tests/checks.
4. Update `docs/DEVELOPMENT_LOG.md`.
5. Propose the commit message and get a go-ahead before committing/pushing.
