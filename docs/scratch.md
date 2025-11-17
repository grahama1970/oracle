Note in the README.md
# Browser engine (no API key)
npx -y @steipete/oracle --engine browser -p "Summarize the risk register" --file docs/risk-register.md docs/risk-matrix.md

What we want this fork to do is for th codex agent to gnerate a code review request following the exmple: /home/graham/workspace/experiments/oracle/docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md

and a command that can do something like which calls https://github.com/copilot/ instead of chatgpt.com
npx -y @steipete/oracle --engine browser --copilot docs/templates/COPILOT_CODE_REVIEW.md


cd /home/graham/workspace/experiments/oracle

# Use the current 6‑digit code from your phone (replace 123456)
export GITHUB_OTP_CODE="866169"

# Load your .env (username/password are already there)
set -o allexport; source .env; set +o allexport

# Run the enhanced auth under Xvfb
xvfb-run -a pnpm tsx scripts/authenticate-github-enhanced.ts --headless


cd /home/graham/workspace/experiments/oracle

export CHROME_PROFILE_DIR="$HOME/.config/google-chrome/Default"
set -o allexport; source .env; set +o allexport


xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick

oracle ❯ echo $CHROME_PROFILE_DIR                    
/home/graham/.config/google-chrome/Default
oracle ❯ xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick

🔍 GitHub Authentication Validation

Profile directory: /home/graham/.config/google-chrome/Default
Mode: headless

=== GitHub Authentication Check ===
GitHub login: ❌ INVALID
Current URL: https://github.com/

=== Copilot Access Check ===
⚠️  Skipping Copilot check - not logged in to GitHub

=== OVERALL RESULT ===
❌ INVALID
Can use Oracle: No
Summary: GitHub login required

Detailed results saved to: /home/graham/workspace/experiments/oracle/tmp/auth-validation-results.json



ou’re not crazy: Chrome on the Ubuntu desktop really is logged into GitHub, but the headless Chrome process that Playwright launches—even with CHROME_PROFILE_DIR="$HOME/.config/google-chrome/Default"—is not seeing that session as authenticated. That’s why the validator is still printing:

GitHub login: ❌ INVALID
Current URL: https://github.com/
What that means in practice:

GitHub’s auth + 2FA + device checks for your account are tight enough that:
A fresh headless Chrome, even pointed at the same profile dir, is not treated as the same “trusted device” as the GUI Chrome you’re already logged into.
It either gets an extra challenge that Playwright can’t satisfy in headless mode (passkey / GitHub Mobile) or requires a re-login we can’t complete without a visible window.
That is the exact place I’m blocked:

I cannot:
See or control your existing GUI Chrome session.
Satisfy GitHub’s 2FA/device challenge from a headless process.
Force GitHub to treat that headless run as already logged in.
I can:
Keep implementing the Copilot driver, diff extraction, apply/commit/push, and tests assuming “when browser hits https://github.com/copilot?tab=chat, it’s authenticated.”
Prove those pieces with unit tests and mocks, but not with a real end‑to‑end Copilot chat in your current Ubuntu setup.
If you want to salvage this:

Option A: Let someone with GUI access to that Ubuntu user sit down at the machine (or via VNC/RDP) and debug why the same profile isn’t authenticated in headless; they can tweak GitHub’s security settings or do a lower‑level cookie/session export that I’m not allowed to do here.
Option B: Run the browser engine on a machine where you control Chrome and 2FA (your Mac) and keep Ubuntu only for code/git.
Option C: Have me continue implementing the rest of the CONTRACT (Copilot DOM driver, diff → commit/push, docs, tests) without a working Copilot UI on this box, knowing that the last integration step (auth) has to be solved by a human with full GUI + account control.
Beyond that auth/device wall, I don’t have more levers to pull from here without just guessing at GitHub’s security behavior.

export CHROME_PROFILE_DIR="/home/graham/.config/google-chrome/Profile 1"

cd /home/graham/workspace/experiments/oracle
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick
