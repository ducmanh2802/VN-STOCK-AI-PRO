/**
 * PHASE 25+ — SECTOR MACRO SENSITIVITY ENGINE
 * ============================================
 * Quantitative sensitivity matrix mapping Vietnamese ICB industry sectors
 * to macroeconomic drivers, interest rate sensitivity, FX exposure, and commodity beta.
 *
 * Invariants:
 *   - Pure deterministic domain mapping
 *   - Analytical relationships, NOT dynamic investment solicitations
 */

import type { SectorMacroSensitivity } from './types.ts';

export class MacroSensitivityEngine {
  private static readonly SECTOR_MATRIX: readonly SectorMacroSensitivity[] = [
    {
      sectorId: 'OIL_GAS',
      sectorNameVi: 'Dầu khí & Năng lượng',
      primaryDriver: 'Giá dầu Brent / WTI',
      secondaryDriver: 'Tỷ giá USD/VND (Dự án thanh toán bằng USD)',
      direction: 'POSITIVE',
      sensitivity: 'HIGH',
      rationaleVi: 'Doanh thu giá dịch vụ giàn khoan (PVD) và chế tạo cơ khí dầu khí (PVS), biên lọc dầu (BSR) tương quan thuận chiều mạnh với giá dầu thô thế giới.',
      keyStocks: ['PVD', 'PVS', 'BSR', 'GAS', 'PLX', 'PVT'],
    },
    {
      sectorId: 'BANKING',
      sectorNameVi: 'Ngân hàng',
      primaryDriver: 'Lãi suất điều hành & NIM',
      secondaryDriver: 'Tăng trưởng tín dụng & Nợ xấu',
      direction: 'POSITIVE',
      sensitivity: 'HIGH',
      rationaleVi: 'Thanh khoản hệ thống mở rộng và tăng trưởng tín dụng hỗ trợ tăng thu nhập lãi thuần, tuy nhiên biến động lãi suất nhanh có thể gây áp lực lên biên lãi ròng (NIM).',
      keyStocks: ['VCB', 'BID', 'CTG', 'TCB', 'MBB', 'ACB', 'VPB', 'HDB', 'STB'],
    },
    {
      sectorId: 'SECURITIES',
      sectorNameVi: 'Chứng khoán',
      primaryDriver: 'Thanh khoản thị trường & Dư nợ Margin',
      secondaryDriver: 'Mặt bằng lãi suất tiền gửi',
      direction: 'POSITIVE',
      sensitivity: 'HIGH',
      rationaleVi: 'Thanh khoản HOSE/HNX tăng trực tiếp khuếch đại doanh thu phí môi giới và lãi cho vay margin; danh mục tự doanh hưởng lợi từ định giá P/E mở rộng.',
      keyStocks: ['SSI', 'VND', 'VCI', 'HCM', 'SHS', 'MBS', 'FTS', 'BSI'],
    },
    {
      sectorId: 'REAL_ESTATE',
      sectorNameVi: 'Bất động sản',
      primaryDriver: 'Lãi suất cho vay & Pháp lý dự án',
      secondaryDriver: 'Tăng trưởng tín dụng BĐS',
      direction: 'NEGATIVE',
      sensitivity: 'HIGH',
      rationaleVi: 'Ngành có hệ số đòn bẩy tài chính cao; lãi suất tăng làm tăng chi phí lãi vay và giảm sức cầu mua nhà trả góp của người tiêu dùng.',
      keyStocks: ['VHM', 'NVL', 'DXG', 'DIG', 'PDR', 'KDH', 'NLG', 'CEO'],
    },
    {
      sectorId: 'STEEL_MATERIALS',
      sectorNameVi: 'Thép & Vật liệu xây dựng',
      primaryDriver: 'Giá thép thanh / HRC & Quặng sắt thế giới',
      secondaryDriver: 'Giải ngân đầu tư công & BĐS Trung Quốc',
      direction: 'MIXED',
      sensitivity: 'MEDIUM',
      rationaleVi: 'Biên lợi nhuận gộp phụ thuộc chênh lệch giá bán thép HRC và giá than cốc/quặng sắt; tốc độ giải ngân vốn đầu tư công là động lực tiêu thụ nội địa chính.',
      keyStocks: ['HPG', 'HSG', 'NKG', 'VGS'],
    },
    {
      sectorId: 'AVIATION_TRANSPORT',
      sectorNameVi: 'Hàng không & Vận tải biển',
      primaryDriver: 'Giá nhiên liệu Jet A1 & Cước tàu',
      secondaryDriver: 'Tỷ giá USD/VND (Dư nợ thuê tàu bay USD)',
      direction: 'NEGATIVE',
      sensitivity: 'HIGH',
      rationaleVi: 'Nhiên liệu chiếm 30-40% tổng chi phí vận hành; biến động tăng của giá dầu và tỷ giá USD làm tăng chi phí tài chính đáng kể.',
      keyStocks: ['VJC', 'HVN', 'HAH', 'GMD', 'VOS'],
    },
    {
      sectorId: 'EXPORTERS',
      sectorNameVi: 'Dệt may & Thủy sản xuất khẩu',
      primaryDriver: 'Tỷ giá USD/VND & Sức cầu tiêu dùng Mỹ/EU',
      secondaryDriver: 'Chi phí logistics & cước vận tải biển',
      direction: 'POSITIVE',
      sensitivity: 'MEDIUM',
      rationaleVi: 'Doanh thu ghi nhận bằng USD nên VND giảm giá mang lại lợi thế tỷ giá và ghi nhận lãi chênh lệch tỷ giá hoạt động kinh doanh.',
      keyStocks: ['VHC', 'ANV', 'TNG', 'MSH', 'STK', 'FMC'],
    },
    {
      sectorId: 'RETAIL_CONSUMER',
      sectorNameVi: 'Bán lẻ & Tiêu dùng',
      primaryDriver: 'Thu nhập khả dụng & Lạm phát CPI',
      secondaryDriver: 'Lãi suất tiêu dùng & Thuế VAT',
      direction: 'POSITIVE',
      sensitivity: 'MEDIUM',
      rationaleVi: 'Lạm phát thấp và chính sách giảm thuế kích thích chi tiêu hộ gia đình, thúc đẩy doanh thu bán lẻ hàng tiêu dùng thiết yếu và điện tử.',
      keyStocks: ['MWG', 'FRT', 'PNJ', 'MSN', 'VNM', 'DGW'],
    },
    {
      sectorId: 'TECHNOLOGY',
      sectorNameVi: 'Công nghệ thông tin',
      primaryDriver: 'Chi tiêu chuyển đổi số toàn cầu (DX)',
      secondaryDriver: 'Tỷ giá USD, JPY (Doanh thu thị trường nước ngoài)',
      direction: 'POSITIVE',
      sensitivity: 'LOW',
      rationaleVi: 'Doanh thu ký mới hợp đồng xuất khẩu phần mềm toàn cầu duy trì ổn định; ít phụ thuộc vào chu kỳ tín dụng hoặc biến động hàng hóa.',
      keyStocks: ['FPT', 'CMG', 'ELC', 'ITD'],
    },
  ];

  /**
   * Returns all sector sensitivity mappings
   */
  public static getAllSensitivities(): readonly SectorMacroSensitivity[] {
    return this.SECTOR_MATRIX;
  }

  /**
   * Finds sensitivity profile by sector ID
   */
  public static getSensitivityBySector(sectorId: string): SectorMacroSensitivity | undefined {
    return this.SECTOR_MATRIX.find(
      (s) => s.sectorId.toUpperCase() === sectorId.trim().toUpperCase()
    );
  }

  /**
   * Identifies sensitivity profile for a specific stock ticker
   */
  public static getSensitivityForStock(symbol: string): SectorMacroSensitivity | undefined {
    const sym = symbol.trim().toUpperCase();
    return this.SECTOR_MATRIX.find((s) => s.keyStocks.includes(sym));
  }
}
