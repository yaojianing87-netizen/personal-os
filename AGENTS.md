# Instructions for the coding agent

## Personal OS: ongoing development workflow

- After completing each requested code change, check for errors and run the validation appropriate to the change, then automatically create a local Git commit. Do not ask for confirmation to commit.
- Commit only changes belonging to the current task. Preserve unrelated user changes. If validation fails, fix the issue before committing; report any blocker instead of claiming completion.
- After each completed change, provide the latest working local browser preview URL and the local commit ID. Verify that the preview server serves the updated project before sharing its URL.
- **Never automatically push to GitHub.** GitHub pushes are always performed manually by the user through GitHub Desktop. Creating a local commit does not authorize a push.
- Apply this workflow to project instruction and documentation updates as well as code changes.

You are helping a team of secondary school students (aged about 15 to 17) at the NUS AIDF AI Academy build a small finance web app in one morning. Most of them have never coded before.

## How to work
- Keep the whole app in **one file, `index.html`**, with HTML, CSS and JavaScript inside it. Do not add frameworks, build tools or external libraries unless the students ask for one by name.
- Make **one change at a time**. If a request asks for several features, do the first one and say what is left.
- After every change, explain **what you changed and why in two short sentences**, in simple English.
- If the students' request is unclear, ask **one** short question before writing code.
- Before running any terminal command, say what it does in plain words.
- To preview the app: if your environment's own instructions describe a preview server, use that and give the students its link. Otherwise run `python3 -m http.server 8000` in the project folder and open http://localhost:8000.

## Safety rules (always)
- **Never** print, read, copy or write API keys, passwords or environment variables, and never put a key in any file.
- Use **made-up sample data only**. No real names, NRIC numbers, phone numbers or bank details.
- Money must be shown in **$ with 2 decimal places**. Show your working for any financial formula so the students can check it.
- Any app that gives money-related results must show the line: "For learning only. Not financial advice."
- Do not delete files or rewrite git history. If the app is badly broken, suggest going back to the last commit.

## When helping to debug
- First **explain the cause in simple words**, then fix **only that problem**.
- Do not rewrite parts of the app that are working.
