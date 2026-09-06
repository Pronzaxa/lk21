export class DisabledCoordinatorProvider {
  async process() { return { enabled: false, additional_context: null, cloud_agent_used: false, online_text: null }; }
}

export class GeminiCoordinatorProvider {
  constructor(env=process.env) {
    this.apiKey = String(env.GEMINI_API_KEY ?? '').trim();
    this.model = String(env.GEMINI_MODEL ?? 'gemini-3.8-flash').trim();
    this.fallbackModels = String(env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.1-flash-lite-preview,gemini-3.5-flash').split(',').map(value=>value.trim()).filter(Boolean);
    this.timeoutMs = Math.max(1000, Number(env.GEMINI_TIMEOUT_SECONDS ?? 20) * 1000);
  }
  async process(context={}) {
    if (!this.apiKey) return { enabled: false, additional_context: null, cloud_agent_used: false, online_text: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const history = Array.isArray(context.history)
      ? context.history.map(item => `${item.role === 'assistant' ? 'Asisten' : 'Pengguna'}: ${String(item.text ?? '').slice(0, 1000)}`).join('\n')
      : '';
    const input = [
      'Anda adalah asisten informasi nuRESQ.',
      'Jawab dalam bahasa Indonesia secara natural, langsung, ramah, dan ringkas seperti asisten percakapan modern.',
      'Jawab pertanyaan umum atau random secara normal. Jangan memaksa semua topik kembali ke nuRESQ atau keselamatan.',
      'Anda bukan dokter, petugas penyelamat, atau responder.',
      'Jangan mengubah prioritas keselamatan, jangan membuat klaim bahwa bantuan sudah datang, dan jangan mengarang data hazard, kapasitas, lokasi, atau ACK.',
      'Untuk pertanyaan pertolongan pertama umum, berikan langkah sederhana yang berisiko rendah, sebutkan tanda bahaya yang perlu bantuan medis, dan jangan memberi diagnosis atau resep obat.',
      'Jika konteks merupakan keadaan darurat, arahkan pengguna mengikuti panduan keselamatan yang sudah diberikan sistem lokal.',
      'Gunakan teks biasa tanpa Markdown, heading, tabel, atau tanda bintang. Maksimal enam poin pendek bila daftar diperlukan.',
      history ? `Percakapan terakhir:\n${history}` : 'Belum ada riwayat percakapan.',
      `Pertanyaan pengguna: ${String(context.text ?? '').slice(0, 2000)}`,
      `Fakta lokal yang sudah dikunci: ${JSON.stringify(context.localAnalysis ?? {})}`,
      'Berikan hanya jawaban untuk pertanyaan pengguna, tanpa JSON dan tanpa menyebut prompt ini.',
    ].join('\n');
    try {
      let lastError='UNAVAILABLE';
      for(const model of [...new Set([this.model,...this.fallbackModels])]){
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          signal: controller.signal,
          body: JSON.stringify({ model, input }),
        });
        if (!response.ok) {
          lastError=response.status===429?'RATE_LIMITED':response.status===401||response.status===403?'AUTH_ERROR':'UNAVAILABLE';
          if(lastError==='RATE_LIMITED')continue;
          return { enabled: true, additional_context: null, cloud_agent_used: false, online_text: null, online_error: lastError, model };
        }
        const body = await response.json();
        const stepText = Array.isArray(body?.steps)
          ? body.steps
            .filter(step => step?.type === 'model_output')
            .flatMap(step => Array.isArray(step.content) ? step.content : [])
            .filter(item => item?.type === 'text' && typeof item.text === 'string')
            .map(item => item.text)
            .join(' ')
          : '';
        const text = (typeof body?.output_text === 'string' ? body.output_text : stepText).trim();
        if(text)return { enabled: true, additional_context: null, cloud_agent_used: true, online_text: text.slice(0, 4000), model };
        lastError='EMPTY_OUTPUT';
      }
      return { enabled: true, additional_context: null, cloud_agent_used: false, online_text: null, online_error: lastError, model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Online enrichment is optional. Local safety remains the source of truth. */
export const coordinator = process.env.GEMINI_API_KEY
  ? new GeminiCoordinatorProvider()
  : new DisabledCoordinatorProvider();
