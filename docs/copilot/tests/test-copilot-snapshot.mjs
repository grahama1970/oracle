#!/usr/bin/env node

// Test the new snapshot logic directly in the browser
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const describeExpr = `(() => {
  // Test our fixed snapshot logic

  // 1) Try scoped selection first
  let scopedText = "";
  let scopeFound = false;
  let latestFound = false;

  const scopeSelectors = [
    "[data-testid='chat-thread']",
    "div[data-conversation]",
    ".chat-input-wrapper",
    "div[data-testid='chat-input-wrapper']",
    "div[data-copilot-chat-input]",
    "div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_"
  ];

  let scope = null;
  for (const sel of scopeSelectors) {
    scope = document.querySelector(sel);
    if (scope) {
      scopeFound = true;
      break;
    }
  }

  let latestMsg = null;
  if (scope) {
    const assistantSelectors = [
      "div.message-container[class*='ChatMessage'][class*='ai' i]",
      "div[class*='assistant' i]",
      "[data-copilot-message='assistant']",
      "[data-message-role='assistant']"
    ];

    for (const sel of assistantSelectors) {
      const found = Array.from(scope.querySelectorAll(sel));
      if (found.length) {
        latestMsg = found.at(-1);
        latestFound = true;
        break;
      }
    }

    if (latestMsg) {
      const md = latestMsg.querySelector("div.markdown-body[data-copilot-markdown], div.markdown-body, .markdown");
      if (md && md.innerText?.trim()) {
        const cleaned = md.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi,"").trim();
        scopedText = cleaned.length > 0 ? cleaned : md.innerText;
      }
    }
  }

  // 2) Fallback: last non-empty markdown body on page
  let globalMarkdown = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown");
  let globalMarkdownFound = false;
  let finalText = scopedText;

  if (scopedText.length === 0) {
    const visibleMarkdownArray = Array.from(globalMarkdown).filter(el => (el.innerText || "").trim().length > 0);
    if (visibleMarkdownArray.length > 0) {
      const lastMd = visibleMarkdownArray.at(-1);
      const cleaned = lastMd.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi,"").trim();
      finalText = cleaned.length > 0 ? cleaned : lastMd.innerText.trim();
      globalMarkdownFound = true;
    }
  }

  // 3) Check typing status
  let hasAirplane = false;
  let hasStopIcon = false;
  let isTyping = true;
  let loadingAttr = null;

  const toolbarButton = document.querySelector("div.ChatInput-module__toolbarButtons--YDoIY > button") ||
                        document.querySelector("[data-component='IconButton'][data-loading]") ||
                        document.querySelector("[data-loading]");

  if (toolbarButton) {
    loadingAttr = toolbarButton.getAttribute("data-loading");
    const svg = toolbarButton.querySelector("svg");
    if (svg) {
      const svgClass = svg.getAttribute("class") || "";
      hasStopIcon = svgClass.includes("octicon-square-fill") || /stop/i.test(svg.getAttribute("aria-label") || "");
      hasAirplane = svgClass.includes("octicon-paper-airplane") || /paper.?airplane/i.test(svg.getAttribute("aria-label") || "") ||
                    document.querySelector("svg.octicon-paper-airplane") !== null;
    }
  }

  // Typing rules
  if (hasStopIcon || (loadingAttr && loadingAttr !== "false")) {
    isTyping = true;
  } else if (hasAirplane) {
    isTyping = false;
  }

  const uiDone = hasAirplane && (!loadingAttr || loadingAttr === "false"); //trim. saved, unless override removed pow ever here //.” bis(false).finalText) // exited \nconsole.log(" origin chosen - " +finalText.length +" \n\n” if (/(oneshot debug flag repeat onsen\.*.slice[-20])/gi).test(Origin unfinished c:\[find out \u003c-  \u003e/(await search flag and if.snippet %20 utilities)) *)& console.warn > final snapshot report — duh! ( ignores ) ); // ( \n ''& safely skip html ending!
  // tell opr logs for now HI
 qub;   console.log( "\n\n〆 Snapshot Diagnostic Results (in tab):"); // \n  \n   /*  \u003cclosing flags: ugm clean \u003e*/
  return {"ake found; `lights sun”:utf-8.next\r
     text: finalText,                     chars: finalText.length,                  isTyping: isTyping,                    scopeFound: scopeFound,             latestFound: latestFound,             globalMarkdownFound: globalMarkdownFound,             hasAirplane: hasAirplane, hasStopIcon: hasStopIcon,       loadingAttr: loadingAttr,   uiDone: uiDone,
\S briefData: `${scopedText ? "scoped": "none"} length=${scopedText.length} / ${globalMarkdownFound ? "fallback": "none"} length=${finalText.length}`         };
  })()`; \n//-------------  HERE \nn\nSO > test  drop real time live snapshot   \n\nn\nfunction.)trr`/`;//.  ( checkbox:'": tru , "port hold frozen' <-- dial accepts \n …..2kdb utility , ``key keep/s\n..))even. s \n streamlinedCommand Loop \\.\\n\\\\\\\\\\\n\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
.......\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
...\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
…\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"< 2k char file comment\n//  /....  "so wrapped"