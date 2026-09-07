export { marketDataService, MarketDataService } from '../../services/market/MarketDataService';
export * from './types';

/**
 * Returns true if the Vietnam Stock Market (HOSE, HNX) is currently in active trading session.
 * Regular trading sessions: Monday - Friday, 09:00 - 11:30 and 13:00 - 15:00 ICT (UTC+7).
 */
export function isVietnamMarketTrading(): boolean {
  const now = new Date();
  // Get time in UTC+7 (Asia/Ho_Chi_Minh)
  const utcOffset = now.getTime() + now.getTimezoneOffset() * 60000;
  const vnTime = new Date(utcOffset + 7 * 3600000);
  const day = vnTime.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const hours = vnTime.getHours();
  const minutes = vnTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Morning session: 09:00 - 11:30 (540 - 690)
  // Afternoon session: 13:00 - 15:00 (780 - 900)
  return (timeInMinutes >= 540 && timeInMinutes <= 690) || (timeInMinutes >= 780 && timeInMinutes <= 900);
}
