import { createServerFn } from '@tanstack/react-start';
import { getSessionServer } from './auth-rpc';
import type { InsightOptions } from './ai-analytics';

// Owner and manager only, matching the other management endpoints.
async function requireManager() {
  const session = await getSessionServer();
  if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
  return session;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Filters = { from?: string; to?: string; horizonDays?: number; categoryId?: number | null };

function clean(f: Filters): InsightOptions {
  if (f.from && !DATE.test(f.from)) throw new Error('From date must be YYYY-MM-DD');
  if (f.to && !DATE.test(f.to)) throw new Error('To date must be YYYY-MM-DD');
  return { from: f.from, to: f.to, horizonDays: f.horizonDays, categoryId: f.categoryId ?? null };
}

const SYSTEM_PROMPT = `You are the analyst for a restaurant POS.
Use ONLY the facts in the JSON you are given. Do not invent numbers.
Write a short report with these sections:
1. Demand: the items to expect most over the forecast period, and any rising or falling items.
2. Ingredient consumption: what is being used, and any gaps in recipes.
3. Purchase list: exact quantities to order, from purchaseRecommendations with recommendedOrderQty > 0. Give the unit and the estimated cost where it is known.
4. Profitability: gross profit and margin, the lowest-margin dishes, the price advice (suggested price to reach the target margin), and any ingredient cost rises in ingredientCostTrend.
5. Risks and caveats: small sample sizes, missing recipes, low stock, and dishes sold without a recipe cost.
Keep it under 350 words. Use plain bullet points.`;

function getOllamaKeys(): string[] {
  const k1 = process.env.OLLAMA_API_KEY?.trim();
  const k2 = process.env.OLLAMA_API_KEY2?.trim();
  const keys = [k1, k2].filter((k): k is string => Boolean(k));
  if (keys.length === 0) throw new Error('OLLAMA_API_KEY is not set in .env.local');
  return keys;
}

async function askOllama(facts: unknown): Promise<{ text: string; model: string }> {
  const host = process.env.OLLAMA_HOST || 'https://ollama.com';
  const keys = getOllamaKeys();
  const model = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';

  let lastError: Error | null = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: 'Facts (JSON):\n' + JSON.stringify(facts) },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama key #${i + 1} request failed (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = (await res.json()) as { message?: { content?: string } };
      const text = (data.message?.content ?? '').trim();
      if (!text) {
        throw new Error(`Ollama key #${i + 1} returned empty content`);
      }

      return { text, model };
    } catch (err: any) {
      console.warn(`Ollama attempt with key #${i + 1} failed: ${err?.message || err}. Trying next key if available.`);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('All Ollama API keys failed');
}

export const getAiInsightsFn = createServerFn({ method: 'POST' })
  .validator((d: Filters) => d ?? {})
  .handler(async ({ data }) => {
    await requireManager();
    const { buildInsights } = await import('./ai-analytics');
    return await buildInsights(clean(data));
  });

export const getAiAnalysisFn = createServerFn({ method: 'POST' })
  .validator((d: Filters) => d ?? {})
  .handler(async ({ data }) => {
    await requireManager();
    const { buildInsights } = await import('./ai-analytics');
    const insights = await buildInsights(clean(data));
    const facts = {
      filters: insights.filters,
      window: insights.window,
      sales: insights.sales,
      topForecastItems: insights.itemForecast.slice(0, 15),
      risingItems: insights.itemForecast.filter((i) => i.trend === 'rising').slice(0, 5),
      fallingItems: insights.itemForecast.filter((i) => i.trend === 'falling').slice(0, 5),
      categorySales: insights.categorySales,
      profitability: {
        summary: insights.profitability.summary,
        coverage: insights.profitability.coverage,
        lowestMarginDishes: [...insights.profitability.byDish].filter((d) => d.units > 0 && d.marginPct !== null).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0)).slice(0, 8),
        topProfitDishes: insights.profitability.byDish.slice(0, 8),
        priceAdvice: insights.profitability.priceAdvice.slice(0, 10),
        ingredientCostTrend: insights.profitability.costTrend,
      },
      purchaseRecommendations: insights.purchaseRecommendations.filter((p) => p.recommendedOrderQty > 0 || p.priority !== 'none').slice(0, 25),
      coverage: insights.coverage,
    };
    const { text, model } = await askOllama(facts);
    return { text, model, generatedAt: new Date().toISOString() };
  });
