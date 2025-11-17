#!/usr/bin/env tsx

/**
 * Enhanced GitHub authentication validation script
 * Checks session validity and ensures Copilot chat is accessible
 */

import 'dotenv/config';
import { chromium, Browser, Page } from 'playwright';
import { homedir } from 'os';
import path from 'path';
import { promises as fs } from 'fs';

interface ValidationOptions {
  profileDir?: string;
  headless?: boolean;
  timeout?: number;
  quick?: boolean;
}

const log = (message: string) => console.log(`[validate] ${message}`);

/**
 * Enhanced GitHub authentication validation
 */
async function validateAuthEnhanced(options: ValidationOptions = {}) {
  const {
    profileDir = options.profileDir || process.env.CHROME_PROFILE_DIR || `${homedir()}/.oracle/chrome-profile`,
    headless = false,
    timeout = 30000,
    quick = false
  } = options;

  console.log('\n🔍 GitHub Authentication Validation\n');
  console.log(`Profile directory: ${profileDir}`);
  console.log(`Mode: ${headless ? 'headless' : 'headful'}`);

  let browser;
  try {
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: headless,
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      args: [
        '--disable-dev-shm-usage',
        '--disable-features=VizDisplayCompositor',
        '--no-first-run',
        '--no-default-browser-check',
        ...(headless ? ['--headless=new'] : []),
      ],
      viewport: { width: 1280, height: 720 }
    });

    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(timeout);

    const results: any = {
      timestamp: new Date().toISOString(),
      profile: profileDir,
      checks: {}
    };

    // Check 1: GitHub authentication
    console.log('\n=== GitHub Authentication Check ===');
    // Avoid "networkidle" here; GitHub keeps long‑lived connections open
    // which can cause unnecessary timeouts even when the page is ready.
    await page.goto('https://github.com', {
      waitUntil: 'load',
      timeout
    });

    const isLoggedIn = await page.evaluate(() => {
      // Heuristic checks for an authenticated GitHub session.
      const avatarSelector =
        'summary[aria-label="View profile and more"], ' +
        'button[aria-label="View profile and more"], ' +
        'img.avatar-user, ' +
        '.Header-link img[alt*="profile"]';

      const signOutLink =
        document.querySelector('[data-analytics-title="Sign out"]') ||
        document.querySelector('a[href="/logout"]');

      const avatar = document.querySelector(avatarSelector);
      const octolyticsActor = document.querySelector('meta[name="octolytics-actor"]');

      return !!(avatar || signOutLink || octolyticsActor);
    });

    results.checks.github = {
      authenticated: isLoggedIn,
      url: page.url(),
      evidence: isLoggedIn ? 'Found sign-out link or profile indicators' : 'No authentication indicators found',
      status: isLoggedIn ? '✅ VALID' : '❌ INVALID'
    };

    console.log(`GitHub login: ${results.checks.github.status}`);
    console.log(`Current URL: ${results.checks.github.url}`);

    // Check 2: Copilot access
    console.log('\n=== Copilot Access Check ===');

    if (!isLoggedIn) {
      console.log('⚠️  Skipping Copilot check - not logged in to GitHub');
      results.checks.copilot = {
        accessible: false,
        reason: 'GitHub authentication required first'
      };
    } else {
      await page.goto('https://github.com/copilot?tab=chat', {
        // Same reasoning as above: "load" is sufficient and avoids
        // spurious timeouts from background network activity.
        waitUntil: 'load',
        timeout
      });

      const copilotResult = await page.evaluate(() => {
        const selectors = {
          chatInput: [
            'textarea[placeholder*="Ask Copilot"]',
            'textarea[data-qa*="copilot"]',
            'textarea[name="message"]',
            'div[contenteditable="true"][role="textbox"]',
            'input[data-testid*="copilot"]'
          ],
          loginPrompt: ['a[href*="signup"]', 'a[href*="signin"]', 'a[href*="login"]'],
          marketing: ['a[href*="pricing"]', '[data-testid*="marketing"]'],
          authWall: ['document.title.toLowerCase().includes("sign in")', 'button:has-text("Sign in to GitHub")']
        };

        const hasChatInput = selectors.chatInput.some(s => document.querySelector(s));
        const hasLoginPrompt = selectors.loginPrompt.some(s => document.querySelector(s));
        const hasMarketing = selectors.marketing.some(s => document.querySelector(s));

        const pageTitle = document.title;
        const currentUrl = window.location.href;
        const bodyText = document.body.textContent || ''.toLowerCase();
        const hasSignInPrompt = bodyText.includes('sign in') || bodyText.includes('log in');

        return {
          hasChatInput,
          hasLoginPrompt,
          hasMarketing,
          hasSignInPrompt,
          pageTitle,
          currentUrl,
          isMarketingPage: hasMarketing && !hasChatInput,
          isAuthWall: hasLoginPrompt,
          isChatAvailable: hasChatInput && !hasLoginPrompt && !hasSignInPrompt
        };
      });

      const copilotAccessibleHeuristic =
        !copilotResult.isMarketingPage &&
        !copilotResult.isAuthWall &&
        copilotResult.currentUrl.includes('/copilot') &&
        /Copilot/i.test(copilotResult.pageTitle);

      results.checks.copilot = {
        accessible: copilotResult.isChatAvailable || copilotAccessibleHeuristic,
        hasChatInput: copilotResult.hasChatInput,
        isMarketingPage: copilotResult.isMarketingPage,
        isAuthWall: copilotResult.isAuthWall,
        pageTitle: copilotResult.pageTitle,
        url: copilotResult.currentUrl,
        status: (copilotResult.isChatAvailable || copilotAccessibleHeuristic) ? '✅ CHAT READY' :
                copilotResult.isAuthWall ? '❌ AUTH WALL' :
                copilotResult.isMarketingPage ? '❌ MARKETING PAGE' : '⚠️ UNKNOWN'
      };

      console.log(`Copilot access: ${results.checks.copilot.status}`);
      console.log(`Page title: ${results.checks.copilot.pageTitle}`);
      console.log(`Chat input found: ${copilotResult.hasChatInput ? 'Yes' : 'No'}`);

      if (copilotResult.isChatAvailable) {
        // Extra check: is the input field interactive?
        const inputInteractive = await page.evaluate(() => {
          const input = document.querySelector('textarea[placeholder*="Ask Copilot"], textarea[data-qa*="copilot"], textarea[name="message"]');
          if (!input) return false;

          const rect = (input as HTMLElement).getBoundingClientRect();
          const computedStyle = window.getComputedStyle(input);

          return {
            visible: rect.width > 0 && rect.height > 0,
            notDisabled: !input.hasAttribute('disabled'),
            hasProperSize: rect.width >= 200 && rect.height >= 40,
            interactive: rect.width > 0 && rect.height > 0 && !input.hasAttribute('disabled')
          };
        });

        results.checks.copilot.inputInteractive = inputInteractive;
        console.log(`Chat input interactive: ${inputInteractive.interactive ? 'Yes' : 'No'}`);
      }
    }

    // Check 3: Session persistence marker
    if (!quick) {
      console.log('\n=== Session Persistence ===');

      const authMarkerFile = path.join(profileDir, '.auth-ok');
      let authMarkerExists = false;
      let authMarkerDate: string | null = null;

      try {
        const markerContent = await fs.readFile(authMarkerFile, 'utf8');
        authMarkerExists = true;
        authMarkerDate = markerContent.trim();
        const markerAge = Date.now() - new Date(authMarkerDate).getTime();
        const daysOld = markerAge / (1000 * 60 * 60 * 24);

        results.checks.session = {
          markerExists: true,
          lastAuth: authMarkerDate,
          daysOld: Math.round(daysOld * 10) / 10,
          status: daysOld < 30 ? '✅ RECENT' : daysOld < 90 ? '⚠️ STALE' : '❌ EXPIRED'
        };

        console.log(`Auth marker: ${results.checks.session.status}`);
        console.log(`Last authenticated: ${authMarkerDate} (${daysOld} days ago)`);
      } catch {
        results.checks.session = {
          markerExists: false,
          status: '❌ NOT FOUND'
        };
        console.log('Auth marker: Not found (run authentication script again)');
      }
    }

    // Overall results
    const overallOk = results.checks.github.authenticated &&
                      results.checks.copilot.accessible &&
                      (!results.checks.session || results.checks.session.markerExists);

    results.status = {
      overall: overallOk ? '✅ VALID' : '❌ INVALID',
      canUseOracle: results.checks.github.authenticated && results.checks.copilot.accessible,
      summary: overallOk ? 'Ready for Oracle automation' :
               !results.checks.github.authenticated ? 'GitHub login required' :
               !results.checks.copilot.accessible ? 'Copilot access issue (may need manual login)' :
               'Session marker missing (run auth script)'
    };

    console.log('\n=== OVERALL RESULT ===');
    console.log(results.status.overall);
    console.log(`Can use Oracle: ${results.status.canUseOracle ? 'Yes' : 'No'}`);
    console.log(`Summary: ${results.status.summary}`);

    return results;

  } catch (error) {
    console.error('Validation error:', error);
    return {
      error: error.message,
      status: { overall: 'ERROR', summary: 'Validation failed' }
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * CLI wrapper
 */
async function main() {
  const args = process.argv.slice(2);

  const options: ValidationOptions = {
    profileDir: args.find(arg => arg.startsWith('--profile='))?.split('=')[1] || undefined,
    headless: args.includes('--headless'),
    quick: args.includes('--quick')
  };

  const results = await validateAuthEnhanced(options);

  // Save results to file for CI/CD
  try {
    const resultsFile = path.join(process.cwd(), 'tmp', 'auth-validation-results.json');
    await fs.mkdir(path.dirname(resultsFile), { recursive: true });
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\nDetailed results saved to: ${resultsFile}`);
  } catch {}

  // Exit code based on overall status
  const exitCode = results?.status?.overall === '✅ VALID' ? 0 : 1;
  process.exit(exitCode);
}

// Run if called directly (Node ESM entrypoint)
if (process.argv[1] && process.argv[1].endsWith('validate-auth-enhanced.ts')) {
  main().catch(error => {
    console.error('Validation script error:', error);
    process.exit(1);
  });
}

export { validateAuthEnhanced };
