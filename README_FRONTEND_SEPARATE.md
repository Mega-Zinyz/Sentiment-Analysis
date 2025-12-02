# Export `Frontend` to its own repository (for Vercel)

This guide shows how to create a separate frontend repository from the monorepo so you can deploy it to Vercel as an independent project.

1) Using the provided helper script (recommended)

From the repository root run (PowerShell):

```powershell
# Create a new folder, initialize git and push to your new GitHub repo
.
\scripts\extract_frontend_for_vercel.ps1 -RemoteUrl "git@github.com:<your-org-or-user>/<frontend-repo>.git" -Branch main

# If you don't want to push automatically, omit -RemoteUrl and the script will only prepare the folder.
```

After the script completes you'll have a clean folder (e.g., `frontend-deploy-YYYYMMDDHHMMSS`) containing only the frontend sources and a git repo. If you provided `-RemoteUrl`, the script attempts to push to that remote.

2) Manual method (alternative)

- Create a new empty GitHub repository via the GitHub UI.
- Clone it locally to a folder outside your monorepo.
- Copy the contents of the `Frontend/` folder from this repo into the new clone.
- Commit and push.

3) Vercel setup

- In Vercel, create a new Project -> Import Git Repository.
- Choose the new frontend-only repo (or point the project root to `Frontend` if you prefer to keep the monorepo).
- Configure Build settings:
  - Install Command: `npm ci` or `npm install`
  - Build Command: `npm run build`
  - Output Directory: `dist/frontend`
- Add any required Environment Variables (e.g., API URL) in the Vercel project settings.

4) Runtime environment variables

Angular builds by default bake environment values at build time. If you need runtime configuration, add a small `assets/runtime-config.json` pattern and generate it during the Vercel build using Vercel environment variables.

---

If you want, I can:
- Add a `workflow` that auto-extracts `Frontend` and pushes to a dedicated repo on push to a selected branch.
- Add an automated GitHub Action that builds and deploys to Vercel (if you prefer CI-driven deploys).
