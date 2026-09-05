export class DisabledCoordinatorProvider {
  async process() { return { enabled: false, additional_context: null, cloud_agent_used: false, online_text: null }; }
}

export class GeminiCoordinatorProvider {
  constructor(env=process.env) {
    this.apiKey = String(env.GEMINI_API_KEY ?? '').trim();
    this.model = String(env.GEMINI_MODEL ?? 'gemini-3.8-flash').trim();
    this.timeoutMs = Math.max(1000, Number(env.GEMINI_TIMEOUT_SECONDS ?? 8) * 1000);
  }
  async process(context={}) {
    if (!this.apiKey) return { enabled: false, additional_context: null, cloud_agent_used: false, online_text: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const input = [
      'Anda adalah asisten informasi nuRESQ.',
      'Jawab dalam bahasa Indonesia secara singkat, jelas, dan tidak mengarang fakta lapangan.',
      'Anda bukan dokter, petugas penyelamat, atau responder.',
      'Jangan mengubah prioritas keselamatan, jangan membuat klaim bahwa bantuan sudah datang, dan jangan mengarang data hazard, kapasitas, lokasi, atau ACK.',
      'Jika konteks merupakan keadaan darurat, arahkan pengguna mengikuti panduan keselamatan yang sudah diberikan sistem lokal.',
      `Pertanyaan pengguna: ${String(context.text ?? '').slice(0, 2000)}`,
      `Fakta lokal yang sudah dikunci: ${JSON.stringify(context.localAnalysis ?? {})}`,
      'Berikan hanya jawaban untuk pertanyaan pengguna, tanpa JSON dan tanpa menyebut prompt ini.',
    ].join('\n');
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        signal: controller.signal,
        body: JSON.stringify({ model: this.model, input }),
      });
      if (!response.ok) throw new Error(`GEMINI_${response.status}`);
      const body = await response.json();
      const text = typeof body?.output_text === 'string' ? body.output_text.trim() : '';
      if (!text) throw new Error('GEMINI_EMPTY_OUTPUT');
      return { enabled: true, additional_context: null, cloud_agent_used: true, online_text: text.slice(0, 4000), model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Online enrichment is optional. Local safety remains the source of truth. */
export const coordinator = process.env.GEMINI_API_KEY
  ? new GeminiCoordinatorProvider()
  : new DisabledCoordinatorProvider();
