import { useReducer, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import ConnectStep from "./steps/ConnectStep";
import CertificateStep from "./steps/CertificateStep";
import ConfigureStep from "./steps/ConfigureStep";
import ProveStep from "./steps/ProveStep";

// ── Types matching Rust backend ─────────────────────────────────────

export type SettingsResult = {
  max_wallets: number;
  delegated_required: boolean;
  prover_url: string;
};

export type CertInfo = {
  index: number;
  subject: string;
  issuer: string;
  serial: string;
  expires: string;
  source: string;
};

export type ProofResult = {
  proof: string;
  public_values: string;
  elapsed_ms: number;
};

export type ProofProgress = {
  stage: string;
  message: string;
};

// ── State ───────────────────────────────────────────────────────────

export type AppState = {
  step: number;
  // Step 0 — Connect
  rpcUrl: string;
  registryAddress: string;
  chainId: number;
  dockerAvailable: boolean | null;
  registryInfo: SettingsResult | null;
  // Step 1 — Certificate
  certificates: CertInfo[];
  selectedCertIndex: number | null;
  // Step 2 — Configure
  registrant: string;
  walletIndex: number;
  disclosureMask: number;
  proofMode: "execute" | "groth16" | "delegated";
  // Step 3 — Prove
  proofStatus: "idle" | "proving" | "done" | "error";
  proofProgress: ProofProgress | null;
  proofResult: ProofResult | null;
  // Global
  error: string | null;
  loading: boolean;
};

const initialState: AppState = {
  step: 0,
  rpcUrl: "https://rpc.sepolia.org",
  registryAddress: "",
  chainId: 11155111,
  dockerAvailable: null,
  registryInfo: null,
  certificates: [],
  selectedCertIndex: null,
  registrant: "",
  walletIndex: 0,
  disclosureMask: 0,
  proofMode: "execute",
  proofStatus: "idle",
  proofProgress: null,
  proofResult: null,
  error: null,
  loading: false,
};

// ── Reducer ─────────────────────────────────────────────────────────

export type Action =
  | { type: "SET_FIELD"; field: keyof AppState; value: unknown }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "RESET" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "NEXT_STEP":
      return { ...state, step: Math.min(state.step + 1, 3), error: null };
    case "PREV_STEP":
      return { ...state, step: Math.max(state.step - 1, 0), error: null };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

// ── Step indicator ──────────────────────────────────────────────────

const STEPS = ["Connect", "Certificate", "Configure", "Prove"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 px-4">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`w-8 h-px ${done ? "bg-secondary/50" : "bg-outline-variant/30"}`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  done
                    ? "bg-secondary"
                    : active
                      ? "bg-tertiary"
                      : "bg-outline-variant/40"
                }`}
              />
              <span
                className={`text-xs font-label tracking-wide ${
                  done
                    ? "text-secondary"
                    : active
                      ? "text-on-surface"
                      : "text-on-surface-variant/50"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setField = useCallback(
    (field: keyof AppState, value: unknown) =>
      dispatch({ type: "SET_FIELD", field, value }),
    [],
  );

  return (
    <div className="flex flex-col flex-1 px-4">
      {/* Header */}
      <header className="flex items-center justify-between pt-4 pb-2">
        <h1 className="font-headline text-lg font-semibold text-on-surface tracking-tight">
          zk-X509
        </h1>
        {state.step > 0 && state.proofStatus !== "proving" && (
          <button
            onClick={() => dispatch({ type: "RESET" })}
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </header>

      <StepIndicator current={state.step} />

      {/* Step content */}
      <div className="flex-1 flex flex-col min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.step}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col"
          >
            {state.step === 0 && (
              <ConnectStep
                state={state}
                setField={setField}
                dispatch={dispatch}
              />
            )}
            {state.step === 1 && (
              <CertificateStep
                state={state}
                setField={setField}
                dispatch={dispatch}
              />
            )}
            {state.step === 2 && (
              <ConfigureStep
                state={state}
                setField={setField}
                dispatch={dispatch}
              />
            )}
            {state.step === 3 && (
              <ProveStep
                state={state}
                setField={setField}
                dispatch={dispatch}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
