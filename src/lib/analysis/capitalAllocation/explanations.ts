import type { CapitalAllocationResult, Explanation } from './types.ts';

export function createExplanations(r: CapitalAllocationResult): Explanation[] {
  if (r.dataStatus === 'DATA_UNAVAILABLE') return [{
    title: 'Chưa đủ dữ liệu phân bổ vốn', summary: 'Nguồn dữ liệu hiện tại không có đầy đủ báo cáo lưu chuyển tiền tệ và/hoặc cổ tức thực trả.',
    evidence: r.unavailableReasons, interpretation: 'Không thể suy ra tiền mặt còn lại từ lợi nhuận kế toán.',
    risk: 'Mọi kết luận về CAPEX, dòng tiền tự do hoặc cổ tức khi thiếu các dòng này đều có thể sai.',
    whatInvestorShouldWatch: 'Chờ báo cáo tài chính lịch sử có dòng tiền hoạt động, chi đầu tư và cổ tức thực trả.'
  }];
  const cash = r.metrics.cashConversion.value;
  return [{
    title: 'Doanh nghiệp đang dùng tiền thế nào?', summary: `Lợi nhuận được đánh giá cùng dòng tiền hoạt động, không thay thế bằng lợi nhuận kế toán.`,
    evidence: [`Chuyển đổi CFO/lợi nhuận: ${cash === null ? 'không có' : `${cash.toFixed(1)}%`}.`],
    interpretation: cash !== null && cash >= 100 ? 'Lợi nhuận được hỗ trợ bởi tiền từ hoạt động.' : 'Cần theo dõi chất lượng chuyển đổi lợi nhuận thành tiền.',
    risk: 'Chỉ số hiệu quả vốn là chỉ báo phân tích, không chứng minh quan hệ nhân quả.',
    whatInvestorShouldWatch: 'Theo dõi CFO, CAPEX, nợ và cổ tức thực trả trong 1–3 năm tới.'
  }];
}
