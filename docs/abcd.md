# AUTONOMOUS DEBUG & FIX — GOOGLE AI STUDIO PREVIEW NOT RENDERING
## Project: VN-STOCK-AI-PRO

Act as a Senior Full-Stack Engineer and Google AI Studio runtime debugging specialist. You have access to this project's files and the current Google AI Studio execution environment.

**Do not merely explain the problem or give me instructions. Inspect the actual project, diagnose the root cause, make the necessary code changes, restart or rerun the application as appropriate, and verify that the website renders in Google AI Studio Preview.**

## 1. Current situation

The project is `VN-STOCK-AI-PRO`.

A previous agent reported:
- Vite frontend build succeeded.
- Backend bundle `dist/server.cjs` was generated.
- Development server reportedly started on port 3000.
- `GET /` returned HTTP 200.
- `/api/platform/healthz` returned HTTP 200.
- Protected endpoint `/api/users/me` correctly returned HTTP 401 without an authentication token.
- However, **the website is still not visible in Google AI Studio Preview**.

The previous agent changed `server.ts` to prioritize port 3000 in development because it believed `process.env.PORT=8080` conflicted with Nginx. This assumption has not been independently verified.

The frontend entry point is `src/main.tsx`, which mounts React `App.tsx`. `index.html` references `./src/main.tsx`.

These are clues, not guaranteed descriptions of the current runtime. Inspect the actual files and environment before deciding what is wrong.

## 2. Inspect actual Google AI Studio diagnostics first

Use every diagnostic capability available in this Google AI Studio session.

Inspect:
- Current application/runtime logs.
- Startup and dependency installation logs.
- Vite/esbuild compilation errors.
- Browser console errors and uncaught exceptions.
- Preview iframe errors, if accessible.
- Failed HTTP requests and network errors, if accessible.
- Actual process exit status.
- Actual port and host on which the frontend server is listening.
- Environment-provided port configuration.
- Whether the Preview is using the development server, production build, or another runtime entry point.

Search for errors including, but not limited to:
- Missing exports and unresolved imports.
- React mounting failures.
- Invalid JSX or runtime exceptions.
- Missing files and incorrect asset paths.
- HTTP 404/500 responses.
- CORS, CSP, authentication, proxy, and iframe restrictions.
- Server binding to the wrong host or port.
- Incorrect startup scripts.
- Incorrect Vite base path.
- Broken SPA fallback.
- Frontend/backend route conflicts.
- Stale build output or dependency optimization errors.

**Do not invent logs, browser access, environment values, or test results.** If a diagnostic source is inaccessible, explicitly state that limitation and continue using the available project files and runtime checks.

## 3. Inspect the project before editing

Read the current versions of:
- `package.json`
- `server.ts`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/store/useAppStore.ts`
- Relevant routing, middleware, and startup configuration.

Inspect recent changes and the actual scripts used to launch the application.

Determine which environment contract the current Google AI Studio runtime expects. Do not assume that port 3000 or port 8080 is correct without evidence.

## 4. Diagnose and fix the root cause

Work autonomously and make the smallest correct changes.

### Port and server binding
- Respect the port supplied by the runtime when required.
- Bind to the correct network interface when the preview proxy requires it.
- Do not hardcode port 3000 for every environment.
- Do not assume `process.env.PORT` conflicts with Nginx without confirming the runtime topology.
- Ensure that only the intended process owns each port.
- Do not start duplicate servers or leave stale processes running.

### Frontend entry and rendering
- Verify that `index.html` points to the actual frontend entry.
- Verify that React mounts successfully into the root element.
- Fix unresolved imports/exports and runtime exceptions.
- Verify the application's routing and fallback behavior.
- Ensure that required CSS, JavaScript modules, and assets load successfully.
- Check that the Preview is not displaying a blank page because the frontend server is inaccessible or the JavaScript bundle failed.

### Development and production modes
- Identify which mode Google AI Studio is actually running.
- Use the correct startup script for that mode.
- Keep Vite development serving and production serving consistent with the project architecture.
- Do not serve stale `dist` output when the runtime expects source modules, or serve source modules when the runtime expects a production build.
- Preserve API routes and frontend routes without accidental collisions.

### Security
- Preserve Firebase authentication and authorization.
- Preserve fail-closed behavior, security headers, CSP, rate limiting, and protected API boundaries.
- Do not disable authentication or security middleware to make Preview work.
- Do not replace real authentication or market data with mock implementations.
- Do not expose secrets or print credential values in logs.

## 5. Run and verify the actual application

After fixing the identified issue:

1. Run the appropriate dependency/setup step only if needed.
2. Run the project's typecheck and build commands.
3. Start the application using the actual Google AI Studio runtime's expected entry point.
4. Inspect fresh startup logs for errors.
5. Verify the actual listening host and port.
6. Request the frontend root URL and verify the returned content.
7. Request a JavaScript module or built asset referenced by the page.
8. Check relevant API health endpoints without bypassing authentication.
9. Inspect browser console and Preview/network diagnostics if available.
10. Open or refresh the actual Google AI Studio Preview and verify that the React application visibly renders.

A successful build or HTTP 200 response alone is NOT sufficient proof that the website is visible.

If the Preview is still blank, continue investigating the newest logs and errors instead of stopping after the first attempted fix.

## 6. Regression checks

Run the relevant existing tests and ensure the fix does not break:
- Application startup.
- Frontend routing.
- Backend API routing.
- Authentication and authorization.
- Security middleware.
- Existing trading and portfolio features.

Do not modify `TradingEngine`, `RiskGuard`, position sizing, allocation constraints, or financial calculations unless a directly related, independently verified defect requires it.

Do not delete tests, skip failing tests, weaken assertions, fabricate financial data, or change expected behavior merely to obtain a passing result.

Preserve all existing user changes. Do not perform destructive Git operations or commit changes automatically.

## 7. Definition of done

The task is complete only when:
- The root cause is identified with evidence.
- The necessary fix is applied to the actual project files.
- The correct application process starts in Google AI Studio.
- The frontend assets load successfully.
- The Preview visibly renders the application, if the Preview can be accessed from this session.
- Relevant typecheck, build, and regression checks have actual recorded results.
- Authentication and security protections remain intact.

## 8. Final report

Provide a concise evidence-based report containing:

1. Root cause and the specific diagnostic log or error that confirmed it.
2. Files changed and why.
3. Actual startup command and listening port.
4. Build, typecheck, and test results.
5. Browser console/network results, if accessible.
6. Whether you personally verified the application rendering in Google AI Studio Preview.
7. Any remaining issue that requires manual action.

**Start now. Inspect the real environment, diagnose, fix, restart, and verify. Do not stop at a proposed solution.**