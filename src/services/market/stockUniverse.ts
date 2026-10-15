export interface StockMetadata {
  symbol: string;
  companyName: string;
  companyNameEn?: string;
  exchange: 'HOSE' | 'HNX' | 'UPCOM';
  sector: string;
  industry?: string;
  marketCap?: number;
  isVN30?: boolean;
  isVN100?: boolean;
  isDiamond?: boolean;
  isFinlead?: boolean;
}

export const VIETNAM_STOCKS_UNIVERSE: readonly StockMetadata[] = [
  { symbol: 'HPG', companyName: 'Tập đoàn Hòa Phát', exchange: 'HOSE', sector: 'Thép & Vật liệu xây dựng', isVN30: true, isVN100: true },
  { symbol: 'VCB', companyName: 'NHTMCP Ngoại Thương Việt Nam (Vietcombank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'FPT', companyName: 'Tập đoàn FPT', exchange: 'HOSE', sector: 'Công nghệ thông tin', isVN30: true, isVN100: true },
  { symbol: 'MWG', companyName: 'CTCP Đầu tư Thế Giới Di Động', exchange: 'HOSE', sector: 'Bán lẻ', isVN30: true, isVN100: true },
  { symbol: 'VNM', companyName: 'CTCP Sữa Việt Nam (Vinamilk)', exchange: 'HOSE', sector: 'Thực phẩm & Đồ uống', isVN30: true, isVN100: true },
  { symbol: 'MSN', companyName: 'CTCP Tập đoàn Masan', exchange: 'HOSE', sector: 'Hàng tiêu dùng', isVN30: true, isVN100: true },
  { symbol: 'VIC', companyName: 'Tập đoàn Vingroup', exchange: 'HOSE', sector: 'Bất động sản', isVN30: true, isVN100: true },
  { symbol: 'VHM', companyName: 'CTCP Vinhomes', exchange: 'HOSE', sector: 'Bất động sản', isVN30: true, isVN100: true },
  { symbol: 'VRE', companyName: 'CTCP Vincom Retail', exchange: 'HOSE', sector: 'Bất động sản bán lẻ', isVN30: true, isVN100: true },
  { symbol: 'SSI', companyName: 'CTCP Chứng khoán SSI', exchange: 'HOSE', sector: 'Dịch vụ tài chính / Chứng khoán', isVN30: true, isVN100: true },
  { symbol: 'VND', companyName: 'CTCP Chứng khoán VNDIRECT', exchange: 'HOSE', sector: 'Dịch vụ tài chính / Chứng khoán', isVN100: true },
  { symbol: 'TCB', companyName: 'NHTMCP Kỹ Thương Việt Nam (Techcombank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'MBB', companyName: 'NHTMCP Quân Đội (MBBank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'ACB', companyName: 'NHTMCP Á Châu', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'BID', companyName: 'NHTMCP Đầu tư & Phát triển Việt Nam', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'CTG', companyName: 'NHTMCP Công Thương Việt Nam (VietinBank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'STB', companyName: 'NHTMCP Sài Gòn Thương Tín (Sacombank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'VPB', companyName: 'NHTMCP Việt Nam Thịnh Vượng', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'HDB', companyName: 'NHTMCP Phát triển TP.HCM (HDBank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'TPB', companyName: 'NHTMCP Tiên Phong (TPBank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'VIB', companyName: 'NHTMCP Quốc tế Việt Nam', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'GAS', companyName: 'Tổng Công ty Khí Việt Nam (PV Gas)', exchange: 'HOSE', sector: 'Dầu khí & Năng lượng', isVN30: true, isVN100: true },
  { symbol: 'PLX', companyName: 'Tập đoàn Xăng Dầu Việt Nam (Petrolimex)', exchange: 'HOSE', sector: 'Dầu khí & Năng lượng', isVN30: true, isVN100: true },
  { symbol: 'POW', companyName: 'Tổng CT Điện lực Dầu khí Việt Nam', exchange: 'HOSE', sector: 'Điện lực & Năng lượng', isVN30: true, isVN100: true },
  { symbol: 'SAB', companyName: 'Tổng CT CP Bia - Rượu - Nước giải khát Sài Gòn', exchange: 'HOSE', sector: 'Thực phẩm & Đồ uống', isVN30: true, isVN100: true },
  { symbol: 'GVR', companyName: 'Tập đoàn Công nghiệp Cao su Việt Nam', exchange: 'HOSE', sector: 'Hóa chất & Cao su', isVN30: true, isVN100: true },
  { symbol: 'DGC', companyName: 'CTCP Tập đoàn Hóa chất Đức Giang', exchange: 'HOSE', sector: 'Hóa chất', isVN100: true },
  { symbol: 'KDH', companyName: 'CTCP Đầu tư và Kinh doanh Nhà Khang Điền', exchange: 'HOSE', sector: 'Bất động sản', isVN30: true, isVN100: true },
  { symbol: 'NLG', companyName: 'CTCP Đầu tư Nam Long', exchange: 'HOSE', sector: 'Bất động sản', isVN100: true },
  { symbol: 'PDR', companyName: 'CTCP Phát triển Bất động sản Phát Đạt', exchange: 'HOSE', sector: 'Bất động sản', isVN100: true },
  { symbol: 'DIG', companyName: 'Tổng CTCP Đầu tư Phát triển Xây dựng', exchange: 'HOSE', sector: 'Bất động sản', isVN100: true },
  { symbol: 'DXG', companyName: 'CTCP Tập đoàn Đất Xanh', exchange: 'HOSE', sector: 'Bất động sản', isVN100: true },
  { symbol: 'KBC', companyName: 'Tổng CT Phát triển Đô thị Kinh Bắc', exchange: 'HOSE', sector: 'Bất động sản KCN', isVN100: true },
  { symbol: 'HSG', companyName: 'CTCP Tập đoàn Hoa Sen', exchange: 'HOSE', sector: 'Thép & Vật liệu xây dựng', isVN100: true },
  { symbol: 'NKG', companyName: 'CTCP Thép Nam Kim', exchange: 'HOSE', sector: 'Thép & Vật liệu xây dựng', isVN100: true },
  { symbol: 'PVD', companyName: 'Tổng CTCP Khoan & Dịch vụ Khoan Dầu khí', exchange: 'HOSE', sector: 'Dầu khí', isVN100: true },
  { symbol: 'PVS', companyName: 'Tổng CTCP Dịch vụ Kỹ thuật Dầu khí Việt Nam', exchange: 'HNX', sector: 'Dầu khí', isVN100: true },
  { symbol: 'PVT', companyName: 'Tổng CTCP Vận tải Dầu khí', exchange: 'HOSE', sector: 'Vận tải dầu khí', isVN100: true },
  { symbol: 'BSR', companyName: 'CTCP Lọc Hóa dầu Bình Sơn', exchange: 'UPCOM', sector: 'Lọc hóa dầu' },
  { symbol: 'REE', companyName: 'CTCP Cơ Điện Lạnh', exchange: 'HOSE', sector: 'Cơ điện lạnh & Hạ tầng', isVN100: true },
  { symbol: 'GEX', companyName: 'CTCP Tập đoàn GELEX', exchange: 'HOSE', sector: 'Thiết bị điện & Hạ tầng', isVN100: true },
  { symbol: 'VHC', companyName: 'CTCP Vĩnh Hoàn', exchange: 'HOSE', sector: 'Thủy sản', isVN100: true },
  { symbol: 'ANV', companyName: 'CTCP Nam Việt', exchange: 'HOSE', sector: 'Thủy sản' },
  { symbol: 'DBC', companyName: 'CTCP Tập đoàn Dabaco Việt Nam', exchange: 'HOSE', sector: 'Nông nghiệp & Chăn nuôi' },
  { symbol: 'BMP', companyName: 'CTCP Nhựa Bình Minh', exchange: 'HOSE', sector: 'Nhựa & Vật liệu xây dựng' },
  { symbol: 'NTP', companyName: 'CTCP Nhựa Thiếu niên Tiền Phong', exchange: 'HNX', sector: 'Nhựa & Vật liệu xây dựng' },
  { symbol: 'VGC', companyName: 'Tổng CT Viglacera - CTCP', exchange: 'HOSE', sector: 'Vật liệu xây dựng & KCN', isVN100: true },
  { symbol: 'DGW', companyName: 'CTCP Thế Giới Số (Digiworld)', exchange: 'HOSE', sector: 'Bán lẻ công nghệ', isVN100: true },
  { symbol: 'FRT', companyName: 'CTCP Bán lẻ Kỹ thuật số FPT', exchange: 'HOSE', sector: 'Bán lẻ dược phẩm & công nghệ', isVN100: true },
  { symbol: 'VPI', companyName: 'CTCP Đầu tư Văn Phú - Invest', exchange: 'HOSE', sector: 'Bất động sản', isVN100: true },
  { symbol: 'HDC', companyName: 'CTCP Phát triển Nhà Bà Rịa - Vũng Tàu', exchange: 'HOSE', sector: 'Bất động sản' },
  { symbol: 'CII', companyName: 'CTCP Đầu tư Hạ tầng Kỹ thuật TP.HCM', exchange: 'HOSE', sector: 'Hạ tầng giao thông', isVN100: true },
  { symbol: 'HHV', companyName: 'CTCP Đầu tư Hạ tầng Giao thông Đèo Cả', exchange: 'HOSE', sector: 'Hạ tầng giao thông', isVN100: true },
  { symbol: 'SHB', companyName: 'NHTMCP Sài Gòn - Hà Nội', exchange: 'HOSE', sector: 'Ngân hàng', isVN30: true, isVN100: true },
  { symbol: 'LPB', companyName: 'NHTMCP Lộc Phát Việt Nam', exchange: 'HOSE', sector: 'Ngân hàng', isVN100: true },
  { symbol: 'EIB', companyName: 'NHTMCP Xuất Nhập Khẩu Việt Nam (Eximbank)', exchange: 'HOSE', sector: 'Ngân hàng', isVN100: true },
  { symbol: 'OCB', companyName: 'NHTMCP Phương Đông', exchange: 'HOSE', sector: 'Ngân hàng', isVN100: true },
  { symbol: 'MSB', companyName: 'NHTMCP Hàng Hải Việt Nam', exchange: 'HOSE', sector: 'Ngân hàng', isVN100: true },
  { symbol: 'HCM', companyName: 'CTCP Chứng khoán TP.HCM (HSC)', exchange: 'HOSE', sector: 'Dịch vụ tài chính / Chứng khoán', isVN100: true },
  { symbol: 'VCI', companyName: 'CTCP Chứng khoán Vietcap', exchange: 'HOSE', sector: 'Dịch vụ tài chính / Chứng khoán', isVN100: true },
];
