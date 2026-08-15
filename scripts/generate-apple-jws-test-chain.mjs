/**
 * Regenerates the throwaway certificate chain used by the Apple JWS verification
 * tests, at apps/web/src/lib/iap/apple/__tests__/fixtures/test-chain.ts.
 *
 * The chain proves that a JWS which is internally consistent but NOT issued by
 * Apple is rejected, so the test needs a leaf private key to sign with. It is
 * emitted as a TypeScript module rather than .key/.crt files because the repo
 * ignores *.key and *.pem, and an ignored fixture would break CI.
 *
 * These keys are generated fresh on each run and grant access to nothing.
 *
 * Usage: node scripts/generate-apple-jws-test-chain.mjs [path-to-openssl]
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT_PATH = "apps/web/src/lib/iap/apple/__tests__/fixtures/test-chain.ts";
const OPENSSL = process.argv[2] ?? "openssl";
const SUBJECT_BASE = "/O=Beautonomi Test/C=ZA";

const dir = mkdtempSync(join(tmpdir(), "apple-jws-chain-"));
const at = (name) => join(dir, name);
const openssl = (args) => execFileSync(OPENSSL, args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });

try {
  writeFileSync(at("ca.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n");
  writeFileSync(at("leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n");

  const genKey = (name) =>
    openssl(["ecparam", "-genkey", "-name", "prime256v1", "-noout", "-out", at(`${name}.key`)]);

  genKey("root");
  openssl([
    "req", "-new", "-x509", "-key", at("root.key"), "-sha256", "-days", "7300",
    "-subj", `/CN=Beautonomi Test Root CA${SUBJECT_BASE}`, "-out", at("root.crt"),
  ]);

  const signChild = (name, issuer, ext, cn) => {
    genKey(name);
    openssl(["req", "-new", "-key", at(`${name}.key`), "-sha256", "-subj", `/CN=${cn}${SUBJECT_BASE}`, "-out", at(`${name}.csr`)]);
    openssl([
      "x509", "-req", "-in", at(`${name}.csr`), "-CA", at(`${issuer}.crt`), "-CAkey", at(`${issuer}.key`),
      "-CAcreateserial", "-sha256", "-days", "7300", "-extfile", at(ext), "-out", at(`${name}.crt`),
    ]);
  };

  signChild("intermediate", "root", "ca.ext", "Beautonomi Test Intermediate CA");
  signChild("leaf", "intermediate", "leaf.ext", "Beautonomi Test Signing Leaf");

  const derBase64 = (name) =>
    readFileSync(at(`${name}.crt`), "utf8")
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s+/g, "");

  const leafKeyPem = readFileSync(at("leaf.key"), "utf8").trim().split(/\r?\n/);

  const file = `/**
 * Throwaway EC P-256 certificate chain for the Apple JWS verification tests.
 *
 * Used to build a JWS whose signature and chain links all verify, but which is
 * rooted at our own test CA instead of Apple Root CA - G3. That is the case the
 * root pin exists to reject, so the fixture has to include the leaf private key.
 *
 * These values are test-only and authenticate nothing. Regenerate with
 * scripts/generate-apple-jws-test-chain.mjs.
 */

/** Leaf, intermediate, root as base64 DER, ordered for a JWS x5c header. */
export const TEST_X5C_CHAIN = [
  "${derBase64("leaf")}",
  "${derBase64("intermediate")}",
  "${derBase64("root")}",
];

export const TEST_LEAF_PRIVATE_KEY_PEM = [
${leafKeyPem.map((line) => `  "${line}",`).join("\n")}
  "",
].join("\\n");
`;

  writeFileSync(OUT_PATH, file);
  console.log(`Wrote ${OUT_PATH}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
