import { MarketExchange } from '../../types/stock';

export interface StockMetadata {
  symbol: string;
  companyName: string;
  exchange: MarketExchange;
  sector: string;
  sectorId: string;
  isVN30?: boolean;
}

export const VIETNAM_STOCKS_UNIVERSE: StockMetadata[] = [
  // --- VN30 ---
  { symbol: 'HPG', companyName: 'CTCP Tập đoàn Hòa Phát', exchange: 'HOSE', sector: 'Thép & Vật liệu', sectorId: 'materials', isVN30: true },
  { symbol: 'FPT', companyName: 'CTCP FPT', exchange: 'HOSE', sector: 'Công nghệ thông tin', sectorId: 'technology', isVN30: true },
  { symbol: 'VNM', companyName: 'CTCP Sữa Việt Nam (Vinamilk)', exchange: 'HOSE', sector: 'Thực phẩm & Đồ uống', sectorId: 'consumer_staples', isVN30: true },
  { symbol: 'VIC', companyName: 'Tập đoàn Vingroup', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate', isVN30: true },
  { symbol: 'VHM', companyName: 'CTCP Vinhomes', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate', isVN30: true },
  { symbol: 'VRE', companyName: 'CTCP Vincom Retail', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate', isVN30: true },
  { symbol: 'SSI', companyName: 'CTCP Chứng khoán SSI', exchange: 'HOSE', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services', isVN30: true },
  { symbol: 'TCB', companyName: 'Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'MBB', companyName: 'Ngân hàng TMCP Quân Đội (MBBank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'VPB', companyName: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'ACB', companyName: 'Ngân hàng TMCP Á Châu', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'VCB', companyName: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'BID', companyName: 'Ngân hàng TMCP Đầu tư và Phát triển VN (BIDV)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'CTG', companyName: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'STB', companyName: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'HDB', companyName: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'TPB', companyName: 'Ngân hàng TMCP Tiên Phong (TPBank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'VIB', companyName: 'Ngân hàng TMCP Quốc tế Việt Nam', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'SHB', companyName: 'Ngân hàng TMCP Sài Gòn - Hà Nội', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'SSB', companyName: 'Ngân hàng TMCP Đông Nam Á (SeABank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking', isVN30: true },
  { symbol: 'MWG', companyName: 'CTCP Đầu tư Thế Giới Di Động', exchange: 'HOSE', sector: 'Bán lẻ', sectorId: 'retail', isVN30: true },
  { symbol: 'MSN', companyName: 'CTCP Tập đoàn Masan', exchange: 'HOSE', sector: 'Thực phẩm & Đồ uống', sectorId: 'consumer_staples', isVN30: true },
  { symbol: 'SAB', companyName: 'Tổng CTCP Bia - Rượu - Nước giải khát Sài Gòn (Sabeco)', exchange: 'HOSE', sector: 'Thực phẩm & Đồ uống', sectorId: 'consumer_staples', isVN30: true },
  { symbol: 'GAS', companyName: 'Tổng Công ty Khí Việt Nam (PV Gas)', exchange: 'HOSE', sector: 'Dầu khí & Năng lượng', sectorId: 'energy', isVN30: true },
  { symbol: 'POW', companyName: 'Tổng Công ty Điện lực Dầu khí Việt Nam', exchange: 'HOSE', sector: 'Tiện ích & Năng lượng', sectorId: 'utilities', isVN30: true },
  { symbol: 'PLX', companyName: 'Tập đoàn Xăng dầu Việt Nam (Petrolimex)', exchange: 'HOSE', sector: 'Dầu khí & Năng lượng', sectorId: 'energy', isVN30: true },
  { symbol: 'GVR', companyName: 'Tập đoàn Công nghiệp Cao su Việt Nam', exchange: 'HOSE', sector: 'Hóa chất & Cao su', sectorId: 'chemicals', isVN30: true },
  { symbol: 'BCM', companyName: 'Tổng CTCP Đầu tư và Phát triển Công nghiệp (Becamex)', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate', isVN30: true },
  { symbol: 'VJC', companyName: 'CTCP Hàng không Vietjet', exchange: 'HOSE', sector: 'Vận tải & Hàng không', sectorId: 'logistics', isVN30: true },
  { symbol: 'BVH', companyName: 'Tập đoàn Bảo Việt', exchange: 'HOSE', sector: 'Bảo hiểm', sectorId: 'insurance', isVN30: true },

  // --- MIDCAP LIQUID STOCKS ---
  // Chứng khoán
  { symbol: 'VND', companyName: 'CTCP Chứng khoán VNDIRECT', exchange: 'HOSE', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services' },
  { symbol: 'VCI', companyName: 'CTCP Chứng khoán Vietcap', exchange: 'HOSE', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services' },
  { symbol: 'HCM', companyName: 'CTCP Chứng khoán TP.HCM (HSC)', exchange: 'HOSE', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services' },
  { symbol: 'SHS', companyName: 'CTCP Chứng khoán Sài Gòn - Hà Nội', exchange: 'HNX', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services' },
  { symbol: 'MBS', companyName: 'CTCP Chứng khoán MB', exchange: 'HNX', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services' },
  { symbol: 'FTS', companyName: 'CTCP Chứng khoán FPT', exchange: 'HOSE', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services' },
  { symbol: 'BSI', companyName: 'CTCP Chứng khoán BIDV', exchange: 'HOSE', sector: 'Dịch vụ tài chính (Chứng khoán)', sectorId: 'financial_services' },

  // Bất động sản & Xây dựng
  { symbol: 'DXG', companyName: 'CTCP Tập đoàn Đất Xanh', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate' },
  { symbol: 'DIG', companyName: 'Tổng CTCP Đầu tư Phát triển Xây dựng (DIC Corp)', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate' },
  { symbol: 'KBC', companyName: 'Tổng CTCP Phát triển Đô thị Kinh Bắc', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate' },
  { symbol: 'KDH', companyName: 'CTCP Đầu tư và Kinh doanh Nhà Khang Điền', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate' },
  { symbol: 'NLG', companyName: 'CTCP Đầu tư Nam Long', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate' },
  { symbol: 'PDR', companyName: 'CTCP Phát triển Bất động sản Phát Đạt', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate' },
  { symbol: 'CEO', companyName: 'CTCP Tập đoàn C.E.O', exchange: 'HNX', sector: 'Bất động sản', sectorId: 'real_estate' },

  // Thép & Kim loại
  { symbol: 'HSG', companyName: 'CTCP Tập đoàn Hoa Sen', exchange: 'HOSE', sector: 'Thép & Vật liệu', sectorId: 'materials' },
  { symbol: 'NKG', companyName: 'CTCP Thép Nam Kim', exchange: 'HOSE', sector: 'Thép & Vật liệu', sectorId: 'materials' },

  // Dầu khí & Năng lượng
  { symbol: 'PVD', companyName: 'Tổng CTCP Khoan và Dịch vụ Khoan Dầu khí', exchange: 'HOSE', sector: 'Dầu khí & Năng lượng', sectorId: 'energy' },
  { symbol: 'PVS', companyName: 'Tổng CTCP Dịch vụ Kỹ thuật Dầu khí Việt Nam', exchange: 'HNX', sector: 'Dầu khí & Năng lượng', sectorId: 'energy' },
  { symbol: 'BSR', companyName: 'CTCP Lọc hóa dầu Bình Sơn', exchange: 'UPCOM', sector: 'Dầu khí & Năng lượng', sectorId: 'energy' },
  { symbol: 'PVT', companyName: 'Tổng CTCP Vận tải Dầu khí', exchange: 'HOSE', sector: 'Dầu khí & Năng lượng', sectorId: 'energy' },

  // Hóa chất & Phân bón
  { symbol: 'DGC', companyName: 'CTCP Tập đoàn Hóa chất Đức Giang', exchange: 'HOSE', sector: 'Hóa chất & Cao su', sectorId: 'chemicals' },
  { symbol: 'DPM', companyName: 'Tổng CTCP Phân bón và Hóa chất Dầu khí (Đạm Phú Mỹ)', exchange: 'HOSE', sector: 'Hóa chất & Cao su', sectorId: 'chemicals' },
  { symbol: 'DCM', companyName: 'CTCP Phân bón Dầu khí Cà Mau (Đạm Cà Mau)', exchange: 'HOSE', sector: 'Hóa chất & Cao su', sectorId: 'chemicals' },

  // Bán lẻ & Tiêu dùng
  { symbol: 'FRT', companyName: 'CTCP Bán lẻ Kỹ thuật số FPT (FPT Retail)', exchange: 'HOSE', sector: 'Bán lẻ', sectorId: 'retail' },
  { symbol: 'PNJ', companyName: 'CTCP Vàng bạc Đá quý Phú Nhuận', exchange: 'HOSE', sector: 'Bán lẻ', sectorId: 'retail' },
  { symbol: 'DGW', companyName: 'CTCP Thế Giới Số (Digiworld)', exchange: 'HOSE', sector: 'Bán lẻ', sectorId: 'retail' },

  // Nông nghiệp & Thủy sản
  { symbol: 'DBC', companyName: 'CTCP Tập đoàn Dabaco Việt Nam', exchange: 'HOSE', sector: 'Nông nghiệp & Thực phẩm', sectorId: 'agriculture' },
  { symbol: 'VHC', companyName: 'CTCP Vĩnh Hoàn', exchange: 'HOSE', sector: 'Thủy sản', sectorId: 'seafood' },
  { symbol: 'ANV', companyName: 'CTCP Nam Việt', exchange: 'HOSE', sector: 'Thủy sản', sectorId: 'seafood' },

  // Vận tải & Logistics
  { symbol: 'GMD', companyName: 'CTCP Gemadept', exchange: 'HOSE', sector: 'Cảng biển & Logistics', sectorId: 'logistics' },
  { symbol: 'HAH', companyName: 'CTCP Vận tải và Xếp dỡ Hải An', exchange: 'HOSE', sector: 'Cảng biển & Logistics', sectorId: 'logistics' },

  // Điện & Năng lượng tái tạo & Xây lắp
  { symbol: 'REE', companyName: 'CTCP Cơ Điện Lạnh', exchange: 'HOSE', sector: 'Tiện ích & Năng lượng', sectorId: 'utilities' },
  { symbol: 'PC1', companyName: 'CTCP Tập đoàn PC1', exchange: 'HOSE', sector: 'Tiện ích & Năng lượng', sectorId: 'utilities' },
  { symbol: 'HDG', companyName: 'CTCP Tập đoàn Hà Đô', exchange: 'HOSE', sector: 'Bất động sản', sectorId: 'real_estate' },
  { symbol: 'GEX', companyName: 'CTCP Tập đoàn GELEX', exchange: 'HOSE', sector: 'Công nghiệp & Thiết bị điện', sectorId: 'industrials' },
  { symbol: 'HHV', companyName: 'CTCP Đầu tư Hạ tầng Giao thông Đèo Cả', exchange: 'HOSE', sector: 'Hạ tầng & Xây dựng', sectorId: 'infrastructure' },
  { symbol: 'VCG', companyName: 'Tổng CTCP Xuất nhập khẩu và Xây dựng Việt Nam (Vinaconex)', exchange: 'HOSE', sector: 'Hạ tầng & Xây dựng', sectorId: 'infrastructure' },
  { symbol: 'LPB', companyName: 'Ngân hàng TMCP Lộc Phát Việt Nam (LPBank)', exchange: 'HOSE', sector: 'Ngân hàng', sectorId: 'banking' },
];

export const UNIVERSE_SYMBOLS = VIETNAM_STOCKS_UNIVERSE.map((s) => s.symbol);

export const SECTOR_MAP: Record<string, { name: string; id: string }> = {
  banking: { name: 'Ngân hàng', id: 'banking' },
  real_estate: { name: 'Bất động sản', id: 'real_estate' },
  financial_services: { name: 'Dịch vụ tài chính (Chứng khoán)', id: 'financial_services' },
  materials: { name: 'Thép & Vật liệu', id: 'materials' },
  technology: { name: 'Công nghệ thông tin', id: 'technology' },
  retail: { name: 'Bán lẻ tiêu dùng', id: 'retail' },
  energy: { name: 'Dầu khí & Năng lượng', id: 'energy' },
  consumer_staples: { name: 'Thực phẩm & Đồ uống', id: 'consumer_staples' },
  chemicals: { name: 'Hóa chất & Phân bón', id: 'chemicals' },
  utilities: { name: 'Điện & Tiện ích', id: 'utilities' },
  logistics: { name: 'Cảng biển & Logistics', id: 'logistics' },
  agriculture: { name: 'Nông nghiệp & Chăn nuôi', id: 'agriculture' },
  seafood: { name: 'Thủy hải sản xuất khẩu', id: 'seafood' },
  insurance: { name: 'Bảo hiểm', id: 'insurance' },
  industrials: { name: 'Công nghiệp & Thiết bị điện', id: 'industrials' },
  infrastructure: { name: 'Hạ tầng giao thông & Xây lắp', id: 'infrastructure' },
};
