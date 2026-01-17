const BASE_URL = 'https://api.getceda.com';

export const herald = {
  async learned(insight: string): Promise<void> {
    await fetch(`${BASE_URL}/api/herald/reflect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeling: 'success', insight, session: 'sdk' })
    });
  },

  async gotStuck(insight: string): Promise<void> {
    await fetch(`${BASE_URL}/api/herald/reflect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeling: 'stuck', insight, session: 'sdk' })
    });
  },

  async recall(): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/api/herald/reflections?limit=20`);
    const data = await res.json();
    return [...(data.patterns || []), ...(data.antipatterns || [])];
  }
};
