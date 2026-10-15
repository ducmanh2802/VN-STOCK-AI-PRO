# TASK: REPAIR TYPESCRIPT + VITEST + REBALANCING TESTS — VN-STOCK-AI-PRO

## 1. Vai trò và mục tiêu

Bạn là Senior TypeScript Engineer chịu trách nhiệm sửa lỗi trong repository:

`D:\Stock\VN-STOCK-AI-PRO`

Mục tiêu:
- Khôi phục cấu hình TypeScript hợp lệ.
- Sửa toàn bộ lỗi `npm.cmd run typecheck`.
- Sửa lỗi test thuộc `src/lib/rebalancing-decision`.
- Sửa import sai trong `src/services/scenario/ScenarioApiRouter.ts`.
- Chạy lại build, typecheck và các test liên quan.
- Giữ nguyên các thay đổi hiện có của người dùng.

Không chỉ phân tích hoặc đưa hướng dẫn. Hãy trực tiếp kiểm tra và chỉnh sửa file trong repository.

## 2. Quy tắc bảo vệ bắt buộc

1. Trước khi sửa, chạy và ghi nhận:
   - `git status --short`
   - `git diff --stat`
   - `git diff -- tsconfig.json package.json vitest.config.ts`
   - `npm.cmd run typecheck`
2. Đọc nội dung hiện tại của từng file trước khi chỉnh sửa.
3. Không dùng `git reset`, `git checkout`, `git restore`, `git clean`, force push hoặc lệnh làm mất thay đổi.
4. Không xóa file lạ, file untracked, test hoặc dữ liệu người dùng.
5. Không ghi đè toàn bộ file cấu hình khi chỉ cần sửa một phần.
6. Không tự ý commit.
7. Không cài thêm package nếu không chứng minh được là cần thiết.
8. Không thay đổi quy tắc tài chính chỉ để làm test pass.

## 3. Sửa cấu hình TypeScript

Kiểm tra `tsconfig.json` bằng JSON parser và `npx.cmd tsc --noEmit --pretty false`.

Có dấu hiệu phần cấu hình `lib` bị thiếu hoặc hỏng: các giá trị `ES2022`, `DOM`, `DOM.Iterable` xuất hiện rời rạc.

Nếu JSON không hợp lệ:
- Khôi phục cấu trúc JSON tối thiểu, dựa trên cấu hình hiện tại và yêu cầu build thực tế.
- Bảo toàn `module`, `moduleResolution`, `jsx`, `paths`, `allowImportingTsExtensions`, `noEmit`, `skipLibCheck` và các tùy chọn hợp lệ khác.
- Không đoán alias hoặc thay đổi cấu trúc dự án khi chưa kiểm tra.
- Kiểm tra lại cấu hình sau khi sửa.

Kiểm tra TypeScript có nhận diện các global Vitest hay không. `vitest.config.ts` hiện bật `globals: true`, nhưng điều đó không tự đảm bảo `tsc` nhận diện `describe`, `it`, `expect`.

Với test file không import từ `vitest`, ưu tiên thêm import tường minh cho các hàm thực sự sử dụng, thay vì khai báo global rộng cho toàn dự án.

Các file cần kiểm tra:
- `src/lib/rebalancing-decision/__tests__/ConstrainedAllocator.test.ts`
- `src/lib/rebalancing-decision/__tests__/RebalancingDecisionDeterminism.test.ts`
- `src/lib/rebalancing-decision/__tests__/TurnoverCost.test.ts`

Không thêm import trùng nếu file đã có import tương đương.

## 4. Sửa lỗi TypeScript trong test

Typecheck trước đó báo khoảng 116 lỗi, tập trung ở 5 file:

- `ConstrainedAllocator.test.ts`
- `ConstraintEngine.test.ts`
- `RebalancingDecisionDeterminism.test.ts`
- `RebalancingDecisionFailClosed.test.ts`
- `TurnoverCost.test.ts`

Đây là kết quả cũ, cần chạy lại để xác nhận danh sách lỗi hiện hành.

### 4.1. Narrowing discriminated unions

Các test đang truy cập thuộc tính của nhánh success/failure trước khi TypeScript xác nhận `result.ok`.

Sửa bằng control flow narrowing thực sự, ví dụ:

```typescript
if (!result.ok) {
  throw new Error(result.detail);
}

expect(result.iterations).toBeGreaterThan(0);
expect(result.weights.A).toBeLessThanOrEqual(0.6001);
```

Đối với nhánh failure, kiểm tra `result.ok` và thu hẹp kiểu trước khi đọc `reason`, `detail` hoặc `status`.

Áp dụng tương tự cho kết quả tính phí giao dịch (`CostResult`), không sử dụng `as any` hoặc ép kiểu giả để che lỗi.

### 4.2. ConstraintEngine.test.ts

Kiểm tra và sửa:
- Thuộc tính `derivativeNotional` đang bị khai báo trùng trong một object.
- Test `rejects per-asset min > max`.
- Test `rejects NaN bounds`.
- Test `supplies per-asset bands and detects violations against weights`.

Đối chiếu kỳ vọng của test với implementation và hợp đồng kiểu hiện tại. Nếu implementation sai theo yêu cầu đã xác định, sửa implementation bằng thay đổi tối thiểu và thêm regression test phù hợp. Nếu test sai, sửa test với lý do rõ ràng.

Không thay đổi semantics của constraint chỉ để ép số lượng violations khớp kỳ vọng.

### 4.3. RebalancingDecisionFailClosed.test.ts

Kiểm tra:
- Import `ConstraintViolation` đang bị lặp.
- Test truyền `factorBands` trực tiếp vào input, trong khi kiểu `RebalancingInput` có thể yêu cầu nó nằm trong `constraints`.
- Các test liên quan đến `INSUFFICIENT_DATA`, `unevaluated` và kết quả `OK`.

Đọc `types.ts`, `RebalancingDecisionBuilder.ts`, `ConstraintEngine.ts` và các test tương ứng trước khi sửa.

Không loại bỏ điều kiện fail-closed. Không đổi trạng thái `INSUFFICIENT_DATA` thành `OK` nếu dữ liệu bắt buộc còn thiếu.

### 4.4. ConstrainedAllocator và tính xác định

Kiểm tra test kỳ vọng `iterations > 0`, giới hạn asset bands và tổng trọng số.

Phân biệt rõ:
- Lỗi fixture/test không đúng hợp đồng.
- Lỗi thuật toán thực sự.
- Lỗi do dữ liệu đầu vào không hợp lệ.

Không chỉnh `ConstrainedAllocator.ts` chỉ để làm test pass nếu chưa chứng minh lỗi nằm ở implementation.

## 5. Sửa ScenarioApiRouter

Kiểm tra import trong:

`src/services/scenario/ScenarioApiRouter.ts`

Đường dẫn hiện tại được báo cáo là:

`../../portfolio/types.ts`

Trong repository có:

`src/lib/portfolio/types.ts`

nhưng không có:

`src/portfolio/types.ts`

Xác minh các kiểu được sử dụng và dependency thực tế. Chỉ sửa đường dẫn sang module đúng nếu đã xác nhận tương thích; không tạo file placeholder để che lỗi import.

## 6. Bảo vệ logic trading và dữ liệu

Không được:
- Nới lỏng RiskGuard hoặc giới hạn phân bổ vốn.
- Bỏ kiểm tra dữ liệu thiếu, dữ liệu stale hoặc dữ liệu không hợp lệ.
- Chuyển trạng thái lỗi sang `OK` để làm test pass.
- Tạo mock/fake financial data trong production.
- Tắt test, bỏ test, tăng timeout tùy tiện hoặc thêm `skip`.
- Thay đổi public API không cần thiết.
- Sửa `package.json` hoặc lockfile nếu không thực sự cần.

Ưu tiên sửa type definitions, imports, fixture và test trước khi cân nhắc thay đổi production code.

## 7. Quy trình kiểm chứng

Sau mỗi nhóm thay đổi, chạy:

```powershell
npx.cmd tsc --noEmit --pretty false
```

Sau đó chạy nhóm test:

```powershell
npm.cmd test -- src/lib/rebalancing-decision
```

Nếu Vitest không chấp nhận cách truyền tham số này, đọc script `test` trong `package.json` và dùng cú pháp phù hợp; không sửa script chỉ để né lỗi.

Khi nhóm test đạt yêu cầu, chạy:

```powershell
npm.cmd run build
npm.cmd run typecheck
```

Nếu thời gian và môi trường cho phép, chạy toàn bộ test suite:

```powershell
npm.cmd test
```

Không tuyên bố PASS nếu lệnh chưa chạy thành công. Phân biệt lỗi đã tồn tại trước thay đổi và lỗi mới do patch gây ra.

## 8. Tiêu chí hoàn thành

Chỉ báo hoàn thành khi:
- `tsconfig.json` hợp lệ.
- Typecheck không còn lỗi thuộc phạm vi đã sửa.
- Test `rebalancing-decision` được chạy thực tế và có kết quả rõ ràng.
- Build được kiểm chứng.
- Không có test bị bỏ qua hoặc làm yếu để đạt PASS.
- Không mất thay đổi Git ban đầu.
- Không tự ý commit.

## 9. Báo cáo cuối

Trả về báo cáo ngắn, có bằng chứng:

1. Nguyên nhân gốc của từng nhóm lỗi.
2. File đã sửa và nội dung thay đổi.
3. Lệnh đã chạy và kết quả PASS/FAIL chính xác.
4. Số lỗi typecheck trước và sau.
5. Số test pass/fail trước và sau, nếu đã chạy.
6. Lỗi còn tồn tại, nguyên nhân và bước tiếp theo.
7. `git status --short` sau khi sửa.

Bắt đầu bằng việc kiểm tra trạng thái repository và cấu hình hiện tại. Tự thực hiện sửa chữa theo từng bước an toàn, không dừng ở việc chỉ đưa ra đề xuất.