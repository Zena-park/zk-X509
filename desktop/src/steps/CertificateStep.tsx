import { invoke } from "@tauri-apps/api/core";
import {
  ShieldCheck,
  ScanLine,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import type { AppState, Action, CertInfo } from "../App";

type Props = {
  state: AppState;
  setField: (field: keyof AppState, value: unknown) => void;
  dispatch: React.Dispatch<Action>;
};

function sourceBadge(source: string) {
  const colors: Record<string, string> = {
    Keychain: "bg-tertiary/15 text-tertiary",
    CertStore: "bg-secondary/15 text-secondary",
    File: "bg-on-surface-variant/15 text-on-surface-variant",
  };
  return colors[source] ?? colors.File;
}

export default function CertificateStep({
  state,
  setField,
  dispatch,
}: Props) {
  const handleScan = async () => {
    setField("loading", true);
    setField("error", null);
    try {
      const certs = await invoke<CertInfo[]>("scan_certificates");
      setField("certificates", certs);
      if (certs.length === 1) {
        setField("selectedCertIndex", 0);
      }
    } catch (e) {
      setField("error", String(e));
    } finally {
      setField("loading", false);
    }
  };

  const canProceed = state.selectedCertIndex !== null;

  return (
    <div className="flex-1 flex flex-col gap-4">
      {state.error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{state.error}</span>
          <button onClick={() => setField("error", null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-tertiary" />
            <h2 className="font-headline text-xl font-semibold text-on-surface">
              Select Certificate
            </h2>
          </div>
          <button
            onClick={handleScan}
            disabled={state.loading}
            className="flex items-center gap-1.5 bg-tertiary/10 text-tertiary border border-tertiary/20 font-label text-xs font-semibold rounded-lg py-2 px-3 hover:bg-tertiary/20 disabled:opacity-40 transition"
          >
            {state.loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ScanLine className="w-3.5 h-3.5" />
            )}
            Scan Keychain
          </button>
        </div>

        {/* Certificate list */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
          {state.certificates.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant text-sm">
              {state.loading
                ? "Scanning certificates..."
                : 'Click "Scan Keychain" to find certificates'}
            </div>
          ) : (
            state.certificates.map((cert) => {
              const selected = state.selectedCertIndex === cert.index;
              return (
                <button
                  key={cert.index}
                  onClick={() => setField("selectedCertIndex", cert.index)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? "border-tertiary/50 bg-tertiary/5"
                      : "border-outline-variant/15 bg-surface-container-low hover:border-outline-variant/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-headline text-sm font-semibold text-on-surface truncate">
                        {cert.subject}
                      </div>
                      <div className="text-xs text-on-surface-variant mt-1">
                        Issuer: {cert.issuer}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant/70">
                        <span className="font-mono truncate max-w-[180px]">
                          {cert.serial}
                        </span>
                        <span>Expires: {cert.expires}</span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-label font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${sourceBadge(cert.source)}`}
                    >
                      {cert.source}
                    </span>
                  </div>
                </button>
              );
            })
          )}
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
          Next
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
