/**
 * PHASE 19.1 — READ-ONLY MACRO INTELLIGENCE API ROUTER
 * ====================================================
 * Express router exposing read-only metadata, indicator definitions, and health status.
 * Fail-closed: Never returns mock or fabricated data.
 */

import { Router, type Request, type Response } from 'express';
import { MacroService, defaultMacroService } from '../MacroService.ts';
import type { MacroIndicatorCategory, MacroCountry } from '../../../types/macro.ts';

export function createMacroApiRouter(service: MacroService = defaultMacroService): Router {
  const router = Router();

  /**
   * GET /api/macro/status
   * Health and connectivity status of the macroeconomic data layer
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const health = await service.getHealth();
      res.json({
        phase: 'PHASE_19.1_MACRO_FOUNDATION',
        health,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error fetching macro status' });
    }
  });

  /**
   * GET /api/macro/sources
   * List all registered macro data sources (FED, FRED, US_TREASURY, SBV, GSO, MOF)
   */
  router.get('/sources', (_req: Request, res: Response) => {
    try {
      const sources = service.getSources();
      res.json({ sources, count: sources.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error fetching macro sources' });
    }
  });

  /**
   * GET /api/macro/definitions
   * List all registered indicator metadata/definitions
   */
  router.get('/definitions', (req: Request, res: Response) => {
    try {
      const category = req.query.category as MacroIndicatorCategory | undefined;
      const country = req.query.country as MacroCountry | undefined;

      let definitions = service.getDefinitions();
      if (category) {
        definitions = service.getDefinitionsByCategory(category);
      }
      if (country) {
        definitions = definitions.filter((d) => d.country === country);
      }

      res.json({ definitions, count: definitions.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error fetching macro definitions' });
    }
  });

  /**
   * GET /api/macro/indicators
   * Fetch macroeconomic indicator observations
   */
  router.get('/indicators', async (req: Request, res: Response) => {
    try {
      const category = req.query.category as MacroIndicatorCategory | undefined;
      const country = req.query.country as MacroCountry | undefined;

      let indicators = await service.getAllIndicators();
      if (category) {
        indicators = indicators.filter((i) => i.category === category);
      }
      if (country) {
        indicators = indicators.filter((i) => i.country === country);
      }

      res.json({
        indicators,
        count: indicators.length,
        isDemo: false,
        note: 'Phase 19.1 baseline: Real data feeds pending provider integration in subsequent phases.',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error fetching macro indicators' });
    }
  });

  /**
   * GET /api/macro/indicators/:code
   * Fetch specific indicator by code
   */
  router.get('/indicators/:code', async (req: Request, res: Response) => {
    try {
      const code = req.params.code;
      const definition = service.getDefinition(code);
      if (!definition) {
        return res.status(404).json({
          error: `Indicator with code "${code}" is not registered in the Macro Indicator Registry`,
          code: 'INDICATOR_NOT_FOUND',
        });
      }

      const result = await service.getIndicator(code);
      res.json({
        definition,
        indicator: result.indicator,
        validation: result.validation,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error fetching macro indicator' });
    }
  });

  /**
   * GET /api/macro/categories/:category
   * Fetch indicators for a specific category
   */
  router.get('/categories/:category', async (req: Request, res: Response) => {
    try {
      const category = req.params.category.toUpperCase() as MacroIndicatorCategory;
      const indicators = await service.getIndicatorsByCategory(category);
      const definitions = service.getDefinitionsByCategory(category);

      res.json({
        category,
        definitions,
        indicators,
        count: indicators.length,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Error fetching category indicators' });
    }
  });

  return router;
}
