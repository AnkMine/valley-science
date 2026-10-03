# Switching branches without breaking `npm run dev`

This repo has three package areas: `frontend`, `backend`, and the root. Each has its own `package.json`, `package-lock.json`, and `node_modules/`.

## The problem, in plain words

Think of `package.json` as a **shopping list** and `node_modules/` as the **pantry** where the actual library code lives.

When you run `git checkout some-branch`, git rewrites the shopping lists — but it **never touches the pantry**, because `node_modules/` is in `.gitignore`. Git does not know the pantry exists.

So after a branch switch, the list may ask for packages the pantry doesn't have (or different versions), and `npm run dev` crashes with errors like `Cannot find module ...`.

## The fix: one command, run automatically

`scripts/setup-dev.sh` (run by `npm run setup`) compares the branch's dependency lists with what is installed, and only goes online when they differ:

1. Finds a Node 22 runtime — prefers a Homebrew `node@22` install, otherwise uses the Node on PATH (and warns loudly if it is not 22). Exits with a clear error if Node is older than 22.
2. For `frontend` and `backend`, computes a fingerprint (sha256) of `package.json` + `package-lock.json`.
3. Compares it to a hidden stamp file inside `node_modules/`.
   - Match → prints `up to date`, finishes in under a second, no network.
   - Differ → `npm ci` (exact install from the lockfile) or `npm install` (if the lockfile itself needs updating).
4. Saves the new fingerprint so the next check is instant.

A git hook (`scripts/git-hooks/post-checkout`, installed by `npm run prepare`) runs this script automatically after every branch switch. So the normal flow is:

```
git checkout feature/ui     # hook runs setup-dev.sh for you
npm run dev:backend         # terminal 1 — http://localhost:3001
npm run dev:frontend        # terminal 2 — http://localhost:3000
```

If the hook ever seems silent, or something feels off, run it yourself:

```
npm run setup
```

## Extra guards

- `engines.node: ">=22"` in both `package.json` files + `engine-strict=true` in `.npmrc` → `npm install` refuses to run on old Node.
- `.nvmrc` pins the exact CI version (`22.14.0`). With nvm installed, `nvm use` picks it up.
- `scripts/require-node22.js` (root `postinstall`) re-checks Node and writes the stamps on fresh installs.

## Node 22 on this Mac

Installed via Homebrew (`brew install node@22`, currently v22.23.3). `setup-dev.sh` finds it automatically at `/opt/homebrew/opt/node@22/bin/node` — you do not need to change your PATH. If you prefer the exact CI version, install nvm and run `nvm install` in this folder (it reads `.nvmrc`).

## First time on a fresh clone

```
npm install     # root — installs the git hooks
npm run setup   # installs frontend + backend deps
```

After that, branch switches handle themselves.
