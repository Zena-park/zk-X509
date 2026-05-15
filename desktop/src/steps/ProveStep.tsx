import { useEffect, useState, useRef, type Dispatch } from "react";
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
  dispatch: Dispatch<Action>;
};

const STAGES = [
  { key: "consent", label: "Signing Consent" },
  { key: "signing", label: "Signing Wallet Bindings" },
  // `ca-resolve` and `ca-merkle` used to be a single stage labeled
  // "CA Merkle Tree", but the backend actually does CA lookup (RPC +
  // remote repo fetch, often several seconds) BEFORE building the
  // inclusion proof. Splitting them gives the user visible motion
  // through that previously-frozen window.
  { key: "ca-resolve", label: "Resolving Issuing CA" },
  { key: "ca-merkle", label: "Building CA Merkle Proof" },
  { key: "proving", label: "Generating ZK Proof" },
  // Delegated-prove sub-stages — filtered out on self-prove paths
  // below by the same `visibleStages` logic that hides `consent`.
  { key: "encrypting", label: "Encrypting Certificate" },
  { key: "sending", label: "Sending to Prover" },
  { key: "done", label: "Complete" },
];

// Synthetic rotating sub-messages displayed underneath the active
// "Generating ZK Proof" stage. SP1 itself emits no progress events
// during the 1–3 minute proof phase, so without this the UI sits
// frozen on one line — looks like a hang to the operator. The
// messages roughly track what SP1's internal pipeline is doing
// (witness gen → recursion fold → gnark wrap → compress) but the
// rotation is timer-driven, not tied to actual SP1 sub-events. The
// goal is a "still working" affordance, not pinpoint accuracy.
const SP1_SUBSTEPS = [
  "Executing program (≈12M RISC-V cycles)…",
  "Compressing shard proofs (recursion tree fold)…",
  "Building Groth16 wrapping circuit…",
  "Final pairing check and proof compression…",
];
const SP1_SUBSTEP_ROTATION_MS = 15_000;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const provingRef = useRef(false);
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
    // Guard against StrictMode double-invocation and concurrent retries
    if (provingRef.current) return;
    provingRef.current = true;

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
            certIndex: p.selectedCertIndex,
            rpcUrl: p.rpcUrl,
            registryAddress: p.registryAddress,
            chainId: p.chainId,
            registrant: p.registrant,
            walletIndex: p.walletIndex,
            maxWallets: p.maxWallets,
            disclosureMask: p.disclosureMask,
            proverUrl: p.proverUrl,
          },
        });
      } else {
        result = await invoke<ProofResult>("generate_proof", {
          params: {
            certIndex: p.selectedCertIndex,
            rpcUrl: p.rpcUrl,
            registryAddress: p.registryAddress,
            chainId: p.chainId,
            registrant: p.registrant,
            walletIndex: p.walletIndex,
            maxWallets: p.maxWallets,
            disclosureMask: p.disclosureMask,
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
      provingRef.current = false;
    }
  };

  // Live status of the backend→frontend progress channel. Surfaces
  // three things at a glance for the operator: did `listen()` resolve
  // (would catch a Tauri ACL / capability misconfig), how many events
  // arrived, and which stage was last reported. Filled in by the
  // single listener below — no separate handler for the panel, since
  // registering listen() twice on the same event just doubles the
  // dispatch cost without giving us new information.
  const [channelStatus, setChannelStatus] = useState({
    listenState: "pending" as "pending" | "registered" | "error",
    emitCount: 0,
    lastStage: "",
    error: null as string | null,
  });

  // Single effect: register the progress listener AND kick off the
  // proof concurrently. The earlier sequential design (await listen
  // → startProof) starved the elapsed timer when `listen()` was slow
  // or threw, so users saw a frozen 0s with all-gray bullets. Firing
  // in parallel keeps the timer ticking from mount while closing the
  // race in practice: invoke's IPC + listen's IPC reach Rust on the
  // same event-loop tick, and the first emit (`signing`) doesn't
  // fire until spawn-blocking + cert-load (~100ms+) — enough for
  // listener registration to land. The single handler updates both
  // `state.proofProgress` (drives the stage pipeline) and
  // `channelStatus` (drives the live-status panel) atomically.
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    listen<ProofProgress>("proof-progress", (event) => {
      if (cancelled) return;
      setField("proofProgress", event.payload);
      setChannelStatus((d) => ({
        ...d,
        emitCount: d.emitCount + 1,
        lastStage: event.payload?.stage ?? "(no stage)",
      }));
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlistenFn = fn;
        setChannelStatus((d) => ({ ...d, listenState: "registered" }));
      })
      .catch((err) => {
        if (!cancelled) {
          setChannelStatus((d) => ({
            ...d,
            listenState: "error",
            error: String(err),
          }));
        }
        // Also log so a Tauri-side regression (event-name typo,
        // API rename) is visible during dev even if the panel
        // is later hidden.
        console.error("listen('proof-progress') failed:", err);
      });

    startProof();

    return () => {
      cancelled = true;
      unlistenFn?.();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotate sub-messages under the active "proving" stage so the user
  // sees motion during the 1–3 minute SP1 phase. The unconditional
  // reset at the top covers both entering and leaving the stage —
  // re-entering (retry) starts the rotation from index 0 again.
  const [sp1SubstepIdx, setSp1SubstepIdx] = useState(0);
  useEffect(() => {
    setSp1SubstepIdx(0);
    if (state.proofProgress?.stage !== "proving") return;
    const t = setInterval(
      () => setSp1SubstepIdx((i) => (i + 1) % SP1_SUBSTEPS.length),
      SP1_SUBSTEP_ROTATION_MS,
    );
    return () => clearInterval(t);
  }, [state.proofProgress?.stage]);

  // Per-stage elapsed counter. `stageStart` snapshots the global
  // `elapsed` value at every stage transition so we can render
  // `(elapsed - stageStart)` as the time spent on the active stage —
  // useful when SP1 has been running for 90s and the operator wants
  // to know whether they're still on the proving stage or stuck on
  // CA resolve.
  const [stageStart, setStageStart] = useState(0);
  useEffect(() => {
    setStageStart(elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.proofProgress?.stage]);

  // Hide stages that don't apply to the current proof mode.
  //   - `consent` and `encrypting` / `sending` only fire on the
  //     delegated-prove path (off-host prover server).
  //   - Self-prove mode goes straight from signing → ca-resolve →
  //     ca-merkle → proving → done.
  // Per-stage status uses a *set of seen stage keys* instead of a
  // pure index comparison. Delegated proving is non-linear:
  // encrypted requests fire `encrypting` then `proving` (skipping
  // `sending`); plaintext fallback fires `sending` then `proving`
  // (skipping `encrypting`). An index-only "everything before
  // current is done" rule would mark the skipped stage as done,
  // which is wrong — the seen-set keeps unseen stages pending
  // (gray) so the operator sees what actually happened.
  const isDelegated = paramsRef.current.proofMode === "delegated";
  const visibleStages = STAGES.filter((s) =>
    isDelegated
      ? true
      : s.key !== "consent" && s.key !== "encrypting" && s.key !== "sending",
  );

  const currentStage = state.proofProgress?.stage ?? "";

  const [seenStages, setSeenStages] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!currentStage) return;
    setSeenStages((prev) => {
      if (prev.has(currentStage)) return prev;
      const next = new Set(prev);
      next.add(currentStage);
      return next;
    });
  }, [currentStage]);

  // Reset the seen-set on retry — `startProof()` clears
  // `state.proofProgress`, so observing that flip lets us forget
  // the previous run's stages without coupling to startProof()
  // internals.
  useEffect(() => {
    if (state.proofProgress === null) setSeenStages(new Set());
  }, [state.proofProgress]);

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

          {/* Live status of the backend↔frontend progress channel.
              See useState at top for rationale. */}
          <div className="text-[10px] font-mono bg-tertiary/5 border border-tertiary/20 rounded p-2 leading-tight">
            <div className="text-tertiary mb-0.5">Live status · proof-progress channel</div>
            <div>
              listen:{" "}
              <span
                className={
                  channelStatus.listenState === "error"
                    ? "text-error"
                    : channelStatus.listenState === "registered"
                      ? "text-secondary"
                      : "text-on-surface-variant"
                }
              >
                {channelStatus.listenState}
              </span>
            </div>
            <div>
              events received:{" "}
              <span
                className={
                  channelStatus.emitCount > 0
                    ? "text-secondary"
                    : "text-on-surface-variant/60"
                }
              >
                {channelStatus.emitCount}
              </span>
            </div>
            <div>
              last stage:{" "}
              <span className="text-on-surface">
                {channelStatus.lastStage || "(none)"}
              </span>
            </div>
            {channelStatus.error && (
              <div className="text-error break-all mt-0.5">
                {channelStatus.error}
              </div>
            )}
          </div>

          {/* Stage pipeline */}
          <div className="flex flex-col gap-1">
            {visibleStages.map((stage) => {
              const active = stage.key === currentStage;
              const done = !active && seenStages.has(stage.key);
              const pending = !active && !done;
              // Stage-local elapsed shown only on the active row so
              // the operator can tell "is this stage stuck?" without
              // mental subtraction. `Math.max` floors it to 0 in
              // case `stageStart` updates land after `elapsed`.
              const stageElapsed = active ? Math.max(0, elapsed - stageStart) : 0;
              const showSp1Substep = active && stage.key === "proving";
              return (
                <div
                  key={stage.key}
                  className={`relative overflow-hidden flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    active ? "bg-tertiary/5" : ""
                  }`}
                >
                  <div className="w-5 h-5 flex items-center justify-center mt-0.5">
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
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
                      {active && (
                        <span className="text-[10px] font-mono text-on-surface-variant/50 tabular-nums">
                          {formatElapsed(stageElapsed)}
                        </span>
                      )}
                    </div>
                    {active && state.proofProgress?.message && (
                      <p className="text-xs text-on-surface-variant/60 mt-0.5">
                        {state.proofProgress.message}
                      </p>
                    )}
                    {/* Synthetic SP1 sub-message rotation — only on
                        the "proving" stage where the backend goes
                        silent for 1–3 minutes. AnimatePresence-style
                        crossfade keyed on the substep index so each
                        rotation tick visibly transitions. */}
                    {showSp1Substep && (
                      <motion.p
                        key={sp1SubstepIdx}
                        initial={{ opacity: 0, y: 2 }}
                        animate={{ opacity: 0.7, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="text-[11px] text-on-surface-variant/55 mt-1 italic"
                      >
                        {SP1_SUBSTEPS[sp1SubstepIdx]}
                      </motion.p>
                    )}
                  </div>
                  {/* Indeterminate motion bar under the active row.
                      Gives a clear "this stage is running" signal
                      independent of the spinner — especially useful
                      during the long SP1 phase where the message
                      lines change but no other element moves. */}
                  {active && (
                    <motion.div
                      className="absolute bottom-0 left-0 h-px w-1/3 bg-gradient-to-r from-transparent via-tertiary to-transparent"
                      initial={{ x: "-100%" }}
                      animate={{ x: "300%" }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
                    />
                  )}
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
              onClick={startProof}
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
