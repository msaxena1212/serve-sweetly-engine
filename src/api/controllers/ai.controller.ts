// API AI Controller: delegates strictly to Backend AiAgentsService and Chat
import { AiAgentsService } from '../../be/services/ai-agents.service';
import type { UserSession } from '../../lib/auth.server';
import { jsonResponse, errorResponse } from './orders.controller';

export class AiController {
  static async runAutonomousReorder(user: UserSession) {
    if (!['owner', 'manager'].includes(user.role)) {
      return errorResponse('Only Owners or Managers can trigger autonomous procurement', 403);
    }
    const result = await AiAgentsService.runAutonomousReorder();
    return jsonResponse({ success: true, data: result });
  }

  static async getOwnerBriefing(user: UserSession) {
    if (!['owner', 'manager'].includes(user.role)) {
      return errorResponse('Only Owners or Managers can access executive briefings', 403);
    }
    const briefing = await AiAgentsService.generateOwnerBriefing();
    return jsonResponse({ success: true, data: briefing });
  }

  static async getBasketUpsell(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { cartItemIds?: number[] };
    const ids = Array.isArray(body.cartItemIds) ? body.cartItemIds : [];
    const recommendations = await AiAgentsService.getBasketUpsell(ids);
    return jsonResponse({ success: true, data: recommendations });
  }

  static async chat(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { message?: string; history?: any[] };
    if (!body.message) return errorResponse('message is required');
    const { chatFn } = await import('../../lib/chat');
    const result = await chatFn({ data: { message: body.message, history: body.history } });
    return jsonResponse({ success: true, data: result });
  }
}
