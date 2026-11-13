# PR Template

When creating **or updating** a pull request description, always use the repo's PR template at `.github/pull_request_template.md`. Read it first and keep its headings, in this order:

1. `### Changes`, containing:
   - `#### Affected Resources:`: keep the **entire** checklist. Check relevant boxes with `[x]` and leave the rest unchecked `[ ]`. If the change touches an area the list does not include, add it.
   - `#### Details:`: concise, specific bullets, not a changelog dump. Stick to a sentence or less per item where possible.
2. `### Testing`: how you verified the change. It can be as simple as "ran `npm run ci:gate` and checked the page locally with `npm run dev`".

The repo has no issue tracker, so the template has no ticket heading.
