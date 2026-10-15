import crypto from 'crypto';

export class ScryptPasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derived) => {
        if (err) reject(err);
        else resolve(derived);
      });
    });
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    const [salt, key] = hash.split(':');
    if (!salt || !key) return false;
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derived) => {
        if (err) reject(err);
        else resolve(derived);
      });
    });
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
  }
}
