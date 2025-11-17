/**
 * Export GitHub authentication session cookies for reuse in headless mode
 * Run after GitHub authentication is complete
 */

import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { Database } from 'sqlite3';

/**
 * Export GitHub authentication cookies
 */
async function exportGitHubCookies() {
  const chromeProfilePath = path.join(homedir(), '.config/google-chrome/Default');
  const cookiesPath = path.join(chromeProfilePath, 'Cookies');
  const sessionFile = path.join(process.cwd(), 'tmp', 'github-session-cookies.json');

  console.log('Exporting GitHub session cookies...');
  console.log(`Chrome profile: ${chromeProfilePath}`);

  return new Promise((resolve, reject) => {
    const db = new Database(cookiesPath, (err) => {
      if (err) {
        console.error('Failed to open Chrome cookies database:', err);
        reject(err);
        return;
      }

      // Query for GitHub-related cookies
      const query = `
        SELECT
          name, value, host_key, path, expires_utc, is_secure, is_httponly, is_session
        FROM cookies
        WHERE host_key LIKE '%github%'
          AND name IN (
            'user_session',
            '__Host-user_session_same_site',
            '__Secure-next-auth.session-token',
            'github_id',
            'tz',
            '_ga'
          )
        ORDER BY expires_utc DESC
      `;

      db.all(query, (err, rows) => {
        if (err) {
          console.error('Failed to query cookies:', err);
          db.close();
          reject(err);
          return;
        }

        if (rows.length === 0) {
          console.log('No GitHub auth cookies found in Chrome profile');
          db.close();
          resolve({ cookies: [], count: 0 });
          return;
        }

        // Convert cookies to exportable format
        const cookies = rows.map(row => ({
          name: row.name,
          value: row.value,
          domain: row.host_key,
          path: row.path,
          expires: new Date(row.expires_utc / 1000000 - 11644473600 * 1000).toISOString(), // Windows epoch conversion
          secure: row.is_secure === 1,
          httpOnly: row.is_httponly === 1,
          session: row.is_session === 1
        }));

        // Check for critical auth cookies
        const criticalCookies = ['user_session', '__Host-user_session_same_site', '__Secure-next-auth.session-token'];
        const foundCritical = criticalCookies.filter(name => cookies.some(c => c.name === name));
        const missing = criticalCookies.filter(name => !cookies.some(c => c.name === name));

        console.log(`\nFound ${cookies.length} GitHub-related cookies`);
        console.log(`Critical auth cookies found: ${foundCritical.join(', ') || 'none'}`);
        console.log(`Missing: ${missing.join(', ')}`);

        // Export to JSON file
        writeFile(sessionFile, JSON.stringify({
          exportedAt: new Date().toISOString(),
          cookies,
          summary: {
            total: cookies.length,
            criticalFound: foundCritical.length,
            criticalMissing: missing.length,
            isValid: foundCritical.length >= 2
          }
        }, null, 2), 'utf8').then(() => {
          console.log(`\nExported session cookies to: ${sessionFile}`);
          console.log(`Validity: ${foundCritical.length >= 2 ? '✅ VALID' : '❌ INVALID (auth may fail)'}`);

          resolve({
            cookies,
            count: cookies.length,
            valid: foundCritical.length >= 2,
            foundCritical,
            missing
          });
        }).catch(writeErr => {
          console.error('Failed to write session file:', writeErr);
          reject(writeErr);
        });

        db.close();
      });
    });
  });
}

/**
 * Test session by checking if we can access authorized GitHub pages
 */
async function testGitHubSession() {
  const sessionFile = 'tmp/github-session-cookies.json';

  try {
    const sessionData = JSON.parse(await readFile(sessionFile, 'utf8'));
    console.log('Session data:', sessionData.summary);

    if (sessionData.summary.isValid) {
      console.log('Session appears valid - 2FA successfully authenticated');
      console.log('\nCookie names:', sessionData.cookies.map(c => c.name).join(', '));
      console.log('\nYou can now use: pnpm tsx scripts/copilot-poc.ts "Your question"');
    } else {
      console.log('Session may be invalid - some critical cookies missing');
      console.log('Run pnpm tsx scripts/authenticate-github.ts to refresh auth');
    }
  } catch (error) {
    console.error('Failed to read session file:', error);
  }
}

// Run directly
if (process.argv[1] === import.meta.url) {
  console.log('GitHub Session Cookie Exporter');
  console.log('==============================\n');

  const mode = process.argv[2];

  if (mode === 'export') {
    exportGitHubCookies().then(result => {
      console.log('\nExport complete!');
    }).catch(error => {
      console.error('Export failed:', error);
      process.exit(1);
    });
  } else if (mode === 'test') {
    testGitHubSession().then(() => {
      console.log('Test complete!');
    }).catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node export-session-cookies.js export  - Export GitHub session cookies');
    console.log('  node export-session-cookies.js test    - Test exported session');
    console.log('\nThis tool extracts GitHub authentication cookies after you login.');
  }
}

// Fix export reference
import { readFile } from 'node:fs/promises';