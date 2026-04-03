import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion } from "framer-motion";
import {
  Zap,
  CheckCircle2,
  Loader2,
  Clock,
  Copy,
  ClipboardCheck,
  AlertCircle,
  RotateCcw,
  X,
} from "lucide-react";
import type { AppState, Action, ProofResult, ProofProgress } from "../App";

type Props = {
  state: AppState;
  setField: (field: keyof AppState, value: unknown) => void;
  dispatch: React.Dispatch<Action>;
};

const STAGES = [
  { key: "signing", label: "Signing" },
  { key: "ca-merkle", label: "CA Merkle Tree" },
  { key: "proving", label: "Generating Proof" },
  { key: "done", label: "Complete" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-tertiary transition"
    >
      {copied ? (
        <>
          <ClipboardCheck className="w-3.5 h-3.5 text-secondary" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

export default function ProveStep({ state, setField, dispatch }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const startedRef = useRef(false);
  // Snapshot proof params at mount to avoid stale closure issues
  const paramsRef = useRef({
    proofMode: state.proofMode,
    selectedCertIndex: state.selectedCertIndex,
    rpcUrl: state.rpcUrl,
    registryAddress: state.registryAddress,
    chainId: state.chainId,
    registrant: state.registrant,
    walletIndex: state.walletIndex,
    maxWallets: state.registryInfo?.max_wallets ?? 1,
    disclosureMask: state.disclosureMask,
    proverUrl: state.registryInfo?.prover_url ?? "",
  });

  const startProof = async () => {
    setField("proofStatus", "proving");
    setField("proofProgress", null);
    setField("proofResult", null);
    setField("error", null);
    setElapsed(0);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    const p = paramsRef.current;

    try {
      let result: ProofResult;

      if (p.proofMode === "delegated") {
        result = await invoke<ProofResult>("delegated_prove", {
          params: {
            cert_index: p.selectedCertIndex,
            rpc_url: p.rpcUrl,
            registry_address: p.registryAddress,
            chain_id: p.chainId,
            registrant: p.registrant,
            wallet_index: p.walletIndex,
            max_wallets: p.maxWallets,
            disclosure_mask: p.disclosureMask,
            prover_url: p.proverUrl,
          },
        });
      } else {
        result = await invoke<ProofResult>("generate_proof", {
          params: {
            cert_index: p.selectedCertIndex,
            rpc_url: p.rpcUrl,
            registry_address: p.registryAddress,
            chain_id: p.chainId,
            registrant: p.registrant,
            wallet_index: p.walletIndex,
            max_wallets: p.maxWallets,
            disclosure_mask: p.disclosureMask,
            mode: p.proofMode,
          },
        });
      }

      setField("proofResult", result);
      setField("proofStatus", "done");
    } catch (e) {
      setField("error", String(e));
      setField("proofStatus", "error");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Start proof on mount
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startProof();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for progress events — safe cleanup with cancelled flag
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    listen<ProofProgress>("proof-progress", (event) => {
      if (!cancelled) {
        setField("proofProgress", event.payload);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [setField]);

  const currentStageIndex = STAGES.findIndex(
    (s) => s.key === state.proofProgress?.stage,
  );

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0
      ? `${m}m ${sec.toString().padStart(2, "0")}s`
      : `${sec}s`;
  };

  // ── Proving state ──
  if (state.proofStatus === "proving" || state.proofStatus === "idle") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="glass-panel rounded-2xl p-8 w-full max-w-md flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-tertiary" />
              <h2 className="font-headline text-xl font-semibold text-on-surface">
                Generating Proof
              </h2>
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant text-sm font-mono">
              <Clock className="w-3.5 h-3.5" />
              {formatElapsed(elapsed)}
            </div>
          </div>

          {/* Stage pipeline */}
          <div className="flex flex-col gap-1">
            {STAGES.map((stage, i) => {
              const done = i < currentStageIndex;
              const active = i === currentStageIndex;
              const pending = i > currentStageIndex;
              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    active ? "bg-tertiary/5" : ""
                  }`}
                >
                  <div className="w-5 h-5 flex items-center justify-center">
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-secondary" />
                    ) : active ? (
                      <motion.div
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <Loader2 className="w-4 h-4 text-tertiary animate-spin" />
                      </motion.div>
                    ) : (
                      <div
                        className={`w-2 h-2 rounded-full ${pending ? "bg-outline-variant/30" : "bg-outline-variant"}`}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <span
                      className={`text-sm ${
                        done
                          ? "text-secondary"
                          : active
                            ? "text-on-surface"
                            : "text-on-surface-variant/40"
                      }`}
                    >
                      {stage.label}
                    </span>
                    {active && state.proofProgress?.message && (
                      <p className="text-xs text-on-surface-variant/60 mt-0.5">
                        {state.proofProgress.message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (state.proofStatus === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="glass-panel rounded-2xl p-8 w-full max-w-md flex flex-col gap-4">
          <div className="flex items-center gap-2 text-error">
            <AlertCircle className="w-5 h-5" />
            <h2 className="font-headline text-xl font-semibold">
              Proof Failed
            </h2>
          </div>
          {state.error && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1 break-all">{state.error}</span>
              <button onClick={() => setField("error", null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => dispatch({ type: "PREV_STEP" })}
              className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface font-label text-sm transition"
            >
              Back to Configure
            </button>
            <button
              onClick={() => {
                startedRef.current = false;
                startProof();
              }}
              className="flex items-center gap-1.5 bg-tertiary/10 text-tertiary border border-tertiary/20 font-label text-sm font-semibold rounded-lg py-2 px-3 hover:bg-tertiary/20 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state ──
  return (
    <div className="flex-1 flex flex-col gap-4">
      <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
        {/* Success header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-secondary">
            <CheckCircle2 className="w-5 h-5" />
            <h2 className="font-headline text-xl font-semibold">
              Proof Generated
            </h2>
          </div>
          <div className="flex items-center gap-1 text-on-surface-variant text-sm font-mono">
            <Clock className="w-3.5 h-3.5" />
            {state.proofResult
              ? `${(state.proofResult.elapsed_ms / 1000).toFixed(1)}s`
              : ""}
          </div>
        </div>

        {/* Proof output */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
              Proof
            </label>
            {state.proofResult && <CopyButton text={state.proofResult.proof} />}
          </div>
          <div className="bg-surface-container-low border border-outline-variant/15 rounded-xl p-3 font-mono text-xs text-on-surface break-all max-h-28 overflow-y-auto">
            {state.proofResult?.proof || "—"}
          </div>
        </div>

        {/* Public values output */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
              Public Values
            </label>
            {state.proofResult && (
              <CopyButton text={state.proofResult.public_values} />
            )}
          </div>
          <div className="bg-surface-container-low border border-outline-variant/15 rounded-xl p-3 font-mono text-xs text-on-surface break-all max-h-28 overflow-y-auto">
            {state.proofResult?.public_values || "—"}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pb-4">
        <button
          onClick={() => dispatch({ type: "PREV_STEP" })}
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface font-label text-sm transition"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: "RESET" })}
          className="flex items-center gap-1.5 bg-tertiary/10 text-tertiary border border-tertiary/20 font-label text-sm font-semibold rounded-xl py-2.5 px-5 hover:bg-tertiary/20 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Start Over
        </button>
      </div>
    </div>
  );
}
