# Project plan

This project is now running locally, so the next step is to move from “local proof” to “production-ready setup” without overbuilding too early.

## 1. Freeze the working local baseline

Goal: make sure the app is reproducible on a fresh machine.

- Keep the working local env values in `.env` and `.dev.vars`
- Keep the local D1 database initialization commands documented
- Keep the first-admin setup flow documented
- Do not make large architecture changes until the local baseline is stable

Checklist:
- `pnpm install`
- `.env` + `.dev.vars` configured
- D1 tables created locally
- `pnpm dev` runs without errors
- admin can be created via `/setup`
- `/login` and `/admin` can be accessed

## 2. Clean up the repo only enough to be safe

Goal: remove obvious mess without rewriting the app.

- Remove or ignore local junk such as `.wrangler`, `.next`, logs, caches, temp files
- Keep `.env` / `.dev.vars` out of Git
- Keep the repo focused on source code, not generated local state
- Keep a clear record of which files are required to run the app

Checklist:
- `.gitignore` covers generated files and local env files
- repo no longer contains local runtime artifacts
- no accidental secrets are committed

## 3. Clarify the deployment target

Goal: decide where this app should run.

- If the goal is Cloudflare: keep the Cloudflare D1/R2 setup and deploy flow
- If the goal changes: decide on a new backend/database stack before committing to it

Checklist:
- confirm production target: Cloudflare or something else
- confirm the database type to use in production
- confirm storage for media files
- confirm env variables for production

## 4. Prepare production config

Goal: make the app deployable, not just runnable locally.

- set real production env values
- set real production D1/R2 bindings
- verify admin setup token and email for production
- confirm database migrations run in the deployment environment

Checklist:
- production DB exists
- production storage exists
- production env values are set
- deployment config is explicit and documented

## 5. Verify the real app behavior after deployment

Goal: make sure the production app works in a real environment, not just locally.

- test admin login
- test login/register flow
- test posting, comments, and permissions
- test media upload/storage
- test moderation/admin functions

Checklist:
- login works
- admin works
- posting works
- media works
- permissions work

## 6. Only then do broader cleanup if needed

Goal: reduce confusion, not rewrite the product.

- tidy docs
- simplify setup guide for the friend
- add a clear “run locally” guide
- keep only the setup files needed for actual operation

Do not do a full refactor before the app has proven it can run in production.

## Recommended next action

The next step is to do Phase 2 and Phase 3 in order:

1. clean the repo only enough to remove local junk and secrets
2. confirm the production target is Cloudflare
3. prepare the production env and binding setup

That is the best next move after the app is already confirmed working locally.
