# Open Source Release Checklist

Run this checklist before the first public push and before every release.

## Local Review

1. Check `git config user.name`, `git config user.email`, and `git remote -v`. Git commits publish the configured author identity; use a deliberate public name and a GitHub noreply address when personal email privacy matters. Point `origin` at the new repository and keep the original project as a separate `upstream` remote.
2. Run `node scripts/release-check.mjs` from the repository root.
3. Review `git status --ignored` and make sure no runtime data, screenshots, logs, profiles, or test captures are staged. Do not publish a whole working-directory zip: it can include the `.git` directory and its local reflog metadata.
4. Review every staged file with `git diff --cached --check` and `git diff --cached`.
5. Search all reachable history, not only the current tree:

   ```powershell
   git log --all -p | Select-String -Pattern 'Users\\|BEGIN .*PRIVATE KEY|ghp_|github_pat_|sk-'
   ```

5. Check issue templates, documentation images, commit messages, release notes, and CI logs. A public repository exposes more than tracked source files.

## Repository Settings

For a GitHub public repository, enable:

- Secret scanning
- Push protection
- Dependabot alerts
- Code scanning when a suitable workflow is available

GitHub's documentation explains that secret scanning examines Git history and that deleting a credential from the latest commit does not remove its exposure from history. Enable push protection before the first public push whenever possible.

## What This Project Must Never Publish

- Any real browser profile or copied profile directory
- `DevToolsActivePort` from a local browser
- Proxy tokens, owned-tab records, screenshots, logs, or diagnostic output
- Account pages, browser target IDs, cookie values, upload paths, or downloaded files
- Local usernames, home directories, or private network addresses

## If Something Sensitive Is Pushed

1. Revoke or rotate the exposed credential immediately.
2. Restrict or take down the repository if necessary.
3. Remove the data from Git history with an appropriate history-rewrite process.
4. Assume clones, forks, caches, CI logs, and secret scanners may already have seen it.
5. Document the remediation without republishing the secret in an issue or commit message.

This checklist is a practical guardrail. It cannot prove that a repository contains no private information.
