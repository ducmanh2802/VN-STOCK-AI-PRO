# TASK BRIEF - FIX-SHELL-ERRORS

GOAL: `/ai-analyst` must show a loading or error state instead of a blank page, and the stock quick-view modal must
show loading / error / no-data instead of silently doing nothing when the stock detail is not available.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit` and
  read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection. You may NOT run tests
  (AGENTS.md section 5); the orchestrator runs them. Never claim tests pass.
- `src/App.tsx`:
  - line 284-286: `{currentView === 'ai-analyst' && aiSummary && (<AIAnalystPage aiSummary={aiSummary} />)}` —
    while `aiSummaryQuery` loads or after it fails the page is blank. `aiSummaryQuery` (line 108),
    `LoadingState` and `ErrorState` (imported on lines 43-44) already exist in the file.
  - lines 386-393: `<StockQuickViewModal stock={stockDetailQuery.data || null} isOpen={quickViewModalOpen} ... />`.
- `src/components/stock/StockQuickViewModal.tsx` line 27: `if (!isOpen || !stock) return null;` — a click on a
  stock opens nothing while the detail query loads, fails or returns null.
- `ErrorState` props (`src/components/ui/ErrorBoundary.tsx:5-11`): `title?`, `message?`, `error?: Error | null`,
  `onRetry?`. `LoadingState` props: `message?`, `variant?: 'default' | 'terminal' | 'skeleton'`.

REQUIRED CHANGES (exact; nothing else):
1. `src/App.tsx` — replace the `ai-analyst` block (lines 284-286) with:
   ```tsx
                {currentView === 'ai-analyst' && (
                  aiSummaryQuery.isLoading ? (
                    <LoadingState variant="terminal" message="Đang tải nhận định thị trường…" />
                  ) : aiSummary ? (
                    <AIAnalystPage aiSummary={aiSummary} />
                  ) : (
                    <ErrorState
                      message="Không tải được nhận định thị trường. Vui lòng thử lại."
                      error={aiSummaryQuery.error ?? null}
                      onRetry={() => aiSummaryQuery.refetch()}
                    />
                  )
                )}
   ```
   and add two props to the `<StockQuickViewModal ... />` call: `isLoading={stockDetailQuery.isLoading}` and
   `error={stockDetailQuery.error}`.
2. `src/components/stock/StockQuickViewModal.tsx`:
   - add to `StockQuickViewModalProps`: `isLoading?: boolean;` and `error?: unknown;`, and destructure both;
   - replace line 27 `if (!isOpen || !stock) return null;` with:
   ```tsx
     if (!isOpen) return null;
     if (!stock) {
       return (
         <div
           id="modal-stock-quickview-backdrop"
           className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-terminal-bg/85 backdrop-blur-xs"
           onClick={onClose}
         >
           <div
             id="modal-stock-quickview-content"
             className="w-full max-w-md bg-terminal-surface border border-terminal-border rounded-sm shadow-2xl p-5 text-sm text-terminal-text-secondary space-y-3"
             onClick={(e) => e.stopPropagation()}
           >
             <p>
               {isLoading
                 ? 'Đang tải dữ liệu mã cổ phiếu…'
                 : error
                   ? 'Không tải được dữ liệu mã cổ phiếu. Vui lòng thử lại.'
                   : 'Không có dữ liệu cho mã cổ phiếu này.'}
             </p>
             <button
               id="btn-modal-quickview-close"
               onClick={onClose}
               className="px-3 py-1.5 text-xs rounded border border-terminal-border hover:bg-terminal-surface-hover"
             >
               Đóng
             </button>
           </div>
         </div>
       );
     }
   ```
TESTS — new file `src/components/stock/__tests__/StockQuickViewModal.test.tsx` with `renderToStaticMarkup`
(pattern: `src/components/stock/__tests__/StockHardenedComponents.test.tsx`); `onClose`, `onToggleWatchlist` are
`() => {}`, `isWatchlisted={false}`:
1. `isOpen={false}`, `stock={null}` → HTML is `''`.
2. `isOpen`, `stock={null}`, `isLoading` → contains 'Đang tải dữ liệu mã cổ phiếu' and 'Đóng'.
3. `isOpen`, `stock={null}`, `error={new Error('x')}` → contains 'Không tải được dữ liệu mã cổ phiếu'.
4. `isOpen`, `stock={null}`, no isLoading/error → contains 'Không có dữ liệu cho mã cổ phiếu này'.

ALLOWED FILES:
- src/App.tsx
- src/components/stock/StockQuickViewModal.tsx
- src/components/stock/__tests__/StockQuickViewModal.test.tsx (new)

DO NOT TOUCH: every other file. Create no other files: the report is NOT a file.

ACCEPTANCE CRITERIA:
1. `/ai-analyst` never renders blank: loading → LoadingState, no data → ErrorState with retry.
2. The quick-view modal renders a loading / error / no-data body with a close button when `stock` is null.
3. `npx tsc --noEmit` reports 109 errors (baseline) or fewer.

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error. No commits, installs,
migrations, network or database access. Do not delete or rename files. Never delete or weaken an existing test.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Under TESTS write "not run (orchestrator runs them)". Do NOT use bash,
echo, cat, printf or the write tool to output it. Once the work is done, stop calling tools and reply with the block.
