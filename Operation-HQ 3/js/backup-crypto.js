// backup-crypto.js — Encrypted data export (Roadmap §8, H2).
//
// The existing JSON export, now optionally encrypted with a passphrase
// before it ever touches disk — so a backup file sitting in Downloads or
// synced to cloud storage isn't a liability if it ends up somewhere it
// shouldn't. Uses the Web Crypto API, the same API Idea Vault already
// uses for its SHA-256 hashing (just the encrypt/decrypt side of it here
// instead of the one-way digest side).
//
// Parameters follow the current OWASP Password Storage Cheat Sheet
// (checked live against the actual current guidance, not assumed from
// training data): PBKDF2-HMAC-SHA256 at 600,000 iterations, a 128-bit
// random salt (NIST minimum). AES-256-GCM is authenticated encryption —
// a wrong passphrase or a tampered/corrupted file both fail loudly via
// the built-in auth-tag check, never silently returning garbage — with a
// fresh random 96-bit IV every single export, per NIST SP 800-38D.

const BackupCrypto = {
  PBKDF2_ITERATIONS: 600000,

  async deriveKey(passphrase, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: this.PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  },

  bufToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  },

  b64ToBuf(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  },

  async encrypt(plaintext, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16)); // 128-bit
    const iv = crypto.getRandomValues(new Uint8Array(12));   // 96-bit, correct size for AES-GCM
    const key = await this.deriveKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
    return {
      __hqEncrypted: true,
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: this.PBKDF2_ITERATIONS,
      salt: this.bufToB64(salt),
      iv: this.bufToB64(iv),
      ciphertext: this.bufToB64(ciphertext),
    };
  },

  // Throws on a wrong passphrase or corrupted/tampered ciphertext — AES-GCM
  // fails closed via its authentication tag rather than ever silently
  // decrypting to garbage. Callers should catch this and show a clear,
  // generic message (don't try to distinguish "wrong passphrase" from
  // "corrupted file" in the UI — that distinction isn't meaningfully
  // knowable from a failed auth-tag check, and guessing wrong is worse
  // than saying "try again").
  async decrypt(envelope, passphrase) {
    const salt = this.b64ToBuf(envelope.salt);
    const iv = this.b64ToBuf(envelope.iv);
    const ciphertext = this.b64ToBuf(envelope.ciphertext);
    const key = await this.deriveKey(passphrase, salt);
    const plaintextBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintextBuf);
  },

  isEncryptedEnvelope(obj) {
    return !!(obj && obj.__hqEncrypted === true && obj.salt && obj.iv && obj.ciphertext);
  },
};
