import { DevNav } from "@/components/dev/DevNav";
import { CodeBlock } from "@/components/dev/CodeBlock";

export const metadata = {
  title: "Contract reference — zk-X509 Developers",
  description: "IIdentityRegistry interface, view functions, events, and ABIs for zk-X509.",
};

const INTERFACE = `interface IIdentityRegistry {
    // --- gating ---
    function isVerified(address wallet) external view returns (bool);
    function verifiedUntil(address wallet) external view returns (uint64);

    // --- policy / metadata ---
    function owner() external view returns (address);
    function paused() external view returns (bool);
    function MAX_WALLETS_PER_CERT() external view returns (uint32);
    function MIN_DISCLOSURE_MASK() external view returns (uint8);
    function maxProofAge() external view returns (uint256);

    // --- trust anchors ---
    function caMerkleRoot() external view returns (bytes32);
    function crlMerkleRoot() external view returns (bytes32);
    function getCaCount() external view returns (uint256);

    // --- required cert fields (bytes32(0) = unconstrained) ---
    function requiredCountry() external view returns (bytes32);
    function requiredOrg() external view returns (bytes32);
    function requiredOrgUnit() external view returns (bytes32);
    function requiredCommonName() external view returns (bytes32);

    event UserRegistered(
        address indexed user, bytes32 nullifier,
        bytes32 country, bytes32 org, bytes32 orgUnit, bytes32 commonName
    );
}`;

const FACTORY = `interface IRegistryFactory {
    function getRegistries() external view returns (address[] memory);
    function registryInfo(address registry) external view returns (
        address creator, string memory name,
        uint32 maxWallets, uint8 minDisclosureMask,
        uint256 maxProofAge, uint256 createdAt, uint256 vKeyVersion
    );
    function isRegistry(address) external view returns (bool);

    event RegistryCreated(
        address indexed registry, address indexed owner, string name,
        uint32 maxWallets, uint8 minDisclosureMask, uint256 vKeyVersion
    );
}`;

const FNS: [string, string][] = [
  ["isVerified(address) → bool", "True if the wallet holds a current (non-expired) verification. The one call you need for gating."],
  ["verifiedUntil(address) → uint256", "Verification expiry (unix seconds); 0 if never verified."],
  ["paused() → bool", "When true the registry rejects new registrations."],
  ["MAX_WALLETS_PER_CERT() → uint32", "How many wallets one certificate may bind."],
  ["MIN_DISCLOSURE_MASK() → uint8", "Bitmask of certificate fields a proof must disclose."],
  ["maxProofAge() → uint256", "Max age (seconds) of the signed timestamp inside a proof."],
  ["caMerkleRoot() / getCaCount()", "Trust anchor: the set of accepted certificate authorities."],
  ["required{Country,Org,OrgUnit,CommonName}() → bytes32", "Field constraints; bytes32(0) means unconstrained."],
];

export default function ContractsPage() {
  return (
    <main className="max-w-4xl mx-auto pt-24 px-8 pb-16">
      <DevNav />

      <h1 className="text-3xl font-headline font-bold text-on-surface mb-3">Contract reference</h1>
      <p className="text-on-surface-variant leading-relaxed mb-8 max-w-2xl">
        Two contracts matter for integration: a per-service <span className="text-on-surface font-semibold">IdentityRegistry</span> (who is verified,
        and the service&apos;s policy) and the <span className="text-on-surface font-semibold">RegistryFactory</span> (deploys/indexes registries).
        Below is the read surface — copy the interface straight into your project.
      </p>

      <h2 className="text-lg font-headline font-bold text-on-surface mb-2">IIdentityRegistry</h2>
      <CodeBlock lang="solidity" code={INTERFACE} />

      <h2 className="text-lg font-headline font-bold text-on-surface mt-8 mb-3">View functions</h2>
      <div className="glass-panel rounded-2xl border border-outline-variant/10 divide-y divide-outline-variant/10 text-sm">
        {FNS.map(([sig, desc]) => (
          <div key={sig} className="p-4">
            <code className="font-mono text-xs text-tertiary">{sig}</code>
            <p className="text-on-surface-variant mt-1">{desc}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-headline font-bold text-on-surface mt-8 mb-2">IRegistryFactory</h2>
      <CodeBlock lang="solidity" code={FACTORY} />

      <h2 className="text-lg font-headline font-bold text-on-surface mt-8 mb-2">ABIs</h2>
      <p className="text-sm text-on-surface-variant leading-relaxed">
        Human-readable ABIs are exported from{" "}
        <code className="font-mono text-tertiary">@tokamak-network/zk-x509-sdk</code> as{" "}
        <code className="font-mono">IDENTITY_REGISTRY_ABI</code> and <code className="font-mono">REGISTRY_FACTORY_ABI</code>, ready to drop into{" "}
        <code className="font-mono">new ethers.Contract(addr, ABI, provider)</code>.
      </p>
    </main>
  );
}
