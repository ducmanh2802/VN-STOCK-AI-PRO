import { CandlePoint, VolumeBarPoint } from './types';

/**
 * Calculates volume series with color distinction and rolling volume moving average deterministically.
 * @param data Candlestick array with volume, open, and close
 * @param maPeriod Period for volume moving average (default 20)
 * @returns Array of VolumeBarPoint
 */
export function calculateVolumeSeries(
  data: CandlePoint[],
  maPeriod: number = 20
): VolumeBarPoint[] {
  if (!data || data.length === 0) {
    return [];
  }

  const result: VolumeBarPoint[] = [];
  let volumeWindowSum = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const isUp = item.close >= item.open;
    // Vietnam stock exchange color standard: Green for up/equal, Red for down
    const color = isUp ? '#10B981' : '#EF4444';

    volumeWindowSum += item.volume;
    if (i >= maPeriod) {
      volumeWindowSum -= data[i - maPeriod].volume;
    }

    let volumeMA: number | undefined = undefined;
    if (i >= maPeriod - 1) {
      volumeMA = Math.round(volumeWindowSum / maPeriod);
    }

    result.push({
      time: item.time,
      value: item.volume,
      color,
      volumeMA,
    });
  }

  return result;
}
