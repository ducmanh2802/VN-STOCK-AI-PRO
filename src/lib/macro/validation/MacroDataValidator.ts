/**
 * PHASE 19.1 — MACRO DATA VALIDATION LAYER
 * ========================================
 * Pure, deterministic, fail-closed validation for macroeconomic indicators.
 * Guarantees zero synthetic / mock data leaks and strict domain compliance.
 */

import type {
  MacroIndicator,
  MacroDataValidationResult,
  MacroDataStatus,
} from '../../../types/macro.ts';
import {
  getRegisteredIndicator,
  isIndicatorCodeRegistered,
} from '../registry/indicatorRegistry.ts';
import { isSourceTrusted } from '../registry/sourceRegistry.ts';
import {
  defaultMacroFreshnessPolicy,
  MacroFreshnessPolicy,
} from '../freshness/MacroFreshnessPolicy.ts';

export interface MacroValidationOptions {
  readonly referenceTime?: Date;
  readonly freshnessPolicy?: MacroFreshnessPolicy;
  readonly clockSkewToleranceMs?: number; // default 5 minutes
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export class MacroDataValidator {
  /**
   * Validates a complete MacroIndicator observation record.
   * Deterministic, pure, and fail-closed.
   */
  public static validate(
    indicator: unknown,
    options: MacroValidationOptions = {}
  ): MacroDataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const referenceTime = options.referenceTime ?? new Date();
    const checkedAt = referenceTime.toISOString();
    const freshnessPolicy = options.freshnessPolicy ?? defaultMacroFreshnessPolicy;
    const clockSkewMs = options.clockSkewToleranceMs ?? FIVE_MINUTES_MS;

    let sourceTrusted = false;
    let timestampValid = false;
    let valueValid = false;

    // 1. Structure validation
    if (!indicator || typeof indicator !== 'object') {
      return {
        valid: false,
        status: 'INVALID',
        errors: ['Macro indicator payload is null, undefined, or not an object'],
        warnings: [],
        checkedAt,
        sourceTrusted: false,
        timestampValid: false,
        valueValid: false,
      };
    }

    const ind = indicator as Partial<MacroIndicator>;

    // 2. Identifier and Code Validation
    if (!ind.id || typeof ind.id !== 'string' || !ind.id.trim()) {
      errors.push('Missing or empty indicator id');
    }

    const code = ind.code ? String(ind.code).trim().toUpperCase() : '';
    if (!code) {
      errors.push('Missing or empty indicator code');
    } else if (!isIndicatorCodeRegistered(code)) {
      errors.push(`Indicator code "${code}" is not registered in the canonical Macro Indicator Registry`);
    }

    const definition = code ? getRegisteredIndicator(code) : undefined;

    // 3. Name, Country, Category, Frequency, Unit
    if (!ind.name || typeof ind.name !== 'string' || !ind.name.trim()) {
      errors.push('Missing or empty indicator name');
    }

    if (!ind.country || !['US', 'VN', 'GLOBAL'].includes(ind.country)) {
      errors.push(`Invalid country: "${ind.country}". Must be US, VN, or GLOBAL`);
    } else if (definition && ind.country !== definition.country) {
      errors.push(`Country mismatch for ${code}: expected ${definition.country}, got ${ind.country}`);
    }

    if (!ind.category || typeof ind.category !== 'string') {
      errors.push('Missing or invalid category');
    } else if (definition && ind.category !== definition.category) {
      errors.push(`Category mismatch for ${code}: expected ${definition.category}, got ${ind.category}`);
    }

    if (!ind.frequency || !['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'EVENT'].includes(ind.frequency)) {
      errors.push(`Invalid frequency: "${ind.frequency}"`);
    } else if (definition && ind.frequency !== definition.frequency) {
      warnings.push(`Frequency deviation for ${code}: registry defines ${definition.frequency}, got ${ind.frequency}`);
    }

    if (!ind.unit || typeof ind.unit !== 'string' || !ind.unit.trim()) {
      errors.push('Missing or empty indicator unit');
    }

    // 4. Source & Trust Validation
    if (!ind.source || typeof ind.source !== 'string') {
      errors.push('Missing or invalid source');
    } else {
      sourceTrusted = isSourceTrusted(ind.source);
      if (!sourceTrusted) {
        errors.push(`Source "${ind.source}" is not an authorized or trusted macro source`);
      }
    }

    if (ind.sourceUrl !== undefined && typeof ind.sourceUrl !== 'string') {
      errors.push('sourceUrl must be a string if provided');
    }

    // 5. Confidence Score Validation (0.0 to 1.0)
    if (
      typeof ind.confidence !== 'number' ||
      !Number.isFinite(ind.confidence) ||
      Number.isNaN(ind.confidence)
    ) {
      errors.push(`Invalid confidence score: ${ind.confidence}. Must be a finite number between 0 and 1`);
    } else if (ind.confidence < 0 || ind.confidence > 1) {
      errors.push(`Confidence score out of bounds [0, 1]: ${ind.confidence}`);
    }

    // 6. Timestamps & Temporal Integrity
    let publishedAtMs = NaN;
    if (!ind.publishedAt || typeof ind.publishedAt !== 'string') {
      errors.push('Missing or invalid publishedAt timestamp string');
    } else {
      publishedAtMs = new Date(ind.publishedAt).getTime();
      if (Number.isNaN(publishedAtMs)) {
        errors.push(`publishedAt is not a valid ISO 8601 date string: "${ind.publishedAt}"`);
      } else if (publishedAtMs > referenceTime.getTime() + clockSkewMs) {
        errors.push(`publishedAt is in the future: "${ind.publishedAt}" (reference: "${referenceTime.toISOString()}")`);
      }
    }

    let observationDateMs = NaN;
    if (!ind.observationDate || typeof ind.observationDate !== 'string') {
      errors.push('Missing or invalid observationDate string');
    } else {
      observationDateMs = new Date(ind.observationDate).getTime();
      if (Number.isNaN(observationDateMs)) {
        errors.push(`observationDate is not a valid date string: "${ind.observationDate}"`);
      } else if (
        ind.frequency !== 'EVENT' &&
        observationDateMs > referenceTime.getTime() + clockSkewMs
      ) {
        // Only forward-looking calendar events (like FOMC meetings) may have future observation dates
        errors.push(`observationDate is in the future for non-event indicator: "${ind.observationDate}"`);
      }
    }

    timestampValid = !Number.isNaN(publishedAtMs) && !Number.isNaN(observationDateMs) && errors.length === 0;

    // 7. Value Validation & No-Mock Policy
    if (ind.value === undefined) {
      errors.push('Indicator value cannot be undefined; use null for unavailable data');
    } else if (ind.value === null) {
      if (ind.status !== 'NO_DATA' && ind.status !== 'INVALID') {
        warnings.push('Value is null but status is not NO_DATA');
      }
      valueValid = true;
    } else if (typeof ind.value !== 'number' || !Number.isFinite(ind.value) || Number.isNaN(ind.value)) {
      errors.push(`Indicator value must be a finite number or null, received: ${ind.value}`);
    } else {
      valueValid = true;

      // Range check against definition if defined
      if (definition) {
        if (definition.allowNegative === false && ind.value < 0) {
          errors.push(`Indicator ${code} does not allow negative values, received: ${ind.value}`);
          valueValid = false;
        }

        if (definition.minValue !== undefined && ind.value < definition.minValue) {
          errors.push(`Indicator ${code} value ${ind.value} is below minimum bound ${definition.minValue}`);
          valueValid = false;
        }

        if (definition.maxValue !== undefined && ind.value > definition.maxValue) {
          errors.push(`Indicator ${code} value ${ind.value} is above maximum bound ${definition.maxValue}`);
          valueValid = false;
        }
      }
    }

    // Previous & Expected Value type check
    if (ind.previousValue !== undefined && ind.previousValue !== null) {
      if (typeof ind.previousValue !== 'number' || !Number.isFinite(ind.previousValue)) {
        errors.push(`previousValue must be a finite number or null, received: ${ind.previousValue}`);
      }
    }

    if (ind.expectedValue !== undefined && ind.expectedValue !== null) {
      if (typeof ind.expectedValue !== 'number' || !Number.isFinite(ind.expectedValue)) {
        errors.push(`expectedValue must be a finite number or null, received: ${ind.expectedValue}`);
      }
    }

    // 8. Freshness Evaluation
    let calculatedStatus: MacroDataStatus = ind.status ?? 'VALID';
    if (errors.length > 0) {
      calculatedStatus = 'INVALID';
    } else if (ind.value === null) {
      calculatedStatus = 'NO_DATA';
    } else if (ind.frequency && !Number.isNaN(publishedAtMs)) {
      const freshness = freshnessPolicy.evaluateFreshness(publishedAtMs, ind.frequency, referenceTime);
      if (!freshness.isFresh) {
        if (freshness.status === 'FUTURE_INVALID') {
          errors.push('publishedAt is evaluated in the future');
          calculatedStatus = 'INVALID';
        } else {
          warnings.push(`Data is stale: age ${Math.round(freshness.ageMs / (1000 * 60 * 60 * 24))} days exceeds threshold of ${Math.round(freshness.maxAgeMs / (1000 * 60 * 60 * 24))} days`);
          calculatedStatus = 'STALE';
        }
      } else {
        calculatedStatus = 'VALID';
      }
    }

    const isValid = errors.length === 0;

    return {
      valid: isValid,
      status: calculatedStatus,
      errors,
      warnings,
      checkedAt,
      sourceTrusted,
      timestampValid,
      valueValid,
    };
  }
}
