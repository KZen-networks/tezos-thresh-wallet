// @flow
import pbkdf2 from 'pbkdf2';
import sodium from 'libsodium-wrappers';
import utility from './utility';
import { prefix as _prefix } from './constants';
import type { Key as KeyInterface } from './types';

/**
 * @description Creates a key object from a base58 encoded key.
 * @param {String} key A public or secret key in base58 encoding, or a 15 word bip39 english mnemonic string
 * @param {String} passphrase The passphrase used if the key provided is an encrypted private key or a fundraiser key
 * @param {String} email Email used if a fundraiser key is passed
 */
export default class Key implements KeyInterface {
  _publicKey: string;
  _secretKey: ?string;
  _sodium: any;
  _isLedger: boolean;
  _ledgerPath: string;
  _ledgerCurve: number;
  publicKey: string;
  secretKey: string;
  publicKeyHash: string;
  isLedger: boolean;
  ledgerPath: string;
  ledgerCurve: number;
  ready: Promise<void>;
  curve: string;
  isSecret: boolean;

  constructor(key: string, passphrase: ?string, email: ?string) {
    this._isLedger = false;
    this._ledgerPath = "44'/1729'/0'/0'";
    this._ledgerCurve = 0x00;
    this.ready = new Promise((resolve) => {
      this.initialize(key, passphrase, email, resolve);
    });
  }

  get isLedger(): boolean {
    return this._isLedger;
  }

  set isLedger(value: boolean): void {
    this._isLedger = value;
  }

  get ledgerPath(): string {
    return this._ledgerPath;
  }

  set ledgerPath(value: string): void {
    this._ledgerPath = value;
  }

  get ledgerCurve(): number {
    return this._ledgerCurve;
  }

  set ledgerCurve(value: number): void {
    this._ledgerCurve = value;
  }

  initialize = async (key: string, passphrase: ?string, email: ?string, ready: any) => {
    try {
      await sodium.ready;
      this._sodium = sodium;
    } catch (e) {
      throw new Error(e);
    }

    if (email) {
      if (!passphrase) {
        throw new Error('Fundraiser key provided without a passphrase.');
      }

      const salt = utility.textDecode(utility.textEncode(`${email}${passphrase}`)).normalize('NFKD');
      const seed = pbkdf2.pbkdf2Sync(key, `mnemonic${salt}`, 2048, 64, 'sha512');
      const { publicKey, privateKey } = this._sodium.crypto_sign_seed_keypair(seed.slice(0, 32));

      this._publicKey = publicKey;
      this._secretKey = privateKey;
      this.curve = 'ed';
      this.isSecret = true;
      ready();
      return;
    }

    this.curve = key.substr(0, 2);

    if (!['sp', 'p2', 'ed'].includes(this.curve)) {
      throw new Error('Invalid prefix for a key encoding.');
    }

    if (![54, 55, 88, 98].includes(key.length)) {
      throw new Error('Invalid length for a key encoding');
    }

    const encrypted = key.substring(2, 3) === 'e';
    const publicOrSecret = encrypted ? key.slice(3, 5) : key.slice(2, 4);

    if (!['pk', 'sk'].includes(publicOrSecret)) {
      throw new Error('Invalid prefix for a key encoding.');
    }

    this.isSecret = publicOrSecret === 'sk';

    if (encrypted) {
      if (!passphrase) {
        throw new Error('Encrypted key provided without a passphrase.');
      }

      key = utility.b58cdecode(key, _prefix.edesk);

      const salt = key.slice(0, 8);
      const encryptedSk = key.slice(8);
      const encryptionKey = pbkdf2.pbkdf2Sync(passphrase, salt, 32768, 32, 'sha512');

      key = this._sodium.crypto_secretbox_open_easy(encryptedSk, new Uint8Array(24), encryptionKey);
      const { publicKey, privateKey } = this._sodium.crypto_sign_seed_keypair(key);
      this._publicKey = publicKey;
      this._secretKey = privateKey;
      ready();
      return;
    }

    if (!this.isSecret) {
      this._publicKey = utility.b58cdecode(key, _prefix[`${this.curve}pk`]);
      this._secretKey = undefined;
    } else if (this.curve === 'ed') {
      if (key.length === 54) { // seed
        const seed = utility.b58cdecode(key, _prefix.edsk2);
        const { publicKey, privateKey } = this._sodium.crypto_sign_seed_keypair(seed.slice(0, 32));
        this._publicKey = publicKey;
        this._secretKey = privateKey;
      } else { // secret key
        this._secretKey = utility.b58cdecode(key, _prefix.edsk);
        this._publicKey = utility.b58cdecode(key, _prefix.edsk).slice(32);
      }
    } else {
      throw new Error('Secp256k1 and P256 curves are not yet supported.');
    }

    ready();
  }

  /**
   * @memberof Key
   * @description Returns the public key
   * @returns {String} The public key associated with the private key
   */
  publicKey = (): string => utility.b58cencode(this._publicKey, _prefix[`${this.curve}pk`]);

  /**
   * @memberof Key
   * @description Returns the secret key
   * @returns {String} The secret key associated with this key, if available
   */
  secretKey = (): string => {
    if (!this._secretKey) {
      throw new Error('Secret key not known.');
    }

    return utility.b58cencode(this._secretKey, _prefix[`${this.curve}sk`]);
  }

  /**
   * @memberof Key
   * @description Returns public key hash for this key
   * @returns {String} The public key hash for this key
   */
  publicKeyHash = (): string => {
    const prefixMap = {
      ed: _prefix.tz1,
      sp: _prefix.tz2,
      p2: _prefix.tz3,
    };

    const prefix = prefixMap[this.curve];
    return utility.b58cencode(this._sodium.crypto_generichash(20, this._publicKey), prefix);
  }

  /**
   * @memberof Key
   * @description Sign a raw sequence of bytes
   * @param {String} bytes Sequence of bytes, raw format or hexadecimal notation
   * @param {Uint8Array} watermark The watermark bytes
   * @returns {String} The public key hash for this key
   */
  sign = async (bytes: string, watermark: Uint8Array) => {
    let bb = utility.hex2buf(bytes);
    if (typeof watermark !== 'undefined') {
      bb = utility.mergebuf(watermark, bb);
    }

    const sig = this._sodium.crypto_sign_detached(this._sodium.crypto_generichash(32, bb), this._secretKey);
    const edsig = utility.b58cencode(sig, _prefix.edsig);
    const sbytes = bytes + utility.buf2hex(sig);

    return {
      bytes,
      sig: utility.b58cencode(sig, _prefix.sig),
      edsig,
      sbytes,
    };
  }

  /**
   * @memberof Key
   * @description Verify signature, throw error if it is not valid
   * @param {String} bytes Sequance of bytes, raw format or hexadecimal notation
   * @param {Uint8Array} signature A signature in base58 encoding
   */
  verify = (bytes: string, signature: string) => {
    if (!this._publicKey) {
      throw new Error('Cannot verify without a public key');
    }

    if (signature.slice(0, 3) !== 'sig') {
      if (this.curve !== signature.slice(0, 2)) { // 'sp', 'p2' 'ed'
        throw new Error('Signature and public key curves mismatch.');
      }
    }

    if (this.curve === 'ed') {
      const digest = utility.hex2buf(bytes);
      try {
        return this._sodium.crypto_sign_verify_detached(signature, digest, this._publicKey);
      } catch (e) {
        throw new Error('Signature is invalid.');
      }
    } else {
      throw new Error(`Curve '${this.curve}' not supported`);
    }
  }
}
