import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockQuickViewModal } from '../StockQuickViewModal';

describe('StockQuickViewModal', () => {
  describe('stock is null', () => {
    it('renders empty HTML when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <StockQuickViewModal isOpen={false} stock={null} onClose={() => {}} onToggleWatchlist={() => {}} isWatchlisted={false} onViewDetail={() => {}} />
      );
      expect(html).toBe('');
    });

    it('renders loading message and close button when isLoading is true', () => {
      const html = renderToStaticMarkup(
        <StockQuickViewModal isOpen stock={null} isLoading onClose={() => {}} onToggleWatchlist={() => {}} isWatchlisted={false} onViewDetail={() => {}} />
      );
      expect(html).toContain('Đang tải dữ liệu mã cổ phiếu');
      expect(html).toContain('Đóng');
    });

    it('renders error message when error is provided', () => {
      const html = renderToStaticMarkup(
        <StockQuickViewModal isOpen stock={null} error={new Error('x')} onClose={() => {}} onToggleWatchlist={() => {}} isWatchlisted={false} onViewDetail={() => {}} />
      );
      expect(html).toContain('Không tải được dữ liệu mã cổ phiếu');
    });

    it('renders no-data message when neither isLoading nor error', () => {
      const html = renderToStaticMarkup(
        <StockQuickViewModal isOpen stock={null} onClose={() => {}} onToggleWatchlist={() => {}} isWatchlisted={false} onViewDetail={() => {}} />
      );
      expect(html).toContain('Không có dữ liệu cho mã cổ phiếu này');
    });
  });
});