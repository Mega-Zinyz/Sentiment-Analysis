# Deploying Frontend to Vercel (monorepo)

This repository contains both Backend and Frontend. To deploy only the Frontend to Vercel you can either point a Vercel project at the `Frontend` subdirectory or use the `vercel.json` included at the repo root (recommended for monorepo builds).

Recommended quick steps (monorepo):

1. In Vercel, create a new Project -> Import from Git.
2. Select this repository.
3. In the "Root Directory" field set `Frontend` (optional if you want Vercel to detect automatically). If you leave root empty, the `vercel.json` at repository root tells Vercel to build using `Frontend/package.json`.
4. Build & Output Settings (if using UI override):
   - Install Command: `npm install`
   - Build Command: `npm run build` (this now runs `prebuild` which generates runtime config)
   - Output Directory: `dist/frontend`

5. Add Environment Variables required by the frontend in the Vercel project settings (e.g., `API_URL`).
    - You can add them manually in the Vercel UI, or use the Vercel CLI:
       - `vercel env add API_URL production`
       - or to bulk upload from a local `.env` file: `vercel env add` (interactive) or use `vercel env pull`/`vercel env push`.

6. Deploy. Vercel will run `npm install` inside the `Frontend` directory and then `npm run build`, producing `dist/frontend` which will be served as a static site.

Alternative: separate repositories

- If you prefer a dedicated frontend repository (clean separation), create a new GitHub repo and push the `Frontend` folder contents there. In that case, Vercel will detect the Angular project automatically when you import the new repo.

Notes

- `vercel.json` in the repo root is designed to instruct Vercel's static builder to use `Frontend/package.json` and serve `dist/frontend`.
- If your Angular app uses runtime environment variables, consider a small runtime-config script or use Vercel Environment Variables and inject them at build time.
