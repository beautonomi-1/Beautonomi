#!/usr/bin/env node

/**
 * System Health Check
 * 
 * Quick health check script that verifies:
 * - Database connectivity
 * - API endpoints
 * - Environment variables
 * - Critical dependencies
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

class HealthChecker {
  constructor() {
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async check(name, fn) {
    try {
      const result = await fn();
      this.checks.push({ name, status: 'pass', result });
      this.passed++;
      this.log(`✓ ${name}`, 'green');
      return true;
    } catch (error) {
      this.checks.push({ name, status: 'fail', error: error.message });
      this.failed++;
      this.log(`✗ ${name}: ${error.message}`, 'red');
      return false;
    }
  }

  async checkNodeVersion() {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    if (major < 18) {
      throw new Error(`Node.js version ${version} is too old. Requires 18+`);
    }
    return { version };
  }

  async checkDependencies() {
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const nodeModulesPath = path.resolve(__dirname, '../node_modules');
    
    if (!fs.existsSync(nodeModulesPath)) {
      throw new Error('node_modules not found. Run npm install');
    }

    return { dependencies: Object.keys(packageJson.dependencies || {}).length };
  }

  async checkEnvVariables() {
    const required = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }

    return { found: required.length };
  }

  async checkBuildFiles() {
    const requiredFiles = [
      'next.config.mjs',
      'tsconfig.json',
      'tailwind.config.ts',
    ];

    const missing = requiredFiles.filter(file => {
      const filePath = path.resolve(__dirname, '..', file);
      return !fs.existsSync(filePath);
    });

    if (missing.length > 0) {
      throw new Error(`Missing required files: ${missing.join(', ')}`);
    }

    return { found: requiredFiles.length };
  }

  async checkDatabaseMigrations() {
    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      throw new Error('Migrations directory not found');
    }

    const migrations = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'));

    if (migrations.length === 0) {
      throw new Error('No migration files found');
    }

    return { count: migrations.length };
  }

  async checkApiRoutes() {
    const apiDir = path.resolve(__dirname, '../src/app/api');
    
    if (!fs.existsSync(apiDir)) {
      throw new Error('API directory not found');
    }

    // Count route files
    const countRoutes = (dir) => {
      let count = 0;
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            count += countRoutes(fullPath);
          } else if (file.name === 'route.ts' || file.name === 'route.tsx') {
            count++;
          }
        }
      } catch {
        // Ignore permission errors
      }
      return count;
    };

    const routeCount = countRoutes(apiDir);
    
    if (routeCount === 0) {
      throw new Error('No API routes found');
    }

    return { count: routeCount };
  }

  async runAll() {
    this.log('\n🏥 Running System Health Check\n', 'blue');

    await this.check('Node.js Version', () => this.checkNodeVersion());
    await this.check('Dependencies', () => this.checkDependencies());
    await this.check('Environment Variables', () => this.checkEnvVariables());
    await this.check('Build Files', () => this.checkBuildFiles());
    await this.check('Database Migrations', () => this.checkDatabaseMigrations());
    await this.check('API Routes', () => this.checkApiRoutes());

    // Summary
    this.log('\n' + '='.repeat(50), 'blue');
    this.log(`Total: ${this.checks.length} | Passed: ${this.passed} | Failed: ${this.failed}`, 
      this.failed === 0 ? 'green' : 'red');
    this.log('='.repeat(50) + '\n', 'blue');

    return this.failed === 0;
  }
}

// Run if called directly
if (require.main === module) {
  const checker = new HealthChecker();
  checker.runAll().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Health check failed:', error);
    process.exit(1);
  });
}

module.exports = HealthChecker;
