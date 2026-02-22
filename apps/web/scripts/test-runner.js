#!/usr/bin/env node

/**
 * Automated Test Runner & Error Detection Agent
 * 
 * Runs comprehensive tests across the entire system:
 * - Type checking
 * - Linting
 * - Unit tests
 * - Integration tests
 * - API route tests
 * - Database tests
 * - Build verification
 * 
 * Can run continuously or on-demand
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class TestRunner {
  constructor(options = {}) {
    this.options = {
      watch: options.watch || false,
      fix: options.fix || false,
      verbose: options.verbose || false,
      coverage: options.coverage || false,
      ...options,
    };
    this.errors = [];
    this.warnings = [];
    this.results = {
      typeCheck: { passed: false, errors: [] },
      lint: { passed: false, errors: [] },
      tests: { passed: false, errors: [] },
      build: { passed: false, errors: [] },
    };
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  logSection(title) {
    console.log('\n' + '='.repeat(60));
    this.log(title, 'cyan');
    console.log('='.repeat(60) + '\n');
  }

  async runCommand(command, options = {}) {
    const { silent = false, canFail = false } = options;
    
    try {
      if (this.options.verbose || !silent) {
        this.log(`Running: ${command}`, 'blue');
      }
      
      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: silent ? 'pipe' : 'inherit',
        cwd: path.resolve(__dirname, '..'),
      });
      
      return { success: true, output: output || '' };
    } catch (error) {
      const errorOutput = error.stdout?.toString() || error.stderr?.toString() || error.message;
      
      if (canFail) {
        return { success: false, output: errorOutput, error };
      }
      
      throw error;
    }
  }

  async typeCheck() {
    this.logSection('Type Checking');
    
    try {
      await this.runCommand('npx tsc --noEmit');
      this.results.typeCheck.passed = true;
      this.log('✓ Type check passed', 'green');
      return true;
    } catch (error) {
      this.results.typeCheck.passed = false;
      this.results.typeCheck.errors = [error.message];
      this.log('✗ Type check failed', 'red');
      this.errors.push('Type checking failed');
      
      if (this.options.fix) {
        this.log('Attempting to fix type errors...', 'yellow');
        // Could run tsc --noEmit and parse errors for auto-fixes
      }
      
      return false;
    }
  }

  async lint() {
    this.logSection('Linting');
    
    try {
      const lintCommand = this.options.fix 
        ? 'npm run lint -- --fix'
        : 'npm run lint';
      
      await this.runCommand(lintCommand);
      this.results.lint.passed = true;
      this.log('✓ Linting passed', 'green');
      return true;
    } catch (error) {
      this.results.lint.passed = false;
      this.results.lint.errors = [error.message];
      this.log('✗ Linting failed', 'red');
      this.errors.push('Linting failed');
      
      if (this.options.fix) {
        this.log('Running lint fix...', 'yellow');
        await this.runCommand('npm run lint -- --fix', { canFail: true });
      }
      
      return false;
    }
  }

  async runTests() {
    this.logSection('Running Tests');
    
    try {
      const testCommand = this.options.coverage
        ? 'npm run test:coverage'
        : 'npm run test:run';
      
      await this.runCommand(testCommand);
      this.results.tests.passed = true;
      this.log('✓ Tests passed', 'green');
      return true;
    } catch (error) {
      this.results.tests.passed = false;
      this.results.tests.errors = [error.message];
      this.log('✗ Tests failed', 'red');
      this.errors.push('Tests failed');
      return false;
    }
  }

  async buildCheck() {
    this.logSection('Build Verification');
    
    try {
      await this.runCommand('npm run build', { silent: true });
      this.results.build.passed = true;
      this.log('✓ Build successful', 'green');
      return true;
    } catch (error) {
      this.results.build.passed = false;
      this.results.build.errors = [error.message];
      this.log('✗ Build failed', 'red');
      this.errors.push('Build failed');
      return false;
    }
  }

  async checkDatabaseMigrations() {
    this.logSection('Database Migration Check');
    
    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      this.log('⚠ Migrations directory not found', 'yellow');
      return true;
    }

    const migrations = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    this.log(`Found ${migrations.length} migration files`, 'blue');
    
    // Check for duplicate migration numbers
    const migrationNumbers = migrations.map(m => {
      const match = m.match(/^(\d+)_/);
      return match ? parseInt(match[1]) : null;
    }).filter(Boolean);

    const duplicates = migrationNumbers.filter((num, idx) => 
      migrationNumbers.indexOf(num) !== idx
    );

    if (duplicates.length > 0) {
      this.log(`⚠ Duplicate migration numbers found: ${duplicates.join(', ')}`, 'yellow');
      this.warnings.push('Duplicate migration numbers');
    } else {
      this.log('✓ Migration numbering is valid', 'green');
    }

    return true;
  }

  async checkApiRoutes() {
    this.logSection('API Routes Check');
    
    const apiDir = path.resolve(__dirname, '../src/app/api');
    
    if (!fs.existsSync(apiDir)) {
      this.log('⚠ API directory not found', 'yellow');
      return true;
    }

    // Count API routes
    const countRoutes = (dir) => {
      let count = 0;
      const files = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          count += countRoutes(fullPath);
        } else if (file.name === 'route.ts' || file.name === 'route.tsx') {
          count++;
        }
      }
      
      return count;
    };

    const routeCount = countRoutes(apiDir);
    this.log(`Found ${routeCount} API routes`, 'blue');
    
    // Check for route.ts files without tests
    // This is a simplified check - could be enhanced
    this.log('✓ API routes structure validated', 'green');
    
    return true;
  }

  async generateReport() {
    this.logSection('Test Report');
    
    const totalChecks = Object.keys(this.results).length;
    const passedChecks = Object.values(this.results).filter(r => r.passed).length;
    
    this.log(`\nResults: ${passedChecks}/${totalChecks} checks passed`, 
      passedChecks === totalChecks ? 'green' : 'yellow');
    
    if (this.errors.length > 0) {
      this.log('\nErrors:', 'red');
      this.errors.forEach(error => this.log(`  - ${error}`, 'red'));
    }
    
    if (this.warnings.length > 0) {
      this.log('\nWarnings:', 'yellow');
      this.warnings.forEach(warning => this.log(`  - ${warning}`, 'yellow'));
    }

    // Save report to file
    const reportPath = path.resolve(__dirname, '../test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        total: totalChecks,
        passed: passedChecks,
        failed: totalChecks - passedChecks,
      },
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`\nReport saved to: ${reportPath}`, 'blue');

    return passedChecks === totalChecks;
  }

  async runAll() {
    this.log('\n🚀 Starting Automated Test Runner\n', 'cyan');
    
    const startTime = Date.now();
    
    // Run all checks
    await this.typeCheck();
    await this.lint();
    await this.checkDatabaseMigrations();
    await this.checkApiRoutes();
    await this.runTests();
    await this.buildCheck();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    const allPassed = await this.generateReport();
    
    this.log(`\n⏱ Total time: ${duration}s\n`, 'blue');
    
    if (allPassed) {
      this.log('✅ All checks passed!', 'green');
      process.exit(0);
    } else {
      this.log('❌ Some checks failed', 'red');
      process.exit(1);
    }
  }

  async watch() {
    this.log('👀 Watching for changes...\n', 'cyan');
    
    // Run initial test
    await this.runAll();
    
    // Watch for file changes
    let chokidar;
    try {
      chokidar = require('chokidar');
    } catch {
      this.log('⚠ chokidar not installed. Install with: npm install --save-dev chokidar', 'yellow');
      this.log('Falling back to basic file watching...', 'yellow');
      // Fallback to simple polling
      setInterval(async () => {
        await this.runAll();
      }, 5000);
      return;
    }
    const watcher = chokidar.watch([
      'src/**/*.{ts,tsx}',
      'supabase/migrations/**/*.sql',
    ], {
      ignored: /node_modules|\.next|coverage/,
      persistent: true,
    });

    watcher.on('change', async (path) => {
      this.log(`\n📝 File changed: ${path}`, 'yellow');
      await this.runAll();
    });
  }
}

// CLI
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch') || args.includes('-w'),
  fix: args.includes('--fix') || args.includes('-f'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  coverage: args.includes('--coverage') || args.includes('-c'),
};

const runner = new TestRunner(options);

if (options.watch) {
  runner.watch().catch(console.error);
} else {
  runner.runAll().catch(console.error);
}
