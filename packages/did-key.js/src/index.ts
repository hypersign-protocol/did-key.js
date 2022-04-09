import * as ed25519 from '@transmute/did-key-ed25519';
import * as secp256k1 from '@transmute/did-key-secp256k1';
import * as x25519 from '@transmute/did-key-x25519';
import * as bls12381 from '@transmute/did-key-bls12381';
import * as web from '@transmute/did-key-web-crypto';
import base64url from 'base64url';
export { ed25519, x25519, secp256k1, bls12381, web };

export const typeMap = {
  ed25519,
  x25519,

  secp256k1,
  bls12381,

  secp256r1: web,
  secp384r1: web,
  secp521r1: web,
};

export const startsWithMap = {
  'did:key:z6Mk': ed25519,
  'did:key:z6LS': x25519,

  'did:key:zQ3s': secp256k1,
  'did:key:z5Tc': bls12381,
  'did:key:zUC7': bls12381,

  'did:key:zDna': web,
  'did:key:z82L': web,
  'did:key:z2J9': web,
};

type generateFromRandomOptions = {
  kty: 'EC' | 'OKP';
  crvOrSize: 'P-256' | 'P-384' | 'P-521';
  secureRandom: () => Buffer;
};

export type curveName_ed25519 = 'ed25519';
export type curveName_secp256k1 = 'secp256k1';
export type curveName_secp256r1 = 'secp256r1';
export type curveName_secp384r1 = 'secp384r1';
export type curveName_secp521r1 = 'secp521r1';

export interface ResolutionOptions {
  accept: 'application/did+json' | 'application/did+ld+json';
}
export type GenerateKeyType =
  | curveName_ed25519
  | curveName_secp256k1
  | curveName_secp256r1
  | curveName_secp384r1
  | curveName_secp521r1;

export interface GenerateOptions {}

interface KeyCommonProps {
  id: string;
  type: string;
  controller: string;
}

interface JwkPairCommonProps {
  publicKeyJwk: any;
  privateKeyJwk: any;
}

interface LdPairCommonProps {
  publicKeyBase58: string;
  privateKeyBase58: string;
}

interface JwkKeyPair extends KeyCommonProps, JwkPairCommonProps {}
interface LdKeyPair extends KeyCommonProps, LdPairCommonProps {}

type DidKey = JwkKeyPair | LdKeyPair;
type DidDocument = { id: string; verificationMethod: any[] };
type DidResolution = { didDocument: DidDocument };
type DidGeneration = { didDocument: DidDocument; keys: DidKey[] };

export const noSupportForSeed = ['secp256r1', 'secp384r1', 'secp521r1'];

export const getOptionsForType = (type: string) => {
  if (type === 'secp256r1') {
    return {
      kty: 'EC',
      crvOrSize: 'P-256',
    };
  }

  if (type === 'secp384r1') {
    return {
      kty: 'EC',
      crvOrSize: 'P-384',
    };
  }

  if (type === 'secp521r1') {
    return {
      kty: 'EC',
      crvOrSize: 'P-521',
    };
  }
  throw new Error('No options for type: ' + type);
};

export const generate2 = async (options: any): Promise<DidGeneration> => {
  const { keys } = await generate(
    options.type,
    {
      secureRandom: () => {
        return Buffer.from(options.seed, 'hex');
      },
    },
    options
  );
  const [key]: any = keys;
  const { publicKeyJwk } = key;
  const kid =
    options.kid || publicKeyJwk.kid || keys[0].controller.split(':').pop();

  const jwk = {
    kid,
    // '@context': options.didDocument['@context'],
    // service: options.didDocument.service,
    ...publicKeyJwk,
  };
  const did = `did:jwk:${base64url.encode(JSON.stringify(jwk))}`;

  const didUrl = did; // + '#' + kid;
  const newDoc: any = {
    // '@context': options.didDocument['@context'],
    id: did,
    verificationMethod: [
      {
        id: didUrl,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: jwk,
      },
    ],
    authentication: [didUrl],
    capabilityInvocation: [didUrl],
    capabilityDelegation: [didUrl],
    keyAgreement: [didUrl],
    // service: (options.didDocument.service || []).map((s: any) => {
    //   return { ...s, id: did + s.id };
    // }),
  };
  const newKeys = [key].map((k) => {
    return { id: didUrl, controller: did, ...k };
  });
  return {
    keys: newKeys,
    didDocument: JSON.parse(JSON.stringify(newDoc)),
  };
};

export const generate = (
  type: string,
  generateOptions: GenerateOptions,
  resolutionOptions: ResolutionOptions
): Promise<DidGeneration> => {
  if (!(typeMap as any)[type]) {
    throw new Error('did-key.js does not support: ' + type);
  }
  let correctOptions = generateOptions;
  if (noSupportForSeed.includes(type)) {
    correctOptions = getOptionsForType(type) as generateFromRandomOptions;
  }
  return (typeMap as any)[type].generate(correctOptions, resolutionOptions);
};

const getKeyPairClassFromKey = (k: any) => {
  if (k.type === 'JsonWebKey2020') {
    if (k.publicKeyJwk.kty === 'EC' && k.publicKeyJwk.crv === 'secp256k1') {
      return secp256k1.Secp256k1KeyPair;
    }
    if (k.publicKeyJwk.kty === 'OKP' && k.publicKeyJwk.crv === 'Ed25519') {
      return ed25519.Ed25519KeyPair;
    }
    if (k.publicKeyJwk.kty === 'OKP' && k.publicKeyJwk.crv === 'X25519') {
      return x25519.X25519KeyPair;
    }
    if (k.publicKeyJwk.kty === 'EC' && k.publicKeyJwk.crv === 'BLS12381_G1') {
      return bls12381.Bls12381G1KeyPair;
    }
    if (k.publicKeyJwk.kty === 'EC' && k.publicKeyJwk.crv === 'BLS12381_G2') {
      return bls12381.Bls12381G2KeyPair;
    }
    return web.WebCryptoKey;
  }
  throw new Error('getKeyPairClassFromKey only supports JsonWebKey2020');
};

// necessary because of no support for deterministic key gen in some key types.
export const convert = async (
  keys: DidKey[],
  resolutionOptions: {
    accept: 'application/did+json' | 'application/did+ld+json';
  }
): Promise<DidGeneration> => {
  const oldRepresentation = await resolve(keys[0].controller, {
    accept: 'application/did+json',
  });
  const newRepresentation = await resolve(
    keys[0].controller,
    resolutionOptions
  );
  const converted = (await Promise.all(
    keys.map(async (k: any) => {
      const vm = newRepresentation.didDocument.verificationMethod.find((v) => {
        return v.id === k.id;
      });
      const vmAsJson = oldRepresentation.didDocument.verificationMethod.find(
        (v) => {
          return v.id === k.id;
        }
      );
      const KeyPair = getKeyPairClassFromKey(vmAsJson) as any;
      let k1 = await KeyPair.from(k);
      let k2 = await k1.export({
        type: vm.type,
        privateKey: true,
      });
      return k2;
    })
  )) as DidKey[];

  return { keys: converted, didDocument: newRepresentation.didDocument };
};

export const resolve = (
  did: string,
  resolutionOptions: {
    accept: 'application/did+json' | 'application/did+ld+json';
  }
): Promise<DidResolution> => {
  const startsWith = did.substring(0, 12);
  if (!(startsWithMap as any)[startsWith]) {
    throw new Error('did-key.js does not support: ' + startsWith + '...');
  }
  return (startsWithMap as any)[startsWith].resolve(did, resolutionOptions);
};
