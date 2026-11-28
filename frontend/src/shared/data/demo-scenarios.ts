export type MarketScenario = 'market-loading' | 'market-error' | 'market-empty' | 'market-paused' |
  'buy-repriced' | 'buy-insufficient' | 'trade-unknown' | 'portfolio-empty' | 'trade-paused' |
  'payment-open' | 'payment-expired' | 'payment-unknown' | 'listing-pending' | 'listing-approved' | 'listing-rejected' |
  'fees-save-error' | 'fees-save-unknown' | 'api-connected' | 'api-disconnected' | 'mcp-connected' | 'mcp-disconnected';

export function readScenario(url: URL): MarketScenario | undefined {
  const scenario = url.searchParams.get('scenario');
  if (scenario === 'market-loading' || scenario === 'market-error' || scenario === 'market-empty' || scenario === 'market-paused' ||
    scenario === 'buy-repriced' || scenario === 'buy-insufficient' || scenario === 'trade-unknown' || scenario === 'portfolio-empty' || scenario === 'trade-paused' ||
    scenario === 'payment-open' || scenario === 'payment-expired' || scenario === 'payment-unknown' ||
    scenario === 'listing-pending' || scenario === 'listing-approved' || scenario === 'listing-rejected' ||
    scenario === 'fees-save-error' || scenario === 'fees-save-unknown' || scenario === 'api-connected' || scenario === 'api-disconnected' || scenario === 'mcp-connected' || scenario === 'mcp-disconnected') return scenario;
  const legacy = new URLSearchParams(url.hash.split('?')[1] ?? '').get('demo');
  return legacy === 'loading' ? 'market-loading' : legacy === 'error' ? 'market-error' : undefined;
}
