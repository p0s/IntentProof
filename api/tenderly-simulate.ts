interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

interface TenderlySimulationRequest {
  chainId: number;
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
}

interface TenderlyAssetChange {
  type?: string;
  asset_type?: string;
  change_type?: string;
  symbol?: string;
  amount?: string;
  raw_amount?: string;
  rawAmount?: string;
  from?: string;
  to?: string;
  contract_address?: string;
  contractAddress?: string;
  token_info?: {
    symbol?: string;
    contract_address?: string;
  };
}

interface TenderlyPayload {
  simulation?: { id?: string };
  transaction?: {
    status?: boolean;
    gas_used?: number;
    error_message?: string;
    error_info?: { error_message?: string };
    asset_changes?: unknown;
    assetChanges?: unknown;
  };
  asset_changes?: unknown;
  assetChanges?: unknown;
  error?: { message?: string };
}

const SUPPORTED_CHAIN_IDS = new Set([1, 8453, 11155111, 84532]);

function envValue(name: string) {
  const serverGlobal = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return serverGlobal.process?.env?.[name]?.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function hexToDecimalString(value: string | undefined) {
  if (!value || value === "0x") return "0";
  try {
    return BigInt(value).toString();
  } catch {
    return "0";
  }
}

function hexToSafeNumber(value: string | undefined) {
  if (!value || value === "0x") return undefined;
  try {
    const parsed = BigInt(value);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
    return Number(parsed);
  } catch {
    return undefined;
  }
}

function compactMessage(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.replace(/\s+/g, " ").trim().slice(0, 240) || undefined;
}

function parseBody(body: unknown): TenderlySimulationRequest | null {
  const parsed = typeof body === "string" ? JSON.parse(body) : body;
  if (!isRecord(parsed)) return null;

  const chainId =
    typeof parsed.chainId === "number"
      ? parsed.chainId
      : typeof parsed.chainId === "string"
        ? Number(parsed.chainId)
        : NaN;
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) return null;

  const from = isAddress(parsed.from) ? parsed.from : undefined;
  const to = isAddress(parsed.to) ? parsed.to : undefined;
  if (!from || !to) return null;

  const data = isHex(parsed.data) ? parsed.data : "0x";
  const value = isHex(parsed.value) ? parsed.value : "0x0";
  const gas = isHex(parsed.gas) ? parsed.gas : undefined;

  return { chainId, from, to, data, value, gas };
}

function responseUrl(accountSlug: string, projectSlug: string, simulationId?: string) {
  if (!simulationId) return undefined;
  return `https://dashboard.tenderly.co/${accountSlug}/${projectSlug}/simulator/${simulationId}`;
}

function normalizeAssetChanges(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item: TenderlyAssetChange) => ({
    assetType: item.asset_type ?? item.type ?? "unknown",
    changeType: item.change_type ?? item.type ?? "unknown",
    symbol: item.symbol ?? item.token_info?.symbol,
    amount: item.amount,
    rawAmount: item.raw_amount ?? item.rawAmount,
    from: isAddress(item.from) ? item.from : undefined,
    to: isAddress(item.to) ? item.to : undefined,
    contractAddress: isAddress(item.contract_address)
      ? item.contract_address
      : isAddress(item.contractAddress)
        ? item.contractAddress
        : isAddress(item.token_info?.contract_address)
          ? item.token_info.contract_address
          : undefined,
  }));
}

async function readTenderlyError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return compactMessage(payload.error?.message ?? payload.message);
  } catch {
    return undefined;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({
      provider: "tenderly",
      status: "unavailable",
      summary: "Tenderly simulation accepts POST requests only.",
    });
    return;
  }

  const accessKey = envValue("TENDERLY_ACCESS_TOKEN");
  const accountSlug = envValue("TENDERLY_ACCOUNT_SLUG");
  const projectSlug = envValue("TENDERLY_PROJECT_SLUG");
  if (!accessKey || !accountSlug || !projectSlug) {
    res.status(503).json({
      provider: "tenderly",
      status: "unavailable",
      summary: "Tenderly server simulation is not configured.",
    });
    return;
  }

  let request: TenderlySimulationRequest | null = null;
  try {
    request = parseBody(req.body);
  } catch {
    request = null;
  }

  if (!request) {
    res.status(400).json({
      provider: "tenderly",
      status: "unavailable",
      summary: "Tenderly simulation request is invalid or unsupported.",
    });
    return;
  }

  const simulateUrl = `https://api.tenderly.co/api/v1/account/${accountSlug}/project/${projectSlug}/simulate`;
  let response: Response;
  try {
    response = await fetch(simulateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessKey,
      },
      body: JSON.stringify({
        network_id: String(request.chainId),
        from: request.from,
        to: request.to,
        input: request.data ?? "0x",
        value: hexToDecimalString(request.value),
        gas: hexToSafeNumber(request.gas) ?? 8_000_000,
        save: true,
        save_if_fails: true,
        simulation_type: "full",
      }),
    });
  } catch (error) {
    res.status(503).json({
      provider: "tenderly",
      status: "unavailable",
      summary: "Tenderly simulation is unavailable for this request.",
      errorMessage: compactMessage(error),
    });
    return;
  }

  if (!response.ok) {
    const detail = await readTenderlyError(response);
    res.status(503).json({
      provider: "tenderly",
      status: "unavailable",
      summary: "Tenderly simulation is unavailable for this request.",
      errorMessage: detail ?? `Tenderly HTTP ${response.status}`,
    });
    return;
  }

  const payload = (await response.json()) as TenderlyPayload;
  const simulationId = payload.simulation?.id;
  const success = payload.transaction?.status !== false;
  const errorMessage = compactMessage(
    payload.transaction?.error_message ??
      payload.transaction?.error_info?.error_message ??
      payload.error?.message,
  );
  const rawAssetChanges =
    payload.asset_changes ??
    payload.assetChanges ??
    payload.transaction?.asset_changes ??
    payload.transaction?.assetChanges;
  const assetChanges = normalizeAssetChanges(rawAssetChanges);

  let publicSimulationUrl: string | undefined;
  if (simulationId) {
    const shareResponse = await fetch(
      `https://api.tenderly.co/api/v1/account/${accountSlug}/project/${projectSlug}/simulations/${simulationId}/share`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Key": accessKey,
        },
      },
    ).catch(() => null);
    if (shareResponse?.ok) {
      publicSimulationUrl = `https://tdly.co/shared/simulation/${simulationId}`;
    }
  }

  res.status(200).json({
    provider: "tenderly",
    status: success ? "success" : "revert",
    summary: success
      ? "Tenderly simulation completed without an execution failure."
      : "Tenderly simulation reported that the transaction may revert.",
    gasEstimate:
      payload.transaction?.gas_used !== undefined
        ? String(payload.transaction.gas_used)
        : undefined,
    errorMessage,
    simulationUrl: responseUrl(accountSlug, projectSlug, simulationId),
    publicSimulationUrl,
    assetChanges,
  });
}
