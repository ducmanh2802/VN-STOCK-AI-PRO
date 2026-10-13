Tiếp tục audit VN-STOCK-AI-PRO, ưu tiên tiết kiệm token. Chỉ xử lý một task: xác minh và sửa lỗi runtime tại src/services/alerts/AlertApiRouter.ts:22.

Quy tắc:

Chỉ đọc file cần thiết và diff hiện có; không audit lại toàn repo.

Giữ nguyên toàn bộ thay đổi dirty đã tồn tại. Không reset, checkout, clean, stash hoặc ghi đè file.

Phạm vi sửa duy nhất: src/services/alerts/AlertApiRouter.ts. Không sửa file khác.

Trước khi sửa, xác nhận lỗi từ mã nguồn hiện tại. Nếu file đã thay đổi trong working tree, đọc diff và không ghi đè thay đổi có sẵn.

Chỉ sửa lỗi res/_res nếu xác minh đúng. Không refactor ngoài phạm vi.

Không chạy test/build nếu chưa được phép. Không tuyên bố PASS nếu chưa có bằng chứng.

Sau khi sửa, xuất diff ngắn, giải thích nguyên nhân, nêu test tối thiểu cần chạy và kiểm tra file dirty không liên quan có bị thay đổi hay không.

Nếu quyền OpenCode hoặc AGENTS.md không cho phép sửa, dừng và yêu cầu orchestrator cấp phạm vi ALLOWED FILES rõ ràng; không tìm cách vượt quyền.

Không thực hiện task khác. Không tích hợp broker và không bật giao dịch tiền thật.