import {
  Settings2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import type { AppState, Action } from "../App";

type Props = {
  state: AppState;
  setField: (field: keyof AppState, value: unknown) => void;
  dispatch: React.Dispatch<Action>;
};

const DISCLOSURE_FIELDS = [
  { bit: 0, label: "Country", code: "C" },
  { bit: 1, label: "Organization", code: "O" },
  { bit: 2, label: "Org Unit", code: "OU" },
  { bit: 3, label: "Common Name", code: "CN" },
];

const PROOF_MODES = [
  {
    value: "execute" as const,
    label: "Execute",
    desc: "Fast test mode (no on-chain proof)",
  },
  {
    value: "groth16" as const,
    label: "Groth16",
    desc: "Full ZK proof for on-chain verification",
  },
  {
    value: "delegated" as const,
    label: "Delegated",
    desc: "Remote prover generates the proof",
  },
];

export default function ConfigureStep({ state, setField, dispatch }: Props) {
  const maxWallets = state.registryInfo?.max_wallets ?? 1;
  const delegatedRequired = state.registryInfo?.delegated_required ?? false;

  const toggleBit = (bit: number) => {
    setField("disclosureMask", state.disclosureMask ^ (1 << bit));
  };

  const isValidAddress = (addr: string) =>
    /^0x[0-9a-fA-F]{40}$/.test(addr);

  const canProceed =
    isValidAddress(state.registrant) &&
    state.walletIndex >= 0 &&
    state.walletIndex < maxWallets;

  return (
    <div className="flex-1 flex flex-col gap-4">
      <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="w-5 h-5 text-tertiary" />
          <h2 className="font-headline text-xl font-semibold text-on-surface">
            Configure Proof
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column — address & wallet */}
          <div className="flex flex-col gap-5">
            {/* Registrant */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
                Registrant Address
              </label>
              <input
                type="text"
                value={state.registrant}
                onChange={(e) => setField("registrant", e.target.value)}
                placeholder="0x..."
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary/40 transition"
              />
              {state.registrant && !isValidAddress(state.registrant) && (
                <span className="text-error text-xs">
                  Invalid Ethereum address
                </span>
              )}
            </div>

            {/* Wallet Index */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
                Wallet Index{" "}
                <span className="text-on-surface-variant/50 normal-case">
                  (0–{maxWallets - 1})
                </span>
              </label>
              <input
                type="number"
                min={0}
                max={maxWallets - 1}
                value={state.walletIndex}
                onChange={(e) =>
                  setField("walletIndex", Number(e.target.value))
                }
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 font-mono text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary/40 transition w-32"
              />
            </div>

            {/* Proof Mode */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
                Proof Mode
              </label>
              <div className="flex flex-col gap-1.5">
                {PROOF_MODES.map((mode) => {
                  const disabled =
                    (delegatedRequired && mode.value !== "delegated") ||
                    (!delegatedRequired &&
                      mode.value === "delegated" &&
                      !state.registryInfo?.prover_url);
                  const selected = state.proofMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      onClick={() => !disabled && setField("proofMode", mode.value)}
                      disabled={disabled}
                      className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                        selected
                          ? "border-tertiary/50 bg-tertiary/5 text-on-surface"
                          : disabled
                            ? "border-outline-variant/10 text-on-surface-variant/30 cursor-not-allowed"
                            : "border-outline-variant/15 text-on-surface-variant hover:border-outline-variant/30"
                      }`}
                    >
                      <div className="font-label font-semibold text-xs">
                        {mode.label}
                      </div>
                      <div className="text-[11px] mt-0.5 opacity-70">
                        {mode.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              {delegatedRequired && (
                <p className="text-xs text-tertiary/70">
                  This registry requires delegated proving.
                </p>
              )}
            </div>
          </div>

          {/* Right column — disclosure mask */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-label text-on-surface-variant tracking-wide uppercase">
              Selective Disclosure
            </label>
            <p className="text-xs text-on-surface-variant/70 -mt-1">
              Choose which certificate fields to reveal in the proof.
            </p>

            <div className="flex flex-col gap-2">
              {DISCLOSURE_FIELDS.map((field) => {
                const on = (state.disclosureMask & (1 << field.bit)) !== 0;
                return (
                  <button
                    key={field.bit}
                    onClick={() => toggleBit(field.bit)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      on
                        ? "border-secondary/30 bg-secondary/5"
                        : "border-outline-variant/15 bg-surface-container-low"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-on-surface-variant/60 w-6">
                        {field.code}
                      </span>
                      <span className="text-sm text-on-surface">
                        {field.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {on ? (
                        <span className="flex items-center gap-1 text-xs text-secondary font-label">
                          <Eye className="w-3.5 h-3.5" />
                          Revealed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-on-surface-variant/50 font-label">
                          <EyeOff className="w-3.5 h-3.5" />
                          Hidden
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 px-3 py-2 rounded-lg bg-surface-container-low text-xs font-mono text-on-surface-variant">
              Mask: 0b{state.disclosureMask.toString(2).padStart(4, "0")} (0x
              {state.disclosureMask.toString(16).padStart(2, "0")})
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pb-4">
        <button
          onClick={() => dispatch({ type: "PREV_STEP" })}
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface font-label text-sm transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={() => dispatch({ type: "NEXT_STEP" })}
          disabled={!canProceed}
          className="flex items-center gap-2 bg-secondary text-surface font-label font-semibold text-sm rounded-xl py-2.5 px-5 hover:bg-secondary/90 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          Generate Proof
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
