import { createHash } from "node:crypto";

export function createIdentityKey(issuer: string, subject: string) {
    if (!issuer || !subject) throw new Error("Verified identity is incomplete.");
    return createHash("sha256").update(JSON.stringify([issuer, subject])).digest("hex");
}
