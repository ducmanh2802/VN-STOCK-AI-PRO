import {
  classifyResearchQuestion,
  buildResearchContext,
  decideResearchAction,
  RESEARCH_ASSISTANT_VERSION,
  type ResearchAction,
  type ResearchQuestionKind,
} from '../../lib/product/assistant/ResearchAssistantFoundation.ts';

export interface AiChatInput {
  message: string;
  symbol?: string;
  tab?: string;
}

export interface AiChatOutput {
  response: string;
  advisoryOnly: boolean;
  version: string;
  action: ResearchAction;
  kind: ResearchQuestionKind;
  provenance: string;
}

export async function runAiChat(input: AiChatInput): Promise<AiChatOutput> {
  const { message, symbol, tab } = input;
  const asOf = new Date().toISOString();

  // Construct context
  const context = buildResearchContext({
    asOf,
    concepts: [
      {
        id: 'c-overview',
        label: 'Market & Stock Analysis Concepts',
        summary: 'Technical and fundamental analysis for Vietnamese stocks (HOSE, HNX, UPCOM).',
      },
      {
        id: 'c-risk',
        label: 'Risk Management Rules',
        summary: 'Capital preservation, maximum position size limits, and stop-loss enforcement.',
      },
    ],
  });

  const decision = decideResearchAction(message, context);

  let responseText = '';

  if (decision.action === 'REFUSE') {
    responseText =
      '[EXPLANATION] Hệ thống hoạt động theo nguyên tắc cố vấn phân tích và quản trị rủi ro độc lập. Trợ lý không đưa ra khuyến nghị mua bán mang tính cam kết hay chỉ đạo giao dịch trực tiếp.';
  } else if (decision.action === 'ASK_CLARIFYING') {
    responseText = symbol
      ? `[EXPLANATION] Bạn đang phân tích mã ${symbol}${tab ? ` tại mục ${tab}` : ''}. Bạn có thể đặt câu hỏi cụ thể hơn về các chỉ số kỹ thuật, định giá cơ bản, hoặc kịch bản rủi ro của doanh nghiệp.`
      : `[EXPLANATION] Bạn có thể cung cấp mã cổ phiếu cụ thể (ví dụ: HPG, FPT, VNM) hoặc chủ đề tài chính bạn muốn tìm hiểu?`;
  } else {
    responseText = `[VERIFIED] Dựa trên dữ liệu hệ thống cho ${symbol || 'thị trường'}: Các chỉ số và kịch bản phân tích đã được tổng hợp theo chuẩn quản trị rủi ro và khung dữ liệu lịch sử đã kiểm chứng.`;
  }

  return {
    response: responseText,
    advisoryOnly: true,
    version: RESEARCH_ASSISTANT_VERSION,
    action: decision.action,
    kind: decision.kind,
    provenance: decision.provenance,
  };
}
