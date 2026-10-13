# TASK: AUDIT & FIX 4 NHÓM LỖI — VN-STOCK-AI-PRO

Bạn là Claude Code Orchestrator. Điều phối OpenCode làm coding agent nếu model/provider hoạt động. Ưu tiên tiết kiệm token, không audit lại toàn bộ repository và không chạy nhiều agent song song.

## 0. Bảo vệ working tree — BẮT BUỘC

Repository: `D:\Stock\VN-STOCK-AI-PRO`

- Không reset, clean, checkout, restore, stash hoặc ghi đè thay đổi có sẵn.
- Trước khi sửa, ghi nhận `git status --short`, `git diff --stat` và hash các file sắp sửa.
- Phân biệt rõ thay đổi có trước và thay đổi do task này tạo ra.
- Không đọc hoặc in secrets; không truy cập `.env` hoặc credential.
- Không cài package, không migration, không deploy, không commit/push, không đặt lệnh giao dịch thật.
- Không sửa `opencode.json`, `AGENTS.md` hoặc các chính sách quyền để vượt giới hạn.
- Nếu agent không được phép sửa một file, dừng và yêu cầu Orchestrator phê duyệt `ALLOWED FILES` cụ thể. Không tìm cách vượt quyền.
- Không giả định `AGENTS.md` có thể cưỡng chế giới hạn file nếu permission thực tế không bảo đảm điều đó.

## 1. Phạm vi audit và sửa

Xử lý tuần tự bốn nhóm dưới đây. Mỗi nhóm là một task riêng, có review trước khi chuyển sang nhóm tiếp theo.

### P0-A — Alerts API
File: `src/services/alerts/AlertApiRouter.ts`

1. Xác minh lỗi handler khai báo `_res` nhưng dùng `res.json()`.
2. Kiểm tra kiểu dữ liệu và convention của các router tương tự.
3. Nếu đúng là lỗi runtime, sửa tối thiểu trong phạm vi file này.
4. Không refactor ngoài phạm vi.

### P0-B — Scenario API
File: `src/services/scenario/ScenarioApiRouter.ts`

1. Xác minh lỗi `.filter()` trên object tại vị trí đã nêu.
2. Xác minh `PortfolioPositionInput` có thực sự thiếu import hay sai kiểu.
3. Kiểm tra validation đầu vào, kiểu dữ liệu và hành vi khi dữ liệu không hợp lệ.
4. Sửa tối thiểu, giữ nguyên hợp đồng API và không làm yếu validation.
5. Không tự đoán schema hoặc thêm giá trị giả để hết lỗi TypeScript.

### P1-A — Tính tái lập của trading/backtest

Các vị trí được báo cáo gồm `Math.random()`, `Date.now()` và `new Date()` trong `PaperBroker.ts`, `PaperExecutionEngine.ts`, `PaperTradeLedger.ts`, `TradingEngine.ts`, `RiskManager.ts`, `StrategyContextAggregator.ts`, `BacktestApiRouter.ts` và `OrderManager.ts`.

1. Xác minh từng vị trí trong context thực tế.
2. Phân loại thành:
   - ảnh hưởng quyết định giao dịch/kết quả backtest;
   - tạo ID hoặc correlation ID;
   - timestamp phục vụ log/audit;
   - trường hợp khác.
3. Chỉ sửa vị trí thực sự ảnh hưởng determinism.
4. Nếu cần, ưu tiên dependency injection cho clock và ID generator; giữ API tương thích.
5. Không dùng timestamp đơn thuần làm ID duy nhất.
6. Không tạo PRNG tự chế hoặc seed cố định toàn cục làm giảm an toàn.
7. Giữ nguyên logic khớp lệnh, phí, slippage, risk limits và quy tắc thị trường Việt Nam.
8. Không thay hàng loạt trước khi có test chứng minh tính đúng đắn.

### P1-B — Fail-closed và `?? 0`

Các vị trí cần review trong `RiskGuard.ts`, `FinancialConservationValidator.ts`, `PaperExecutionEngine.ts`.

1. Xác định từng giá trị nullable và ý nghĩa nghiệp vụ.
2. Kiểm tra trường hợp thiếu, `null`, `NaN`, vô cực, 0, số âm và dữ liệu stale/invalid khi có liên quan.
3. Nếu trường bắt buộc để quyết định an toàn bị thiếu, phải từ chối hoặc trả trạng thái không khả dụng rõ ràng; không tự chuyển thành 0 để tiếp tục giao dịch.
4. Chỉ sửa những vị trí chứng minh được có lỗi.
5. Không nới lỏng RiskGuard, FinancialConservationValidator, TradingDataValidator, MarketDataIntegrityGuard, TradingEngine, PositionSizer, PaperBroker hoặc ledger.
6. Không tuyên bố lỗi nếu `?? 0` được chứng minh là hợp lệ theo domain và không thể mở đường cho hành vi nguy hiểm.

## 2. Quy trình cho từng nhóm

Với mỗi nhóm:

1. Đọc tối thiểu file mục tiêu, kiểu dữ liệu liên quan và test trực tiếp.
2. Nêu nguyên nhân gốc, mức độ nghiêm trọng và file dự kiến sửa.
3. Kiểm tra permission thực tế trước khi edit.
4. Chỉ sửa trong phạm vi đã duyệt. Không đụng file dirty có sẵn nếu chưa hiểu diff.
5. Viết hoặc cập nhật test hồi quy phù hợp, nhưng chỉ khi file test nằm trong phạm vi được phép.
6. Chạy test mục tiêu nếu được phép. Không chạy migration, test suite có side effect hoặc lệnh có thể ghi DB.
7. Review diff và kiểm tra working tree.
8. Chỉ chuyển sang nhóm kế tiếp khi nhóm hiện tại không có thay đổi ngoài phạm vi và không làm yếu invariant.

Nếu thiếu quyền hoặc thiếu bằng chứng, báo BLOCKED; không cố vượt qua.

## 3. Quy tắc test và báo cáo

- Không chạy `vitest` nếu permission hiện tại cấm.
- Không chạy test/build khi chưa được phép hoặc khi chưa đánh giá side effect.
- Không tuyên bố test PASS nếu chưa thực sự chạy và thấy exit code thành công.
- Nếu baseline TypeScript đã có lỗi, phân biệt lỗi cũ với lỗi mới; không che hoặc sửa lan man các lỗi ngoài phạm vi.
- Không tuyên bố hệ thống đã sẵn sàng giao dịch tiền thật. Đây là task audit/fix lỗi, không phải task tích hợp broker.

Sau mỗi nhóm, báo:
- Root cause đã xác minh.
- File và phạm vi diff.
- Test đã chạy và kết quả thực tế, hoặc lý do BLOCKED.
- Invariant/risk guard được giữ nguyên như thế nào.
- Các file dirty có trước vẫn được bảo toàn ra sao.

Cuối cùng, tổng hợp PASS / FAIL / BLOCKED riêng cho từng nhóm. Không gộp tất cả thành một kết luận PASS nếu bất kỳ nhóm nào chưa được xác minh.

Bắt đầu bằng việc xác minh trạng thái hiện tại và P0-A. Không triển khai cả bốn nhóm cùng lúc.