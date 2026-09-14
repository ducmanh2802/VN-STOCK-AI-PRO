/**
 * PHASE 19.1 — MACRO INTELLIGENCE MODULE ENTRYPOINT
 * ==================================================
 * Exports domain types, registries, validation rules, and service contracts.
 */

export * from '../../types/macro.ts';
export * from './registry/indicatorRegistry.ts';
export * from './registry/sourceRegistry.ts';
export * from './freshness/MacroFreshnessPolicy.ts';
export * from './validation/MacroDataValidator.ts';
export * from './providers/MacroDataProvider.ts';
export * from './providers/EmptyMacroDataProvider.ts';
export * from './MacroService.ts';
