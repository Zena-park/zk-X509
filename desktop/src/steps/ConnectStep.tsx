import { useEffect, type Dispatch } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plug,
  Container,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import type { AppState, Action, SettingsResult } from "../App";

type Props = {
  state: AppState;
  setField: (field: keyof AppState, value: unknown) => void;
  dispatch: Dispatch<Action>;
};

export default function ConnectStep({ state, setField, dispatch }: Props) {
  // Check Docker on mount
  useEffect(() => {
    invoke<boolean>("check_docker")
      .then((ok) => setField("dockerAvailable", ok))
      .catch(() => setField("dockerAvailable", false));
  }, [setField]);

  const handleConnect = async () => {
    setField("loading", true);
    setField("error", null);
    try {
      const result = await invoke<SettingsResult>("configure_settings", {
        rpc_url: state.rpcUrl,
        registry_address: state.registryAddress,
        chain_id: state.chainId,
      });
      setField("registryInfo", result);
      // Auto-set proof mode if delegated is required
      if (result.delegated_required) {
        setField("proofMode", "delegated");
      }
    } catch (e) {
      setField("error", String(e));
    } finally {
      setField("loading", false);
    }
  };

  const canProceed = state.registryInfo !== null;

  return (
    <div className="flex-1 flex flex-col gap-4">
      {/* Error banner */}
      {state.error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{state.error}</span>
          <button onClick={() => setField("error", null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2 mb-1">
          <Plug className="w-5 h-5 text-tertiary" />
          <h2 className="font-headline text-xl font-semibold text-on-surface">
            Connect to Registry
          </h2>
        </div>

        {/* RPC URL */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
            RPC URL
          </label>
          <input
            type="text"
            value={state.rpcUrl}
            onChange={(e) => setField("rpcUrl", e.target.value)}
            placeholder="https://rpc.sepolia.org"
            className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary/40 transition"
          />
        </div>

        {/* Registry Address */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
            Registry Address
          </label>
          <input
            type="text"
            value={state.registryAddress}
            onChange={(e) => setField("registryAddress", e.target.value)}
            placeholder="0x..."
            className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary/40 transition"
          />
        </div>

        {/* Chain ID */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
            Chain ID
          </label>
          <input
            type="number"
            value={state.chainId}
            onChange={(e) => setField("chainId", Number(e.target.value))}
            className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary/40 transition w-48"
          />
        </div>

        {/* Docker status */}
        <div className="flex items-center gap-2 text-sm">
          <Container className="w-4 h-4 text-on-surface-variant" />
          <span className="text-on-surface-variant">Docker:</span>
          {state.dockerAvailable === null ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-on-surface-variant" />
          ) : state.dockerAvailable ? (
            <span className="flex items-center gap-1 text-secondary">
              <CheckCircle2 className="w-3.5 h-3.5" /> Available
            </span>
          ) : (
            <span className="flex items-center gap-1 text-error">
              <XCircle className="w-3.5 h-3.5" /> Not found
            </span>
          )}
        </div>

        {/* Connect button */}
        <button
          onClick={handleConnect}
          disabled={
            state.loading || !state.rpcUrl || !state.registryAddress
          }
          className="flex items-center justify-center gap-2 bg-tertiary text-surface font-label font-semibold text-sm rounded-xl py-3 px-6 hover:bg-tertiary/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {state.loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Plug className="w-4 h-4" />
              Connect
            </>
          )}
        </button>

        {/* Registry info result */}
        {state.registryInfo && (
          <div className="bg-surface-container-high/50 rounded-xl p-4 flex flex-col gap-2 text-sm border border-secondary/20">
            <div className="flex items-center gap-1.5 text-secondary font-label font-semibold text-xs uppercase tracking-wide">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </div>
            <div className="grid grid-cols-2 gap-2 text-on-surface-variant">
              <span>Max Wallets</span>
              <span className="text-on-surface font-mono">
                {state.registryInfo.max_wallets}
              </span>
              <span>Delegated Proving</span>
              <span className="text-on-surface font-mono">
                {state.registryInfo.delegated_required ? "Required" : "Optional"}
              </span>
              {state.registryInfo.prover_url && (
                <>
                  <span>Prover URL</span>
                  <span className="text-on-surface font-mono text-xs truncate">
                    {state.registryInfo.prover_url}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-end pb-4">
        <button
          onClick={() => dispatch({ type: "NEXT_STEP" })}
          disabled={!canProceed}
          className="flex items-center gap-2 bg-secondary text-surface font-label font-semibold text-sm rounded-xl py-2.5 px-5 hover:bg-secondary/90 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          Next
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
