/**
 * AI COPILOT ADVISORY SERVICE
 * ===========================
 * Extracted from the inline `POST /api/ai/chat` handler so the AI assistant
 * capability has a real `src/` implementation that the feature registry can cite
 * as evidence (P1-03), instead of pointing at a test-only module.
 *
 * SECURITY / AUTHORITY BOUNDARY (unchanged and deliberately strict)
 * - ADVISORY ONLY. This service has no access to trading, risk, portfolio or
 *   order state, and it can never place, cancel or modify an order.
 * - The system prompt is fixed in code and instructs the model to refuse any
 *   order-authority claim. It cannot be overridden by the request body.
 * - No fabricated financial data: the model is instructed to say when data is
 *   missing rather than invent it.
 * - The Gemini SDK is imported lazily so a missing key can never crash startup.
 * - `advisoryOnly: true` is returned on every successful response, including the
 *   unconfigured-key notice, so no caller can mistake this for execution.
 */

export interface AiChatRequest {
  readonly message: string;
  readonly symbol?: string | undefined;
  readonly tab?: string | undefined;
}

export interface AiChatResponse {
  readonly reply: string;
  readonly advisoryOnly: true;
  readonly symbol?: string;
  readonly source: 'GEMINI_ADVISORY' | 'SYSTEM_NOTICE';
  readonly timestamp: string;
}

const SYSTEM_INSTRUCTION = [
  'Bạn là trợ lý AI phân tích tài chính cao cấp của nền tảng VN STOCK AI PRO, chuyên sâu về thị trường chứng khoán Việt Nam (HOSE, HNX, UPCoM).',
  'QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ):',
  '1. CỐ VẤN ĐỘC LẬP: Bạn chỉ đóng vai trò phân tích, tư vấn và cung cấp góc nhìn tham khảo. Bạn TUYỆT ĐỐI KHÔNG CÓ QUYỀN đặt lệnh, hủy lệnh, hay thay đổi số dư tài khoản giao dịch.',
  '2. TUÂN THỦ PHÁP LÝ & RỦI RO: Mọi khuyến nghị phải tuân thủ quy tắc thị trường Việt Nam (lô chẵn 100 cổ phiếu, biên độ trần/sàn HOSE +/-7%, HNX +/-10%, UPCoM +/-15%, chu kỳ thanh toán T+2.5, không bán khống).',
  '3. TRUNG THỰC DỮ LIỆU: Không bao giờ bịa đặt thông tin tài chính hay đưa ra lời hứa hẹn cam kết lợi nhuận. Nếu thiếu dữ liệu, hãy nêu rõ ràng.',
].join(' ');

const UNCONFIGURED_REPLY = [
  'Dịch vụ AI Copilot hoạt động dưới dạng Cố vấn thông minh (Advisory Only).',
  '',
  'Hiện tại khóa API (GEMINI_API_KEY) chưa được cấu hình trên môi trường máy chủ. Vui lòng thiết lập biến GEMINI_API_KEY trong cài đặt dự án để kích hoạt phản hồi trực tiếp từ mô hình trí tuệ nhân tạo.',
].join('\n');

/** Model id is a code constant: a caller can never redirect the assistant. */
const MODEL_ID = 'gemini-2.5-flash';

export async function runAiChat(
  request: AiChatRequest,
  now: Date = new Date()
): Promise<AiChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      reply:
        `${UNCONFIGURED_REPLY}\n\n*Ngữ cảnh theo dõi:* ${request.symbol ? `Cổ phiếu ${request.symbol}` : 'Tổng quan thị trường'} (Chế độ xem: ${request.tab || 'Chung'}).`,
      advisoryOnly: true,
      source: 'SYSTEM_NOTICE',
      timestamp: now.toISOString(),
    };
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${SYSTEM_INSTRUCTION}\n\nNgữ cảnh hiện tại: ${request.symbol ? `Người dùng đang xem mã cổ phiếu ${request.symbol}.` : 'Người dùng đang theo dõi tổng quan thị trường.'}\n\nCâu hỏi của nhà đầu tư: ${request.message.trim()}`,
          },
        ],
      },
    ],
  });

  return {
    reply: response.text || 'Không nhận được câu trả lời từ mô hình AI.',
    advisoryOnly: true,
    symbol: request.symbol,
    source: 'GEMINI_ADVISORY',
    timestamp: now.toISOString(),
  };
}
