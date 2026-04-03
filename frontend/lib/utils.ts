import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Truncate a hex string (address or hash) for display. */
export function truncateHex(h: string, head = 6, tail = 4): string {
  if (!h) return "";
  const truncated = `${h.slice(0, head)}...${h.slice(-tail)}`;
  return truncated.length < h.length ? truncated : h;
}

/** Validate a hex-encoded bytes string (0x-prefixed, even length). */
export function isValidHex(v: string): boolean {
  if (!v.startsWith("0x")) return false;
  const body = v.slice(2);
  if (body.length === 0 || body.length % 2 !== 0) return false;
  return /^[0-9a-fA-F]+$/.test(body);
}

/** Decode a bytes32 hex string to a UTF-8 string, stripping trailing null bytes. */
export function bytes32ToString(hex: string): string {
  if (!hex) return "";
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (stripped.length === 0 || !/^[0-9a-fA-F]+$/.test(stripped)) return "";
  if (/^0+$/.test(stripped)) return "";
  const bytes: number[] = [];
  for (let i = 0; i + 1 < stripped.length; i += 2) {
    const b = parseInt(stripped.slice(i, i + 2), 16);
    if (Number.isNaN(b) || b === 0) break;
    bytes.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Encode a UTF-8 string to a bytes32 hex string, right-padded with zeros.
 *  Trims whitespace. Throws if encoded length exceeds 32 bytes. */
export function stringToBytes32(str: string): string {
  const normalized = str?.trim();
  if (!normalized) return "0x" + "0".repeat(64);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(normalized);
  if (bytes.length > 32) {
    throw new Error(`String too long: ${bytes.length} bytes (max 32)`);
  }
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return "0x" + Array.from(padded).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Known contract error names/selectors → human-readable messages. */
const ERROR_MESSAGES: Array<{ match: string[]; message: string }> = [
  { match: ["AlreadyRegistered", "0x77caf672"], message: "This certificate is already registered to another wallet. Use Re-Register to transfer it to your current wallet." },
  { match: ["UserAlreadyVerified", "0x474c4446"], message: "Your wallet is already verified on this service." },
  { match: ["RegistrantMismatch", "0x961f88f4"], message: "The proof was generated for a different wallet address. Make sure you use the same wallet in the app and MetaMask." },
  { match: ["ProofTooOld", "0xfc4bdfcb"], message: "The proof has expired. Please generate a new proof with the app." },
  { match: ["ProofInFuture", "0xee294a62"], message: "The proof timestamp is in the future. Check your system clock." },
  { match: ["InvalidCaMerkleRoot", "0xe2c1516a"], message: "The CA certificate used is not trusted by this service. Check that your CA is in the Trusted CAs list." },
  { match: ["NullifierRevoked", "0xae8601ef"], message: "This certificate has been permanently revoked by the service admin." },
  { match: ["CertAlreadyExpired", "0x7d696a0c"], message: "Your X.509 certificate has expired. Please renew it with your CA provider." },
  { match: ["ContractPaused", "0xab35696f"], message: "This service is currently paused by the admin." },
  { match: ["ChainIdMismatch", "0x7373908b"], message: "Wrong network. The proof was generated for a different chain. Check your Chain ID setting." },
  { match: ["RegistryAddressMismatch"], message: "Wrong registry. The proof was generated for a different service address." },
  { match: ["InsufficientDisclosure", "0x7cb33563"], message: "The proof does not disclose enough identity fields required by this service." },
  { match: ["CountryMismatch"], message: "Your certificate's country does not match the required value for this service." },
  { match: ["OrgMismatch"], message: "Your certificate's organization does not match the required value for this service." },
  { match: ["OrgUnitMismatch"], message: "Your certificate's organizational unit does not match the required value for this service." },
  { match: ["CommonNameMismatch"], message: "Your certificate's common name does not match the required value for this service." },
  { match: ["NullifierNotRegistered", "0x0c3fc772"], message: "This certificate is not registered. Use Register instead of Re-Register." },
  { match: ["WalletIndexOutOfRange"], message: "The wallet index exceeds the maximum allowed per certificate." },
  { match: ["InvalidCrlMerkleRoot"], message: "The CRL root in the proof does not match. Your certificate may be on a revocation list." },
];

/** Parse a contract revert into a human-readable message. */
export function parseContractError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err);
  const data = (err as { data?: string })?.data ?? "";
  const searchStr = msg + " " + data;
  for (const { match, message } of ERROR_MESSAGES) {
    if (match.some((m) => searchStr.includes(m))) return message;
  }
  if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
    return "Transaction was rejected by the user.";
  }
  return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
}

const CONSTRAINT_LABELS = ["C", "O", "OU", "CN"] as const;

/** Format field constraint values into display strings like ["C=KR", "O=Samsung"]. */
export function formatFieldConstraints(values: string[]): string[] {
  const result: string[] = [];
  values.forEach((v, i) => {
    const s = bytes32ToString(v);
    if (s) result.push(`${CONSTRAINT_LABELS[i]}=${s}`);
  });
  return result;
}
