import { parseAscensionItemPage, type ParsedAscensionItem } from "./parser";

const DEFAULT_BASE_URL = "https://db.ascension.gg";

export interface AscensionClientOptions {
  baseUrl?: string;
  delayMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

export class AscensionDbClient {
  private readonly baseUrl: string;
  private readonly delayMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private lastRequestAt = 0;

  constructor(options: AscensionClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.ASCENSION_DB_BASE_URL ?? DEFAULT_BASE_URL;
    this.delayMs = options.delayMs ?? Number(process.env.ASCENSION_INGEST_DELAY_MS ?? 850);
    this.retries = options.retries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchItem(id: bigint | number | string): Promise<ParsedAscensionItem> {
    if (!/^\d+$/.test(String(id))) throw new Error(`Invalid item id: ${id}`);
    await this.throttle();
    const url = new URL(this.baseUrl);
    url.searchParams.set("item", String(id));

    let lastError: unknown;
    for (let attempt = 0; attempt < this.retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { "user-agent": "ConquestGearPlanner/0.1 (item metadata importer)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`Ascension DB returned ${response.status}`);
        return parseAscensionItemPage(await response.text(), url.toString());
      } catch (error) {
        lastError = error;
        if (attempt < this.retries - 1) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  private async throttle(): Promise<void> {
    const wait = this.delayMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
  }
}
