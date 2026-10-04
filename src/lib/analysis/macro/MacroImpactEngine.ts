/**
 * PHASE 25+ — MACRO IMPACT ENGINE
 * =================================
 * Deterministic rule-based engine mapping macroeconomic shocks through the
 * transmission mechanism into Vietnamese sectors and equity valuations.
 *
 * Invariants:
 *   - Strictly rules-grounded (NEVER dynamically fabricated by an LLM)
 *   - Explicit step-by-step causal logic with affected sectors and direction
 */

import type { MacroCausalChain } from './types.ts';

export class MacroImpactEngine {
  private static readonly CANONICAL_CHAINS: readonly MacroCausalChain[] = [
    {
      id: 'CHAIN_FED_RATE_HIKE',
      title: 'Tăng lãi suất Fed & Lợi suất TPCP Mỹ',
      triggerMetric: 'FED_FUNDS_RATE',
      triggerDirection: 'UP',
      steps: [
        { order: 1, node: 'Lãi suất Fed / US10Y ↑', impact: 'Chi phí vốn USD toàn cầu tăng, thu hẹp chênh lệch lợi suất', direction: 'NEGATIVE' },
        { order: 2, node: 'Chỉ số DXY ↑', impact: 'Đồng USD mạnh lên trên thị trường quốc tế', direction: 'NEGATIVE' },
        { order: 3, node: 'Tỷ giá USD/VND áp lực ↑', impact: 'Ngân hàng Nhà nước phải cân đối chính sách tỷ giá & lãi suất', direction: 'NEGATIVE' },
        { order: 4, node: 'Dòng vốn ngoại rút ròng', impact: 'Khối ngoại bán ròng trên thị trường chứng khoán mới nổi / cận biên', direction: 'NEGATIVE' },
        { order: 5, node: 'Định giá P/E chiết khấu', impact: 'Lợi suất phi rủi ro tăng làm tăng lãi suất chiết khấu định giá cổ phiếu', direction: 'NEGATIVE' },
      ],
      affectedSectors: [
        { sector: 'Bất động sản', impact: 'NEGATIVE' },
        { sector: 'Ngân hàng', impact: 'MIXED' },
        { sector: 'Xuất khẩu / Thủy sản', impact: 'POSITIVE' },
        { sector: 'Vay nợ USD cao', impact: 'NEGATIVE' },
      ],
      explanationVi: 'Lãi suất Fed tăng đẩy DXY và lợi suất US10Y lên cao, tạo áp lực tỷ giá USD/VND và thúc đẩy khối ngoại bán ròng, đồng thời làm tăng lãi suất chiết khấu định giá thị trường.',
      confidence: 95,
    },
    {
      id: 'CHAIN_BRENT_OIL_SURGE',
      title: 'Giá dầu Brent & Năng lượng tăng',
      triggerMetric: 'BRENT_OIL',
      triggerDirection: 'UP',
      steps: [
        { order: 1, node: 'Giá dầu Brent thô ↑', impact: 'Doanh thu và giá bán sản phẩm khí/dầu của khối thượng nguồn & trung nguồn tăng', direction: 'POSITIVE' },
        { order: 2, node: 'Chi phí nhiên liệu đầu vào ↑', impact: 'Chi phí nhiên liệu máy bay, cước vận tải và nguyên liệu hóa chất tăng', direction: 'NEGATIVE' },
        { order: 3, node: 'Áp lực lạm phát CPI ↑', impact: 'Giá xăng dầu tiêu dùng trong nước tăng gây áp lực lên chỉ số giá tiêu dùng CPI', direction: 'NEGATIVE' },
        { order: 4, node: 'Phân hóa dòng tiền ngành', impact: 'Dòng tiền đầu cơ tập trung vào nhóm Dầu khí (PVD, PVS, BSR, GAS)', direction: 'POSITIVE' },
      ],
      affectedSectors: [
        { sector: 'Dầu khí (Thượng/Trung nguồn)', impact: 'POSITIVE' },
        { sector: 'Hàng không & Vận tải', impact: 'NEGATIVE' },
        { sector: 'Phân bón & Hóa chất', impact: 'MIXED' },
        { sector: 'Nhựa & Bao bì', impact: 'NEGATIVE' },
      ],
      explanationVi: 'Giá dầu tăng trực tiếp cải thiện biên lợi nhuận nhóm Dầu khí thượng nguồn và lọc hóa dầu, nhưng gia tăng áp lực chi phí nhiên liệu lên ngành Hàng không và Vận tải đường bộ.',
      confidence: 90,
    },
    {
      id: 'CHAIN_DOMESTIC_LIQUIDITY_EXPANSION',
      title: 'Nới lỏng thanh khoản & Tăng trưởng tín dụng',
      triggerMetric: 'VN_CREDIT_GROWTH',
      triggerDirection: 'UP',
      steps: [
        { order: 1, node: 'Tín dụng & Cung tiền M2 ↑', impact: 'Lượng tiền lưu thông trong nền kinh tế và hệ thống ngân hàng dồi dào', direction: 'POSITIVE' },
        { order: 2, node: 'Lãi suất liên ngân hàng / OMO ↓', impact: 'Chi phí vốn các ngân hàng thương mại giảm', direction: 'POSITIVE' },
        { order: 3, node: 'Thanh khoản thị trường chứng khoán ↑', impact: 'Dòng tiền nhàn rỗi dịch chuyển từ tiền gửi tiết kiệm sang kênh cổ phiếu', direction: 'POSITIVE' },
        { order: 4, node: 'Mở rộng định giá P/E toàn thị trường', impact: 'Thanh khoản cao kích hoạt đà tăng giá đa số nhóm ngành trên HOSE/HNX', direction: 'POSITIVE' },
      ],
      affectedSectors: [
        { sector: 'Chứng khoán', impact: 'POSITIVE' },
        { sector: 'Ngân hàng', impact: 'POSITIVE' },
        { sector: 'Bất động sản', impact: 'POSITIVE' },
        { sector: 'Bán lẻ & Tiêu dùng', impact: 'POSITIVE' },
      ],
      explanationVi: 'Tăng trưởng tín dụng và cung tiền mở rộng làm giảm lãi suất huy động, tạo động lực mạnh mẽ đưa dòng tiền cá nhân vào thị trường chứng khoán, hỗ trợ trực tiếp nhóm Chứng khoán và Ngân hàng.',
      confidence: 95,
    },
    {
      id: 'CHAIN_GLOBAL_VIX_SPIKE',
      title: 'Biến động rủi ro toàn cầu (VIX Spike)',
      triggerMetric: 'GLOBAL_VIX',
      triggerDirection: 'UP',
      steps: [
        { order: 1, node: 'Chỉ số VIX > 25 pts', impact: 'Tâm lý sợ hãi bao trùm thị trường chứng khoán Mỹ và toàn cầu', direction: 'NEGATIVE' },
        { order: 2, node: 'Chế độ Risk-Off kích hoạt', impact: 'Nhà đầu tư tổ chức giảm đòn bẩy và tái phân bổ sang tài sản an toàn (Vàng, TPCP Mỹ)', direction: 'NEGATIVE' },
        { order: 3, node: 'Thị trường phái sinh biến động mạnh', impact: 'Basis VN30F chiết khấu âm sâu, khối ngoại gia tăng vị thế Short phòng hộ', direction: 'NEGATIVE' },
      ],
      affectedSectors: [
        { sector: 'Cổ phiếu Beta cao', impact: 'NEGATIVE' },
        { sector: 'Điện & Tiện ích (Phòng thủ)', impact: 'POSITIVE' },
        { sector: 'Dược phẩm & Y tế', impact: 'POSITIVE' },
      ],
      explanationVi: 'Khi chỉ số VIX tăng vọt, tâm lý phòng thủ toàn cầu kích hoạt đà bán tháo trên các tài sản rủi ro, dòng tiền có xu hướng dịch chuyển sang nhóm cổ phiếu phòng thủ (Điện nước, Dược phẩm) có cổ tức tiền mặt cao.',
      confidence: 88,
    },
  ];

  /**
   * Returns all pre-compiled causal impact chains
   */
  public static getCausalChains(): readonly MacroCausalChain[] {
    return this.CANONICAL_CHAINS;
  }

  /**
   * Evaluates and returns active transmission chains corresponding to observed market conditions
   */
  public static evaluateActiveChains(activeTriggers: ReadonlySet<string>): readonly MacroCausalChain[] {
    return this.CANONICAL_CHAINS.filter((chain) => activeTriggers.has(chain.triggerMetric));
  }
}
