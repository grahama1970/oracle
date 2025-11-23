#!/usr/bin/env tsx
/**
 * Attach-mode Copilot smoke: use an already-open classic Copilot tab via DevTools WS.
 * Steps:
 *  - reach: verify textarea/model/send exist
 *  - model: (optional) open model picker and log availability
 *  - paste: set textarea to PROMPT
 *  - send: click send button
 *  - complete: wait for assistant text to appear (classic chat)
 *  - extract: capture assistant text/HTML to stdout
 *
 * Usage:
 *   TARGET_WS_URL="ws://127.0.0.1:9222/devtools/page/<id>" PROMPT="text" pnpm tsx scripts/debug/attach-smoke.ts
 *   REUSE_CHAT=1 keeps the run inside an already-open /copilot/c/<id> thread instead of creating a new chat
 */

import WebSocket from 'ws';
import { readFile } from 'node:fs/promises';

const wsUrl = process.env.TARGET_WS_URL;
if (!wsUrl) {
  console.error('TARGET_WS_URL is required (e.g., ws://127.0.0.1:9222/devtools/page/<id>)');
  process.exit(1);
}
const promptEnv = process.env.PROMPT;
const promptFile = process.env.PROMPT_FILE;
const reuseChat = process.env.REUSE_CHAT === '1';

async function getPrompt(): Promise<string> {
  if (promptEnv) return promptEnv;
  if (promptFile) return readFile(promptFile, 'utf8');
  return 'Hello from attach-smoke';
}

type Ctx = { id: number; origin: string; isDefault: boolean };

async function attach() {
  const socket = new WebSocket(wsUrl);
  const send = (id: number, method: string, params: any = {}) =>
    socket.send(JSON.stringify({ id, method, params }));

  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  send(1, 'Runtime.enable');
  const contexts: Ctx[] = [];
  socket.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.executionContextCreated') {
      const ctx = msg.params.context;
      contexts.push({ id: ctx.id, origin: ctx.origin, isDefault: !!ctx.auxData?.isDefault });
    }
  });
  await new Promise((r) => setTimeout(r, 500));
  const ctx = contexts.find((c) => c.isDefault && c.origin?.startsWith('https://github.com'));
  if (!ctx) throw new Error('No default github.com context found');
  return { socket, send, ctxId: ctx.id };
}

async function evalInContext(send: Function, socket: WebSocket, ctxId: number, expr: string, evalId = 50) {
  return new Promise<any>((resolve, reject) => {
    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === evalId) {
        socket.off('message', handler);
        resolve(msg.result?.result?.value);
      }
    };
    socket.on('message', handler);
    send(evalId, 'Runtime.evaluate', { expression: expr, returnByValue: true, contextId: ctxId });
    setTimeout(() => {
      socket.off('message', handler);
      reject(new Error('Eval timeout'));
    }, 3000);
  });
}

async function main() {
  const prompt = await getPrompt();
  const { socket, send, ctxId } = await attach();

  // If we are in "reuse" mode, ensure we're on a chat page; otherwise allow the default /copilot home.
  const loc = await evalInContext(send, socket, ctxId, 'location.href', 24);
  console.log('location:', loc);
  if (reuseChat) {
    if (!/\/copilot\/c\//.test(loc)) {
      throw new Error('REUSE_CHAT=1 but location is not a chat thread (/copilot/c/...). Open a chat tab and retry.');
    }
  }

  const reachJs = `
    (() => {
      const btn = document.querySelector('button svg.octicon-paper-airplane')?.closest('button');
      return {
        textarea: !!document.querySelector('#copilot-chat-textarea'),
        model: !!document.querySelector('button[data-testid="model-switcher-dropdown-button"], button.ModelPicker-module__menuButton--w_ML2'),
        send: !!btn,
        sendDisabled: btn ? btn.disabled : null,
      };
    })();
  `;
  const reach = await evalInContext(send, socket, ctxId, reachJs, 2);
  console.log('reach:', reach);

  // Baseline latest assistant text before we send a new prompt
  const latestAssistantJs = `
    (() => {
      const nodes = Array.from(document.querySelectorAll('.markdown-body[data-copilot-markdown=\"true\"], [data-message-author-role=\"assistant\"] .markdown-body'));
      if (!nodes.length) return '';
      return (nodes[nodes.length - 1] as HTMLElement).innerText || '';
    })();
  `;
  const baseline = await evalInContext(send, socket, ctxId, latestAssistantJs, 25);
  console.log('baseline length:', (baseline as string)?.length || 0);
  const baselineLiteral = JSON.stringify((baseline as string) || '');
  const baselineCount = await evalInContext(
    send,
    socket,
    ctxId,
    `
      (() => document.querySelectorAll('.markdown-body[data-copilot-markdown="true"], [data-message-author-role="assistant"] .markdown-body').length)();
    `,
    26,
  ) as number;
  console.log('baseline count:', baselineCount);

  // Optional: click model picker just to prove we can interact (skip in reuse mode to avoid changing model mid-thread).
  const modelClickJs = `
    (() => {
      const btn = document.querySelector('button[data-testid="model-switcher-dropdown-button"], button.ModelPicker-module__menuButton--w_ML2');
      if (!btn) return { clicked: false, found: false };
      if (${reuseChat ? 'true' : 'false'}) return { clicked: false, found: true, skipped: true };
      btn.click();
      return { clicked: true, found: true };
    })();
  `;
  const modelClick = await evalInContext(send, socket, ctxId, modelClickJs, 3);
  console.log('modelClick:', modelClick);

  const pasteSendJs = `
    (() => {
      const area = document.querySelector('#copilot-chat-textarea');
      const btn = document.querySelector('button svg.octicon-paper-airplane')?.closest('button');
      const ok = { textarea: !!area, send: !!btn };
      if (area) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(area, ${JSON.stringify(prompt)});
        else area.value = ${JSON.stringify(prompt)};
        const InputEvt = window.InputEvent || Event;
        area.dispatchEvent(new InputEvt('input', { bubbles: true, data: ${JSON.stringify(prompt)}, inputType: 'insertText' }));
        // Also simulate Enter to trigger submit paths that listen to key events.
        const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
        area.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        area.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
      }
      if (btn) { btn.click(); ok.clicked = true; }
      const form = area?.closest('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        ok.submitted = true;
      }
      return ok;
    })();
  `;
  const sent = await evalInContext(send, socket, ctxId, pasteSendJs, 4);
  console.log('paste+send:', sent);
  const afterVal = await evalInContext(
    send,
    socket,
    ctxId,
    `(() => {
      const area = document.querySelector('#copilot-chat-textarea');
      const btn = document.querySelector('button svg.octicon-paper-airplane')?.closest('button');
      return { value: area ? area.value : '', sendDisabled: btn ? btn.disabled : null };
    })();`,
    41,
  );
  console.log('after send state:', afterVal);

  // Wait for completion with icon back to paper-airplane as the primary signal,
  // plus stability/send readiness as secondary signals (idle >=3s or send enabled) up to 90s.
  const waitForAssistant = async () => {
    const waitJs = `
      (() => {
        const nodes = Array.from(document.querySelectorAll('.markdown-body[data-copilot-markdown="true"], [data-message-author-role=\"assistant\"] .markdown-body'));
        const btn = document.querySelector('button svg.octicon-paper-airplane')?.closest('button');
        const sendSvg = btn ? btn.querySelector('svg') : document.querySelector('svg.octicon-paper-airplane, svg.octicon-stop');
        const sendPath = sendSvg?.querySelector('path');
        return {
          found: nodes.length > 0,
          count: nodes.length,
          text: nodes.length ? nodes[nodes.length - 1].innerText : '',
          sendDisabled: btn ? btn.disabled : null,
          iconClass: sendSvg?.className?.baseVal || sendSvg?.className || '',
          iconD: sendPath?.getAttribute('d') || '',
        };
      })();
    `;

    let lastText = baseline as string;
    let lastCount = baselineCount || 0;
    let lastIcon = '';
    let stableCycles = 0;
    const maxMs = 90_000;
    const start = Date.now();

    for (let i = 0; Date.now() - start < maxMs; i++) {
      const resp = await evalInContext(send, socket, ctxId, waitJs, 100 + i);
      const { text, count, sendDisabled, iconClass, iconD } = resp ?? {};
      const iconKey = `${iconClass || ''}|${iconD || ''}`;
      const changed = text !== lastText || count !== lastCount || iconKey !== lastIcon;
      if (changed) {
        lastText = text;
        lastCount = count;
        lastIcon = iconKey;
        stableCycles = 0;
      } else {
        stableCycles += 1;
      }
      const idleEnough = stableCycles >= 3; // ~3s of no change
      const sendReady = sendDisabled === false || sendDisabled === null;
      const iconPaper =
        (iconClass && iconClass.includes('octicon-paper-airplane')) ||
        (iconD && iconD.includes('M.989 8 .064 2.68')); // paper-airplane path prefix
      if (resp?.found && text) {
        if (iconPaper) return { text, count, completionPath: 'icon_ready', iconClass, iconD };
        if (idleEnough) return { text, count, completionPath: 'stable_idle', iconClass, iconD };
        if (sendReady) return { text, count, completionPath: 'send_ready', iconClass, iconD };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { text: lastText, count: lastCount, completionPath: 'timeout', iconClass: lastIcon };
  };

  const completion = await waitForAssistant();
  const assistantText = completion.text || '';
  console.log('assistant:', { hasText: !!assistantText, length: assistantText.length, completionPath: completion.completionPath, count: completion.count });
  if (assistantText) {
    console.log('--- assistant text ---');
    console.log(assistantText);
  } else {
    console.error('No assistant text captured after waiting.');
  }

  // Simple structured parse: choose best diff fence and keep the rest as clarifying/answers
  const parseDiff = (text: string) => {
    const fenceRe = /```([\\s\\S]*?)```/g;
    let m: RegExpExecArray | null;
    const blocks: { body: string; score: number }[] = [];
    while ((m = fenceRe.exec(text))) {
      const body = m[1].trim();
      const lower = body.toLowerCase();
      const score =
        (body.includes('diff --git') ? 4 : 0) +
        (/@@.+@@/s.test(body) ? 2 : 0) +
        (lower.startsWith('diff') ? 1 : 0) +
        (body.length > 200 ? 1 : 0);
      blocks.push({ body, score });
    }
    if (!blocks.length) return { diff: '', blocks: 0, reason: 'no_fenced_blocks', score: 0 };
    blocks.sort((a, b) => b.score - a.score);
    return { diff: blocks[0].body, blocks: blocks.length, reason: 'ok', score: blocks[0].score };
  };

  const diffRes = parseDiff(assistantText);
  const clarifying = diffRes.diff ? assistantText.replace(diffRes.diff, '').trim() : assistantText.trim();

  console.log('--- structured ---');
  console.log(
    JSON.stringify(
      {
        completionPath: completion.completionPath,
        assistantLength: assistantText.length,
        assistantCount: completion.count,
        diffBlocks: diffRes.blocks,
        diffScore: diffRes.score ?? 0,
        diffReason: diffRes.reason,
        diff: diffRes.diff,
        clarifying,
      },
      null,
      2,
    ),
  );

  const finalMeta = await evalInContext(
    send,
    socket,
    ctxId,
    `
      (() => {
        const nodes = Array.from(document.querySelectorAll('.markdown-body[data-copilot-markdown="true"], [data-message-author-role="assistant"] .markdown-body'));
        return { count: nodes.length, last: nodes.length ? nodes[nodes.length - 1].innerText : '' };
      })();
    `,
    200,
  );
  console.log('final assistant nodes:', finalMeta);

  socket.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
