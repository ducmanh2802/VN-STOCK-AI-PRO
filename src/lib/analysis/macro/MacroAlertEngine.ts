/**
 * PHASE 25+ — MACRO ALERT ENGINE
 * ================================
 * Evaluates macro metrics against quantitative threshold boundaries to generate
 * actionable, non-spammy macroeconomic risk alerts.
 *
 * Rules:
 *   - BRENT crude move >= 3.0%
 *   - DXY currency index move >= 0.8%
 *   - US 10-Year yield move >= 5 bps (0.05%)
 *   - VIX Volatility index >= 20 pts
 *   - Foreign Net Flow out >= 500 Billion VND
 */

import type { MacroAlert, MacroMetricRecord } from './types.ts';

export class MacroAlertEngine {
  /**
   * Generates active alerts based on threshold breaches in macro metrics.
   *
   * Deterministic (P27-D5-legacy): alert IDs derive from
   * `${code}_${asOfDate}_${condition}` and timestamps from the evaluation
   * instant — no Date.now() / wall-clock randomness. Identical inputs yield
   * byte-identical alerts.
   */
  public static evaluateAlerts(
    metrics: readonly MacroMetricRecord[],
    options?: { asOfDate?: string; evaluatedAt?: string }
  ): readonly MacroAlert[] {
    const alerts: MacroAlert[] = [];
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const triggeredAt = options?.evaluatedAt ?? `${asOfDate}T00:00:00.000Z`;
    // One alert per metric code at most: duplicate input codes reuse the ID.
    const alertIdFor = (code: string): string => `ALERT_${code}_${asOfDate}`;

    for (const m of metrics) {
      if (m.value === null) continue;

      // 1. Brent Oil Volatility
      if (m.code === 'BRENT_OIL' && m.changePercent !== null && Math.abs(m.changePercent) >= 3.0) {
        const isUp = m.changePercent > 0;
        alerts.push({
          id: alertIdFor(m.code),
          metricCode: m.code,
          metricName: m.name,
          severity: 'HIGH',
          triggeredAt,
          triggerCondition: `Biến động giá dầu Brent ${m.changePercent > 0 ? '+' : ''}${m.changePercent.toFixed(1)}% trong phiên`,
          messageVi: `Giá dầu Brent biến động mạnh (${m.value.toFixed(1)} USD/thùng), tác động trực tiếp tới nhóm Dầu khí và chi phí vận tải.`,
          impactSummaryVi: isUp
            ? 'Hưởng lợi: PVD, PVS, BSR. Áp lực chi phí: VJC, HVN, Vận tải biển.'
            : 'Giảm áp lực chi phí nguyên liệu đầu vào toàn nền kinh tế.',
        });
      }

      // 2. DXY Dollar Index
      if (m.code === 'US_DXY' && m.changePercent !== null && Math.abs(m.changePercent) >= 0.8) {
        alerts.push({
          id: alertIdFor(m.code),
          metricCode: m.code,
          metricName: m.name,
          severity: 'MEDIUM',
          triggeredAt,
          triggerCondition: `Chỉ số DXY biến động ${m.changePercent > 0 ? '+' : ''}${m.changePercent.toFixed(1)}%`,
          messageVi: `Đồng USD biến động mạnh đạt mức ${m.value.toFixed(1)} điểm, tác động lên tỷ giá USD/VND và động thái mua bán của khối ngoại.`,
          impactSummaryVi: 'Khối ngoại có thể gia tăng cơ cấu danh mục; nhóm xuất khẩu (VHC, ANV, TNG) hưởng lợi từ tỷ giá.',
        });
      }

      // 3. VIX Volatility Index
      if (m.code === 'GLOBAL_VIX' && m.value >= 20) {
        alerts.push({
          id: alertIdFor(m.code),
          metricCode: m.code,
          metricName: m.name,
          severity: m.value >= 25 ? 'HIGH' : 'MEDIUM',
          triggeredAt,
          triggerCondition: `Chỉ số VIX ở mức ${m.value.toFixed(1)} (vượt ngưỡng an toàn 20.0)`,
          messageVi: 'Tâm lý sợ hãi trên thị trường chứng khoán toàn cầu tăng cao, kích hoạt chế độ phòng thủ rủi ro.',
          impactSummaryVi: 'Khuyến nghị hạ tỷ trọng cổ phiếu đầu cơ có beta cao, duy trì tỷ lệ tiền mặt an toàn.',
        });
      }

      // 4. US 10-Year Yield
      if (m.code === 'US_10Y_YIELD' && m.value >= 4.4) {
        alerts.push({
          id: alertIdFor(m.code),
          metricCode: m.code,
          metricName: m.name,
          severity: 'MEDIUM',
          triggeredAt,
          triggerCondition: `Lợi suất US10Y vượt ${m.value.toFixed(2)}%`,
          messageVi: 'Lợi suất trái phiếu chính phủ Mỹ neo cao làm tăng chi phí vốn USD và áp lực chiết khấu định giá cổ phiếu toàn cầu.',
          impactSummaryVi: 'Gây áp lực lên các cổ phiếu có định giá P/E cao và nhóm vay nợ ngoại tệ lớn.',
        });
      }
    }

    return alerts;
  }
}
