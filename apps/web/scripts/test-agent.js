#!/usr/bin/env node

/**
 * Automated Test Agent
 * 
 * Continuously monitors and tests the system:
 * - Runs tests periodically
 * - Detects errors
 * - Attempts automatic fixes
 * - Generates reports
 * - Monitors system health
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestAgent {
  constructor(config = {}) {
    this.config = {
      interval: config.interval || 300000, // 5 minutes default
      autoFix: config.autoFix !== false,
      maxRetries: config.maxRetries || 3,
      logFile: config.logFile || path.resolve(__dirname, '../test-agent.log'),
      ...config,
    };
    this.isRunning = false;
    this.runCount = 0;
    this.errorCount = 0;
    this.lastRun = null;
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    
    // Console output
    console.log(logMessage.trim());
    
    // File output
    fs.appendFileSync(this.config.logFile, logMessage);
  }

  async runTests() {
    this.runCount++;
    this.log(`Starting test run #${this.runCount}`);
    
    return new Promise((resolve) => {
      const testProcess = spawn('node', [
        path.resolve(__dirname, 'test-runner.js'),
        '--verbose',
        this.config.autoFix ? '--fix' : '',
      ].filter(Boolean), {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe',
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      testProcess.on('close', (code) => {
        this.lastRun = new Date();
        
        if (code === 0) {
          this.log('Tests passed successfully', 'success');
          resolve({ success: true, output, errorOutput });
        } else {
          this.errorCount++;
          this.log(`Tests failed with code ${code}`, 'error');
          this.log(`Error output: ${errorOutput}`, 'error');
          
          if (this.config.autoFix && this.errorCount < this.config.maxRetries) {
            this.log('Attempting automatic fixes...', 'warn');
            this.attemptFixes(errorOutput);
          }
          
          resolve({ success: false, output, errorOutput, code });
        }
      });
    });
  }

  attemptFixes(errorOutput) {
    // Parse common errors and attempt fixes
    
    // Type errors
    if (errorOutput.includes('Type error') || errorOutput.includes('TS')) {
      this.log('Detected type errors, running type check fix...', 'info');
      this.runCommand('npx tsc --noEmit');
    }
    
    // Lint errors
    if (errorOutput.includes('ESLint') || errorOutput.includes('lint')) {
      this.log('Detected lint errors, running auto-fix...', 'info');
      this.runCommand('npm run lint -- --fix');
    }
    
    // Missing dependencies
    if (errorOutput.includes('Cannot find module') || errorOutput.includes('Module not found')) {
      this.log('Detected missing dependencies, installing...', 'info');
      this.runCommand('npm install');
    }
  }

  runCommand(command) {
    const { execSync } = require('child_process');
    try {
      execSync(command, {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
      });
      this.log(`Successfully ran: ${command}`, 'success');
    } catch {
      this.log(`Failed to run: ${command}`, 'error');
    }
  }

  async start() {
    if (this.isRunning) {
      this.log('Agent is already running', 'warn');
      return;
    }

    this.isRunning = true;
    this.log('🚀 Test Agent started');
    this.log(`Configuration: ${JSON.stringify(this.config, null, 2)}`);

    // Initial run
    await this.runTests();

    // Schedule periodic runs
    this.scheduleNextRun();
  }

  scheduleNextRun() {
    if (!this.isRunning) return;

    setTimeout(async () => {
      await this.runTests();
      this.scheduleNextRun();
    }, this.config.interval);
  }

  stop() {
    this.log('🛑 Stopping Test Agent');
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      runCount: this.runCount,
      errorCount: this.errorCount,
      lastRun: this.lastRun,
      config: this.config,
    };
  }
}

// CLI
if (require.main === module) {
  const agent = new TestAgent({
    interval: process.env.TEST_INTERVAL ? parseInt(process.env.TEST_INTERVAL) : 300000,
    autoFix: process.env.AUTO_FIX !== 'false',
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    agent.stop();
    process.exit(0);
  });

  agent.start();

  // Status endpoint (if running as service)
  if (process.env.STATUS_PORT) {
    const http = require('http');
    const server = http.createServer((req, res) => {
      if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(agent.getStatus(), null, 2));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(process.env.STATUS_PORT);
  }
}

module.exports = TestAgent;
