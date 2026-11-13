// Pure Frontend API Client for /api/v1/*
// Provides a clean, typed boundary between the UI (FE) and Backend (BE/API)

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseUrl = '/api/v1';

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('forno_token') || null;
  }

  public setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('forno_token', token);
    }
  }

  public clearToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('forno_token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data: ApiEnvelope<T> = await response.json().catch(() => ({
      success: false,
      error: `HTTP Error ${response.status}`,
    }));

    if (!response.ok || data.success === false) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }

    return (data.data !== undefined ? data.data : (data as unknown)) as T;
  }

  // ── AUTH ──
  public auth = {
    login: (pin: string) => this.request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ pin }) }),
    me: () => this.request<any>('/auth/me'),
  };

  // ── ORDERS & BILLING ──
  public orders = {
    listActive: () => this.request<any[]>('/orders/active'),
    getDetails: (orderId: number) => this.request<any>(`/orders/${orderId}`),
    create: (payload: { type: 'dine-in' | 'takeaway'; tableNumber?: string; customerName?: string; customerPhone?: string }) =>
      this.request<any>('/orders', { method: 'POST', body: JSON.stringify(payload) }),
    addItems: (orderId: number, items: Array<{ menuItemId: number; quantity: number; notes?: string; modifiers?: string[] }>) =>
      this.request<any>(`/orders/${orderId}/items`, { method: 'POST', body: JSON.stringify({ items }) }),
    splitEqually: (orderId: number, numberOfSplits: number) =>
      this.request<any>(`/orders/${orderId}/split`, { method: 'POST', body: JSON.stringify({ numberOfSplits }) }),
    settle: (orderId: number, payload: { paymentMethod: string; tenderAmount?: number }) =>
      this.request<any>(`/orders/${orderId}/pay`, { method: 'POST', body: JSON.stringify(payload) }),
    void: (orderId: number, reason: string) =>
      this.request<any>(`/orders/${orderId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  };

  // ── TABLES & FLOOR ──
  public tables = {
    list: () => this.request<any[]>('/tables'),
    seatWalkIn: (payload: { tableNumber: string; pax: number; customerName?: string; customerPhone?: string }) =>
      this.request<any>('/tables/seat', { method: 'POST', body: JSON.stringify(payload) }),
    transfer: (payload: { orderId: number; fromTableNumber: string; toTableNumber: string }) =>
      this.request<any>('/tables/transfer', { method: 'POST', body: JSON.stringify(payload) }),
    merge: (payload: { primaryTableNumber: string; secondaryTableNumber: string }) =>
      this.request<any>('/tables/merge', { method: 'POST', body: JSON.stringify(payload) }),
    queue: () => this.request<any[]>('/tables/queue'),
  };

  // ── KITCHEN DISPLAY (KDS) ──
  public kds = {
    list: (station?: string) => this.request<any[]>(`/kds${station ? `?station=${encodeURIComponent(station)}` : ''}`),
    updateStatus: (itemId: number, status: 'pending' | 'preparing' | 'ready' | 'served') =>
      this.request<any>('/kds/status', { method: 'POST', body: JSON.stringify({ itemId, status }) }),
  };

  // ── SHIFTS ──
  public shift = {
    status: () => this.request<any>('/shift/status'),
    open: (openingCash: number) => this.request<any>('/shift/open', { method: 'POST', body: JSON.stringify({ openingCash }) }),
    close: (payload: { actualCashTotal: number; denominations?: any[]; notes?: string }) =>
      this.request<any>('/shift/close', { method: 'POST', body: JSON.stringify(payload) }),
  };

  // ── AI ASSISTANT & AGENTS ──
  public ai = {
    chat: (message: string, history?: any[]) =>
      this.request<any>('/ai/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
    reorder: () => this.request<any>('/ai/reorder', { method: 'POST' }),
    briefing: () => this.request<any>('/ai/briefing', { method: 'GET' }),
    upsell: (cartItemIds: number[]) =>
      this.request<any[]>('/ai/upsell', { method: 'POST', body: JSON.stringify({ cartItemIds }) }),
  };
}

export const apiClient = new ApiClient();
