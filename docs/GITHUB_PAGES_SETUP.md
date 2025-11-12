# GitHub Pages & GitBook Deployment Guide

Complete guide for deploying your documentation to GitHub Pages.

## 🚀 Quick Deploy

Your documentation is now configured for automatic deployment! Just push to GitHub:

```bash
git add .
git commit -m "docs: Update GitBook documentation"
git push origin main
```

The GitHub Actions workflow will automatically build and deploy to GitHub Pages.

## 📋 Setup Requirements

### 1. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under **Source**, select:
   - **Source**: Deploy from a branch
   - **Branch**: `gh-pages`
   - **Folder**: `/ (root)`
4. Click **Save**

### 2. Verify Workflow Permissions

1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
3. Click **Save**

## 🔧 How It Works

### Automated Workflow

The `.github/workflows/deploy-gitbook.yml` workflow:

1. **Triggers** on push to `main` branch (when docs change)
2. **Uses Node.js 20** (required for Honkit dependencies)
3. **Uses Honkit** (modern GitBook alternative)
4. **Builds** documentation to `_book/` directory
5. **Deploys** to `gh-pages` branch
6. **Published** at: `https://mega-zinyz.github.io/Sentiment-Analysis`

### What Triggers Deployment

Documentation builds automatically when you update:
- Any `.md` files in root directory
- Any files in `docs/` directory
- `book.json` configuration
- `SUMMARY.md` table of contents
- `styles/` CSS files
- The workflow file itself

### Build Process

```
Push to main
    ↓
GitHub Actions Triggered
    ↓
Checkout Repository
    ↓
Setup Node.js 18
    ↓
Install Honkit
    ↓
Install Plugins
    ↓
Build Documentation
    ↓
Deploy to gh-pages Branch
    ↓
Live at GitHub Pages
```

## 🧪 Local Testing

### Option 1: Using npm (Recommended)

```bash
# Install dependencies
npm install

# Install Honkit plugins
npm run docs:install

# Serve locally at http://localhost:4000
npm run docs:serve

# Build to _book/ directory
npm run docs:build
```

### Option 2: Using Honkit Directly

```bash
# Install Honkit globally
npm install -g honkit

# Install plugins
honkit install

# Serve locally
honkit serve

# Build
honkit build
```

### Preview Built Site

After building:

```bash
# Using Python
cd _book
python -m http.server 8000

# Or using Node.js
npx http-server _book
```

Then open: http://localhost:8000

## 🐛 Troubleshooting

### Build Fails: "ReferenceError: File is not defined"

**Error**: 
```
ReferenceError: File is not defined
  at undici/lib/web/webidl/index.js
```

**Cause**: Honkit's dependency `undici` requires Node.js 20+, but workflow is using an older version.

**Solution**: Update workflow to use Node.js 20:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # Changed from 18
```

### Build Fails: "EBADENGINE Unsupported engine"

**Error**: `npm warn EBADENGINE required: { node: '>=20.18.1' }`

**Cause**: Node.js version too old for Honkit dependencies.

**Solution**: 
- **GitHub Actions**: Update workflow to Node.js 20+
- **Local**: Install Node.js 20+ from https://nodejs.org/

### Build Fails: "Dependencies lock file is not found"

**Error**: `Dependencies lock file is not found in /home/runner/work/Sentiment-Analysis/Sentiment-Analysis`

**Cause**: GitHub Actions cache requires a lock file.

**Solution**: The workflow has been updated to remove caching. If you want to re-enable caching:

1. Generate lock file locally:
   ```bash
   npm install
   git add package-lock.json
   git commit -m "chore: Add package-lock.json for GitHub Actions cache"
   git push
   ```

2. Update workflow to use cache:
   ```yaml
   - name: Setup Node.js
     uses: actions/setup-node@v4
     with:
       node-version: '18'
       cache: 'npm'  # This requires package-lock.json
   ```

### Build Fails: "Plugin not found"

**Error**: `ReferenceError: Failed to load HonKit's plugin module: "anchors" is not found`

**Cause**: Honkit plugins need to be installed as npm packages (e.g., `gitbook-plugin-anchors`), which adds complexity.

**Solution**: Use only built-in plugins in `book.json`:

```json
{
  "plugins": [
    "search",
    "-sharing",
    "-fontsettings"
  ]
}
```

**Note**: Built-in plugins (search, sharing, fontsettings) work without installation. External plugins require:
```bash
npm install --save gitbook-plugin-anchors
npm install --save gitbook-plugin-github
# etc.
```

### Build Fails: "Cannot find module"

**Solution**: Install dependencies:

```bash
npm install
npm run docs:install
```

### GitHub Pages Shows 404

**Possible causes**:

1. **gh-pages branch doesn't exist**
   - Wait for first successful workflow run
   - Check Actions tab for build status

2. **GitHub Pages not enabled**
   - Enable in Settings → Pages
   - Select `gh-pages` branch

3. **.nojekyll file missing**
   - Workflow adds it automatically
   - If missing, create empty `.nojekyll` in gh-pages branch

### Workflow Permission Denied

**Solution**:

1. Go to Settings → Actions → General
2. Enable "Read and write permissions"
3. Re-run workflow

### Custom Domain Issues

If using custom domain:

1. Add `CNAME` file to root:
   ```
   docs.yourdomain.com
   ```

2. Configure DNS:
   ```
   CNAME record: docs → mega-zinyz.github.io
   ```

3. Enable HTTPS in GitHub Pages settings

## 📝 Configuration

### Customize Workflow

Edit `.github/workflows/deploy-gitbook.yml`:

```yaml
# Change Node.js version (minimum 20 required for Honkit)
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # or '22' (18 not supported)

# Add custom domain
- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v4
  with:
    cname: docs.yourdomain.com  # Add your domain
```

### Customize Book Config

Edit `book.json`:

```json
{
  "title": "Your Title",
  "description": "Your description",
  "author": "Your Name",
  "plugins": [
    // Add or remove plugins
  ],
  "links": {
    "sidebar": {
      "Your Link": "https://yoursite.com"
    }
  }
}
```

### Add Custom Styling

Edit `styles/website.css` for custom CSS.

## 🔒 Security Best Practices

### What to Commit

✅ **DO commit**:
- Documentation files (`.md`)
- Configuration files (`book.json`, `SUMMARY.md`)
- Styles (`styles/website.css`)
- Workflow files (`.github/workflows/`)
- Package.json

❌ **DON'T commit**:
- Built files (`_book/`)
- Node modules (`node_modules/`)
- Environment files (`.env`)
- Backup files (`*.backup`)

### Secrets Management

Never commit:
- API keys
- Database passwords
- JWT secrets
- Private credentials

Use GitHub Secrets for sensitive data in workflows.

## 📊 Monitoring Deployments

### Check Build Status

1. Go to repository **Actions** tab
2. Click on latest workflow run
3. View build logs
4. Check for errors

### View Live Site

- **Production URL**: https://mega-zinyz.github.io/Sentiment-Analysis
- **Check Status**: Green checkmark in Actions tab
- **View Logs**: Click workflow run for details

### Build History

GitHub keeps:
- Last 90 days of workflow runs
- All workflow logs
- Deployment history

## 🎨 Customization Tips

### Add Logo

1. Add logo to `docs/assets/logo.png`
2. Update `README.md`:
   ```markdown
   ![Logo](docs/assets/logo.png)
   ```

### Custom Favicon

1. Add favicon to `styles/images/favicon.ico`
2. Honkit will use it automatically

### Theme Customization

Edit `styles/website.css`:

```css
/* Custom colors */
:root {
  --primary-color: #0366d6;
  --text-color: #24292e;
}

/* Custom sidebar */
.book-summary {
  background-color: #f6f8fa;
}
```

## 📚 Advanced Features

### Multi-version Documentation

Create branches for versions:

```bash
git checkout -b docs-v1.0
git checkout -b docs-v2.0
```

Deploy each version to different paths.

### Analytics Integration

Add Google Analytics to `book.json`:

```json
{
  "plugins": ["ga"],
  "pluginsConfig": {
    "ga": {
      "token": "UA-XXXXXX-X"
    }
  }
}
```

### Search Optimization

Plugins already included:
- ✅ Full-text search
- ✅ Heading anchors
- ✅ Code copy buttons

## 🆘 Getting Help

### Resources

- [Honkit Documentation](https://github.com/honkit/honkit)
- [GitHub Pages Docs](https://docs.github.com/pages)
- [GitHub Actions Docs](https://docs.github.com/actions)

### Common Issues

See our [Troubleshooting Guide](../troubleshooting/COMMON_ISSUES.md)

### Report Issues

[Create an issue](https://github.com/Mega-Zinyz/Sentiment-Analysis/issues) if you encounter problems.

---

**Your documentation is ready to deploy! Just push to GitHub and watch it build automatically.** 🚀

**Last Updated**: November 12, 2025
