// System-integrated learning links: system feature -> lesson.
export interface SystemLink {
  feature: string;
  lessonId: string;
  label: string;
}

export const SYSTEM_LINKS: SystemLink[] = [
  { feature: 'StockDetail', lessonId: 'les-statements-104', label: 'Learn: statements in 10 min' },
  { feature: 'RiskCenter', lessonId: 'les-risk-105', label: 'Learn: risk & sizing' },
  { feature: 'Portfolio', lessonId: 'les-risk-105', label: 'Learn: diversification' },
  { feature: 'Recommendations', lessonId: 'les-system-106', label: 'Learn: end-to-end workflow' },
  { feature: 'DataStatus', lessonId: 'les-price-volume-102', label: 'Learn: price & freshness' },
];

export function linksFor(feature: string): SystemLink[] {
  return SYSTEM_LINKS.filter((l) => l.feature === feature);
}
