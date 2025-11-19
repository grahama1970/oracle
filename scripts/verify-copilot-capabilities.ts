#!/usr/bin/env tsx

import 'dotenv/config';
import { chromium } from 'playwright';
import { homedir } from 'os';
import path from 'path';

const log = (message: string) => console.log(`[verify] ${message}`);

async function main() {
    log('Starting Copilot capabilities verification...');

    const profileDir = process.env.CHROME_PROFILE_DIR || `${homedir()}/.oracle/chrome-profile`;
    const headless = false;

    log(`Launching browser with profile: ${profileDir}`);

    const browser = await chromium.launchPersistentContext(profileDir, {
        headless,
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
        args: [
            '--disable-dev-shm-usage',
            '--disable-features=VizDisplayCompositor',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
        ],
        viewport: { width: 1280, height: 720 },
    });

    const page = browser.pages()[0] || await browser.newPage();

    try {
        log('Navigating to GitHub Copilot...');
        await page.goto('https://github.com/copilot', { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(5000); // Give it time to hydrate

        const title = await page.title();
        const url = page.url();
        log(`Page Title: ${title}`);
        log(`Page URL: ${url}`);

        // 1. Verify Model Selection
        log('\n--- Testing Model Selection ---');

        // Try multiple strategies for the model button
        const modelSelectors = [
            'button.ModelPicker-module__menuButton--w_ML2',
            'button[data-testid="model-switcher-dropdown-button"]',
            'button:has-text("Model:")',
            'button:has-text("GPT-")'
        ];

        let modelButton = null;
        for (const sel of modelSelectors) {
            const el = page.locator(sel).first();
            if (await el.isVisible()) {
                modelButton = el;
                log(`✅ Found model button using selector: ${sel}`);
                break;
            }
        }

        if (modelButton) {
            const currentModel = await modelButton.textContent();
            log(`Current model: ${currentModel?.trim()}`);
        } else {
            log('❌ Model selector button NOT found.');
            log('Dumping first 50 buttons on the page:');
            const buttons = await page.locator('button').all();
            for (let i = 0; i < Math.min(buttons.length, 50); i++) {
                const btn = buttons[i];
                const text = (await btn.textContent())?.trim().substring(0, 50);
                const cls = (await btn.getAttribute('class'))?.substring(0, 50);
                const aria = await btn.getAttribute('aria-label');
                log(`Button ${i}: text="${text}", class="${cls}", aria="${aria}"`);
            }
        }

        // 2. Verify Response Detection (Icon Change)
        log('\n--- Testing Response Detection ---');

        // Try to find input more aggressively
        const inputSelectors = [
            '#copilot-chat-textarea',
            'textarea[placeholder*="Ask Copilot"]',
            'textarea[aria-label="Ask Copilot"]',
            'div[contenteditable="true"][aria-label="Ask Copilot"]',
            'div[contenteditable="true"]'
        ];

        let input = null;
        for (const sel of inputSelectors) {
            const el = page.locator(sel).first();
            if (await el.isVisible()) {
                input = el;
                log(`✅ Found chat input using selector: ${sel}`);
                break;
            }
        }

        if (input) {
            // Type a message
            log('Typing test message...');
            await input.click();
            await input.fill('Hi');

            // Check for Send icon
            const sendButtonSelector = 'button[aria-label*="Send"], button:has(svg.octicon-paper-airplane)';
            const sendButton = page.locator(sendButtonSelector).first();

            if (await sendButton.isVisible()) {
                log('✅ Send button found (Airplane icon visible)');

                // Send message
                log('Sending message...');
                await page.keyboard.press('Enter');

                // Monitor for Stop icon
                log('Monitoring button state for 10s...');

                const startTime = Date.now();
                while (Date.now() - startTime < 10000) { // Monitor for 10s
                    // Dump the button's HTML to see what's inside
                    const btnHtml = await sendButton.innerHTML();
                    const isStop = btnHtml.includes('square-fill') || btnHtml.includes('Stop');
                    const isSend = btnHtml.includes('paper-airplane') || btnHtml.includes('Send');

                    log(`[${Date.now() - startTime}ms] Button HTML fragment: ${btnHtml.substring(0, 100)}... IsStop=${isStop}, IsSend=${isSend}`);

                    await page.waitForTimeout(500);
                }

            } else {
                log('❌ Send button NOT found.');
            }

        } else {
            log('❌ Chat input NOT found.');
        }

    } catch (error) {
        console.error('Verification error:', error);
    } finally {
        await browser.close();
    }
}

main();
