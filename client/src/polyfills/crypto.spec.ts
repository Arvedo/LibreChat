import {
  sha1Bytes,
  sha256Bytes,
  installCryptoSubtleFallback,
} from './crypto';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('crypto polyfill (FIPS 180-4 & insecure-context SubtleCrypto fallback)', () => {
  describe('sha1Bytes', () => {
    it.each([
      ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
      ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
      [
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
      ],
    ])('computes the standard FIPS 180-4 SHA-1 digest for %j', (input, expectedHex) => {
      expect(toHex(sha1Bytes(encodeUtf8(input)))).toBe(expectedHex);
    });
  });

  describe('sha256Bytes', () => {
    it.each([
      ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      [
        'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      ],
    ])('computes the standard FIPS 180-4 SHA-256 digest for %j', (input, expectedHex) => {
      expect(toHex(sha256Bytes(encodeUtf8(input)))).toBe(expectedHex);
    });
  });

  describe('installCryptoSubtleFallback', () => {
    it('returns false when target has no crypto object or already provides subtle and randomUUID', () => {
      expect(installCryptoSubtleFallback({})).toBe(false);

      const completeCrypto = {
        subtle: {} as SubtleCrypto,
        randomUUID: () => '00000000-0000-4000-8000-000000000000',
      } as unknown as Crypto;
      expect(installCryptoSubtleFallback({ crypto: completeCrypto })).toBe(false);
    });

    it('installs subtle.digest for SHA-1 and SHA-256 and supports BufferSource views', async () => {
      const mockCrypto = {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = (i * 17 + 3) & 0xff;
          }
          return arr;
        },
      } as unknown as Crypto;

      const installed = installCryptoSubtleFallback({ crypto: mockCrypto });
      expect(installed).toBe(true);
      expect(mockCrypto.subtle).toBeDefined();

      const fullBuffer = encodeUtf8('xxabcxx');
      const slicedView = new DataView(fullBuffer.buffer, 2, 3);

      const sha1Digest = await mockCrypto.subtle.digest('SHA-1', slicedView);
      expect(toHex(sha1Digest)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');

      const sha256Digest = await mockCrypto.subtle.digest(
        { name: 'sha-256' },
        encodeUtf8('abc').buffer,
      );
      expect(toHex(sha256Digest)).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('rejects unsupported digest algorithms with NotSupportedError', async () => {
      const mockCrypto = {} as unknown as Crypto;
      installCryptoSubtleFallback({ crypto: mockCrypto });

      await expect(mockCrypto.subtle.digest('SHA-512', encodeUtf8('abc'))).rejects.toMatchObject({
        name: 'NotSupportedError',
      });
    });

    it('installs an RFC 4122 v4 randomUUID fallback using getRandomValues', () => {
      const mockCrypto = {
        subtle: {} as SubtleCrypto,
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = i;
          }
          return arr;
        },
      } as unknown as Crypto;

      expect(installCryptoSubtleFallback({ crypto: mockCrypto })).toBe(true);
      const uuid = mockCrypto.randomUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });
  });
});
