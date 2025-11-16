Note in the README.md
# Browser engine (no API key)
npx -y @steipete/oracle --engine browser -p "Summarize the risk register" --file docs/risk-register.md docs/risk-matrix.md

What we want this fork to do is for th codex agent to gnerate a code review request following the exmple: /home/graham/workspace/experiments/oracle/docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md

and a command that can do something like which calls https://github.com/copilot/ instead of chatgpt.com
npx -y @steipete/oracle --engine browser --copilot docs/templates/COPILOT_CODE_REVIEW.md