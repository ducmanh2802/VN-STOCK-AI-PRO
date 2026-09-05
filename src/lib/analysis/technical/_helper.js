import { CandleInput } from "../common/types.ts";
import {
  validateCandles,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateVolumeRatio,
} from "./indicators.ts";
import { TechnicalScoreEngine, TechnicalScoreResult } from "./TechnicalScoreEngine.ts";
import { calculateSupportResistance, SupportResistanceResult } from "./supportResistance.ts";