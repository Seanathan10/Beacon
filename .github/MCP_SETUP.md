# Playwright MCP Server Configuration

This project is configured with a **Playwright Model Context Protocol (MCP) server** to extend GitHub Copilot CLI capabilities with browser automation features.

## What This Enables

With Playwright MCP configured, Copilot CLI (me) can now:

- **E2E Testing** — Automatically write and run end-to-end tests for the frontend
- **Visual Testing** — Capture screenshots and validate visual regressions
- **Browser Automation** — Navigate pages, interact with elements, validate UI state
- **Data Scraping** — Extract and validate frontend-rendered data
- **Accessibility Testing** — Validate ARIA attributes, keyboard navigation, screen reader compatibility
- **Performance Testing** — Measure page load times, DOM interaction performance
- **Cross-browser Testing** — Test on Chromium, Firefox, and WebKit

## Configuration Details

**Config File:** `.github/copilot-mcp-config.json`

The configuration specifies:
- **Server:** `@modelcontextprotocol/server-playwright` (auto-installed via npx)
- **Browser:** Chromium (default; can change to `firefox` or `webkit`)
- **Auto-install:** Uses `npx -y` to automatically download and run the latest version

## Usage Examples

Once configured, Copilot CLI can help with tasks like:

```
"Write an E2E test that verifies the map loads and renders pins correctly"
"Take a screenshot of the login page and validate the layout"
"Automate a user journey: login → create a pin → add a comment → verify it appears"
"Check if all buttons are keyboard accessible"
"Measure how long it takes for the heatmap to render with 500 pins"
```

## Activation

The Playwright MCP server activates automatically when you launch Copilot CLI in this repository. No additional setup is required.

If you want to verify it's working, you can run:
```bash
copilot
/mcp
```

This will show you all configured MCP servers, including Playwright.

## Browser Defaults

- **Default:** Chromium (fastest, most compatible)
- **Optional:** Firefox, WebKit for cross-browser testing
- **Headless:** Default is headless mode (no visible browser window)

## Limitations

- Playwright runs in a sandbox on your machine; data stays local
- Browser automation is slower than API testing, so use it for UI-specific validations
- Some enterprise/restricted sites may block automation

## Future Enhancements

This configuration can be extended to:
- Add pytest/jest integration for automated test generation
- Incorporate visual regression testing with baseline snapshots
- Run tests as part of CI/CD workflows
- Validate different screen sizes and devices
