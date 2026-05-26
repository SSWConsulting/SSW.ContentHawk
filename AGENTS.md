### Front end
Do not edit shadcn components directly when making tweaks. Instead use the className prop to customize them and/or wrap them in your own components. This will make it easier to update shadcn in the future without losing your customizations.

When classes need to be merged, use the `cn` utility function from `./lib/utils.ts` to merge them. This function intelligently merges Tailwind classes, ensuring that conflicting classes are resolved correctly (e.g., `bg-red-500` and `bg-blue-500` will resolve to the last one).

### Test Suites
Bugs and edge cases are likely to arise on the front end. Whenever you fix a bug on the front end be sure to add a new test in `scripts/__tests__` to cover the bug you just fixed to ensure there are no regressions.

### Back end
Be sure to handle any sensitive operations (e.g. running task in GitHub) here. If the front end needs to trigger an event or operation, create an API for this and call it via a service method from the front end. Do not call GitHub APIs directly from the front end or expose any sensitive information (e.g. tokens) to the front end.

Use `github-service.ts` for methods that interact with GitHub (secrets, branches, workflow streams, PRs). Use `contenthawk-service.ts` for any other back-end calls that are not GitHub-specific (e.g. campaign data, server lifecycle).