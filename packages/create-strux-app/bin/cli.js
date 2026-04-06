#!/usr/bin/env node

/**
 * create-strux-app
 * Interactive CLI to scaffold a new Strux CMS project.
 *
 * Usage:
 *   npx create-strux-app [project-name]
 *   npx create-strux-app                  # interactive mode
 *   npx create-strux-app my-blog --yes    # skip prompts, use defaults
 */

const path = require('path');
const fs = require('fs-extra');
const prompts = require('prompts');
const kleur = require('kleur');
const { execSync } = require('child_process');

// ─── Constants ────────────────────────────────────────────
const REPO_URL = 'https://github.com/wahidzzz/strux-cms.git';
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const BANNER = `
${kleur.cyan().bold('   _____ _                   ')}
${kleur.cyan().bold('  / ____| |                  ')}
${kleur.cyan().bold(' | (___ | |_ _ __ _   ___  __')}
${kleur.cyan().bold("  \\___ \\| __| '__| | | \\ \\/ /")}
${kleur.cyan().bold("  ____) | |_| |  | |_| |>  < ")}
${kleur.cyan().bold(' |_____/ \\__|_|   \\__,_/_/\\_\\')}
${kleur.gray('  Git-native JSON CMS')}
`;

const STARTER_SCHEMAS = {
  blog: [
    {
      file: 'article.schema.json',
      content: {
        displayName: 'Article',
        kind: 'collectionType',
        singularName: 'article',
        pluralName: 'articles',
        description: 'Blog posts and articles.',
        apiId: 'article',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title', required: true },
          content: { type: 'richtext', required: true },
          excerpt: { type: 'text' },
          cover_image: { type: 'media' },
          is_featured: { type: 'boolean', required: false },
          published_at: { type: 'date' },
          category: {
            type: 'relation',
            relation: { target: 'category', relation: 'manyToOne' }
          }
        }
      }
    },
    {
      file: 'category.schema.json',
      content: {
        displayName: 'Category',
        kind: 'collectionType',
        singularName: 'category',
        pluralName: 'categories',
        description: 'Content categories.',
        apiId: 'category',
        attributes: {
          name: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'name', required: true },
          description: { type: 'text' }
        }
      }
    }
  ],
  portfolio: [
    {
      file: 'project.schema.json',
      content: {
        displayName: 'Project',
        kind: 'collectionType',
        singularName: 'project',
        pluralName: 'projects',
        description: 'Portfolio projects.',
        apiId: 'project',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title', required: true },
          description: { type: 'richtext', required: true },
          thumbnail: { type: 'media' },
          url: { type: 'string' },
          tags: { type: 'json' },
          is_featured: { type: 'boolean' }
        }
      }
    }
  ],
  docs: [
    {
      file: 'page.schema.json',
      content: {
        displayName: 'Page',
        kind: 'collectionType',
        singularName: 'page',
        pluralName: 'pages',
        description: 'Documentation pages.',
        apiId: 'page',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title', required: true },
          content: { type: 'richtext', required: true },
          order: { type: 'number' },
          parent_page: {
            type: 'relation',
            relation: { target: 'page', relation: 'manyToOne' }
          }
        }
      }
    }
  ],
  empty: []
};

const SAMPLE_CONTENT = {
  blog: {
    dir: 'article',
    entries: [
      {
        title: 'Welcome to Strux',
        slug: 'welcome-to-strux',
        content: '<h2>Hello World</h2><p>This is your first article powered by Strux CMS. Edit this content through the admin panel or directly in the JSON file.</p><p>Strux stores all content as JSON files versioned by Git — no database required.</p>',
        excerpt: 'Your first article powered by Strux CMS.',
        is_featured: true,
        published_at: new Date().toISOString().split('T')[0]
      }
    ]
  }
};

// ─── Helpers ──────────────────────────────────────────────
function log(msg) { console.log(msg); }
function info(msg) { console.log(kleur.cyan('  ℹ ') + msg); }
function success(msg) { console.log(kleur.green('  ✓ ') + msg); }
function warn(msg) { console.log(kleur.yellow('  ⚠ ') + msg); }
function error(msg) { console.error(kleur.red('  ✗ ') + msg); }

function isGitInstalled() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  log(BANNER);
  log('');

  const args = process.argv.slice(2);
  const useDefaults = args.includes('--yes') || args.includes('-y');
  let projectName = args.find(a => !a.startsWith('-'));

  // --- Prompts ---
  if (!projectName) {
    const res = await prompts({
      type: 'text',
      name: 'name',
      message: 'Project name',
      initial: 'my-strux-app',
      validate: v => /^[a-z0-9_-]+$/i.test(v) || 'Only letters, numbers, hyphens, and underscores.'
    }, { onCancel: () => { process.exit(0); } });
    projectName = res.name;
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(targetDir)) {
    const contents = fs.readdirSync(targetDir);
    if (contents.length > 0) {
      error(`Directory "${projectName}" already exists and is not empty.`);
      process.exit(1);
    }
  }

  let template = 'blog';
  let installDeps = true;
  let initGit = true;

  if (!useDefaults) {
    const answers = await prompts([
      {
        type: 'select',
        name: 'template',
        message: 'Starter template',
        choices: [
          { title: '📝 Blog', description: 'Articles + categories', value: 'blog' },
          { title: '🖼  Portfolio', description: 'Projects showcase', value: 'portfolio' },
          { title: '📖 Docs', description: 'Documentation pages', value: 'docs' },
          { title: '📦 Empty', description: 'Blank project, no schemas', value: 'empty' }
        ],
        initial: 0
      },
      {
        type: 'confirm',
        name: 'install',
        message: 'Install dependencies now?',
        initial: true
      },
      {
        type: 'confirm',
        name: 'git',
        message: 'Initialize Git repository?',
        initial: true
      }
    ], { onCancel: () => { process.exit(0); } });

    template = answers.template || 'blog';
    installDeps = answers.install !== false;
    initGit = answers.git !== false;
  }

  log('');
  info(`Creating ${kleur.bold(projectName)} with ${kleur.cyan(template)} template...`);
  log('');

  // --- 1. Clone repository ---
  info('Downloading Strux CMS...');
  try {
    execSync(`git clone --depth 1 ${REPO_URL} "${targetDir}"`, {
      stdio: 'pipe'
    });
    // Remove .git from clone (we'll re-init)
    fs.removeSync(path.join(targetDir, '.git'));
    success('Downloaded Strux CMS');
  } catch (e) {
    error('Failed to clone repository. Check your network connection.');
    error(e.message);
    process.exit(1);
  }

  // --- 2. Clean up non-essential files ---
  const cleanupFiles = [
    'website',
    'test-data',
    'scripts',
    '.kiro',
    '.vscode',
    '.turbo',
    'SETUP.md',
    'strux_cms_demo.postman_collection.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb'
  ];
  for (const f of cleanupFiles) {
    const fPath = path.join(targetDir, f);
    if (fs.existsSync(fPath)) {
      fs.removeSync(fPath);
    }
  }
  success('Cleaned up project files');

  // --- 2b. Reset .cms/ for fresh install ---
  const cmsDir = path.join(targetDir, '.cms');
  const cmsCleanup = [
    'users',           // directory — stale user accounts
    'config.json',     // will be auto-generated with fresh JWT secret on first boot
    'rbac.json',       // will be auto-generated with default roles on first boot
    'media.json',      // no media in a fresh project
    'metadata.json',   // no metadata in a fresh project
    'config',          // config subdirectory
  ];
  for (const item of cmsCleanup) {
    const itemPath = path.join(cmsDir, item);
    if (fs.existsSync(itemPath)) {
      fs.removeSync(itemPath);
    }
  }
  // Ensure the .cms directory itself and .gitkeep still exist
  fs.ensureDirSync(cmsDir);
  const gitkeepPath = path.join(cmsDir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '# CMS system directory — managed automatically\n');
  }
  success('Reset .cms/ for fresh install');

  // --- 3. Write schemas ---
  const schemas = STARTER_SCHEMAS[template] || [];
  const schemaDir = path.join(targetDir, 'schema');

  // Clear existing schemas unless the template is empty
  if (template !== 'empty') {
    const existingSchemas = fs.readdirSync(schemaDir).filter(f => f.endsWith('.schema.json'));
    for (const s of existingSchemas) {
      fs.removeSync(path.join(schemaDir, s));
    }
  }

  for (const schema of schemas) {
    fs.writeJsonSync(path.join(schemaDir, schema.file), schema.content, { spaces: 2 });
  }
  success(`Written ${schemas.length} schema${schemas.length !== 1 ? 's' : ''}`);

  // --- 4. Write sample content ---
  const contentDir = path.join(targetDir, 'content', 'api');
  // Clear existing content
  if (fs.existsSync(contentDir)) {
    fs.removeSync(contentDir);
  }
  fs.ensureDirSync(contentDir);

  if (template === 'blog' && SAMPLE_CONTENT.blog) {
    const sample = SAMPLE_CONTENT.blog;
    const entryDir = path.join(contentDir, sample.dir);
    fs.ensureDirSync(entryDir);
    for (const entry of sample.entries) {
      const id = generateId();
      const fullEntry = {
        id,
        ...entry,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      fs.writeJsonSync(path.join(entryDir, `${id}.json`), fullEntry, { spaces: 2 });
    }
    success('Created sample content');
  }

  // --- 5. Update package.json ---
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = fs.readJsonSync(pkgPath);
  pkg.name = projectName;
  pkg.version = '0.1.0';
  pkg.private = true;
  fs.writeJsonSync(pkgPath, pkg, { spaces: 2 });
  success('Updated package.json');

  // --- 6. Create .env ---
  const envContent = [
    '# Strux CMS Environment Variables',
    `JWT_SECRET=${generateId()}${generateId()}${generateId()}`,
    'PORT=3000',
    'NODE_ENV=development',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(targetDir, '.env'), envContent);
  success('Generated .env with JWT secret');

  // --- 7. Initialize Git ---
  if (initGit && isGitInstalled()) {
    try {
      execSync('git init', { cwd: targetDir, stdio: 'pipe' });
      execSync('git add -A', { cwd: targetDir, stdio: 'pipe' });
      execSync('git commit -m "Initial commit: Strux CMS project"', {
        cwd: targetDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Strux CLI',
          GIT_AUTHOR_EMAIL: 'cli@strux.dev',
          GIT_COMMITTER_NAME: 'Strux CLI',
          GIT_COMMITTER_EMAIL: 'cli@strux.dev'
        }
      });
      success('Initialized Git repository');
    } catch {
      warn('Git init succeeded but initial commit failed (configure git user first)');
    }
  }

  // --- 8. Install dependencies ---
  if (installDeps) {
    info('Installing dependencies (this may take a minute)...');
    try {
      const pmCmd = detectPackageManager();

      // Fix workspace:* protocol for non-pnpm package managers
      if (pmCmd !== 'pnpm') {
        const packagesDir = path.join(targetDir, 'packages');
        if (fs.existsSync(packagesDir)) {
          const pkgs = fs.readdirSync(packagesDir);
          for (const pkgName of pkgs) {
            const pkgPath = path.join(packagesDir, pkgName, 'package.json');
            if (fs.existsSync(pkgPath)) {
              let content = fs.readFileSync(pkgPath, 'utf8');
              content = content.replace(/"workspace:\*"/g, '"*"');
              fs.writeFileSync(pkgPath, content, 'utf8');
            }
          }
        }
      }

      const installArgs = pmCmd === 'npm' ? ' --legacy-peer-deps' : '';
      execSync(`${pmCmd} install${installArgs}`, {
        cwd: targetDir,
        stdio: 'inherit'
      });
      
      info('Building packages (compiling TypeScript)...');
      execSync(`${pmCmd} run build`, {
        cwd: targetDir,
        stdio: 'inherit'
      });
      
      success('Dependencies installed and packages built');
    } catch {
      warn('Dependency installation failed. Run manual installation (e.g. "npm install").');
    }
  }

  // --- Done! ---
  log('');
  log(kleur.green().bold('  🎉 Your Strux project is ready!'));
  log('');
  log(`  ${kleur.gray('$')} ${kleur.cyan(`cd ${projectName}`)}`);
  if (!installDeps) {
    log(`  ${kleur.gray('$')} ${kleur.cyan('pnpm install')}`);
  }
  log(`  ${kleur.gray('$')} ${kleur.cyan('pnpm dev')}`);
  log('');
  log(`  ${kleur.gray('Admin panel:')}  ${kleur.underline('http://localhost:3001')}`);
  log(`  ${kleur.gray('API server:')}   ${kleur.underline('http://localhost:3000')}`);
  log('');
  log(`  ${kleur.yellow('→')} On first launch, the admin panel will guide you through`);
  log(`    creating your administrator account.`);
  log('');
  log(`  ${kleur.gray('Docs:')}  ${kleur.underline('https://github.com/wahidzzz/strux-cms')}`);
  log('');
}

function detectPackageManager() {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
}

main().catch(err => {
  error(err.message);
  process.exit(1);
});
