import { describe, it, expect } from "vitest";
import { parseCaDer, generateCaGuide } from "../x509";
import * as fs from "fs";
import * as path from "path";

const CA_CERTS_DIR = path.resolve(__dirname, "../../../data/ca-certs-kr");

describe("parseCaDer", () => {
  it("should parse a real CA DER file", () => {
    const files = fs.readdirSync(CA_CERTS_DIR).filter((f) => f.endsWith(".der"));
    if (files.length === 0) {
      console.warn("No CA DER files found in data/ca-certs-kr/, skipping test");
      return;
    }

    const der = new Uint8Array(fs.readFileSync(path.join(CA_CERTS_DIR, files[0])));
    const meta = parseCaDer(der);

    expect(meta).not.toBeNull();
    expect(meta!.subject).toBeTruthy();
    expect(meta!.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta!.algorithm).toBeTruthy();
  });

  it("should extract subject fields", () => {
    const files = fs.readdirSync(CA_CERTS_DIR).filter((f) => f.endsWith(".der"));
    if (files.length === 0) return;

    const der = new Uint8Array(fs.readFileSync(path.join(CA_CERTS_DIR, files[0])));
    const meta = parseCaDer(der);

    expect(meta).not.toBeNull();
    // At least one of CN or O should be present
    expect(meta!.subjectCn || meta!.subjectOrg).toBeTruthy();
  });

  it("should return null for invalid DER", () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const meta = parseCaDer(garbage);
    expect(meta).toBeNull();
  });

  it("should return null for empty input", () => {
    const meta = parseCaDer(new Uint8Array(0));
    expect(meta).toBeNull();
  });

  it("should parse all CA certs without crashing", () => {
    const files = fs.readdirSync(CA_CERTS_DIR).filter((f) => f.endsWith(".der"));
    let parsed = 0;

    for (const file of files) {
      const der = new Uint8Array(fs.readFileSync(path.join(CA_CERTS_DIR, file)));
      const meta = parseCaDer(der);
      if (meta) parsed++;
    }

    expect(parsed).toBeGreaterThan(0);
    console.log(`Parsed ${parsed}/${files.length} CA certs successfully`);
  });
});

describe("generateCaGuide", () => {
  it("should generate guide from metadata", () => {
    const guide = generateCaGuide({
      subject: "CN=yessignCA Class 3, O=yessign, C=kr",
      subjectCn: "yessignCA Class 3",
      subjectOrg: "yessign",
      country: "kr",
      issuerCn: "KISA RootCA 4",
      issuer: "CN=KISA RootCA 4, O=KISA, C=kr",
      algorithm: "RSA-2048",
      expires: "2027-06-15",
    });

    expect(guide.name).toBe("yessignCA Class 3");
    expect(guide.description).toContain("RSA-2048");
    expect(guide.description).toContain("kr");
    expect(guide.issue_url).toBe("");
    expect(guide.instructions).toBe("");
  });

  it("should fallback to org when CN is empty", () => {
    const guide = generateCaGuide({
      subject: "O=SomeOrg, C=US",
      subjectCn: "",
      subjectOrg: "SomeOrg",
      country: "US",
      issuerCn: "",
      issuer: "",
      algorithm: "ECDSA-P256",
      expires: "2030-01-01",
    });

    expect(guide.name).toBe("SomeOrg");
  });

  it("should use full subject as last resort", () => {
    const guide = generateCaGuide({
      subject: "O=Unknown",
      subjectCn: "",
      subjectOrg: "",
      country: "",
      issuerCn: "",
      issuer: "",
      algorithm: "Unknown",
      expires: "2030-01-01",
    });

    expect(guide.name).toBe("O=Unknown");
  });

  it("should generate guide from real DER", () => {
    const files = fs.readdirSync(CA_CERTS_DIR).filter((f) => f.endsWith(".der"));
    if (files.length === 0) return;

    const der = new Uint8Array(fs.readFileSync(path.join(CA_CERTS_DIR, files[0])));
    const meta = parseCaDer(der);
    expect(meta).not.toBeNull();

    const guide = generateCaGuide(meta!);
    expect(guide.name).toBeTruthy();
    expect(guide.description).toBeTruthy();
  });
});
