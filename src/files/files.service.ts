import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';

export type ImageType = 'jpg' | 'png' | 'webp';

const PUBLIC_PREFIX = '/public/uploads/';

/** Detects the real image type from the file header; the client-sent mimetype is not trusted. */
export function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'jpg';
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Stores uploaded files under `public/uploads` (served by the app at `/public/uploads`). */
@Injectable()
export class FilesService {
  private readonly root = resolve(process.cwd(), 'public', 'uploads');

  /** Validates the content, writes it as `<subdir>/<uuid>.<ext>` and returns its public URL. */
  async saveImage(buffer: Buffer, subdir: string): Promise<string> {
    const type = detectImageType(buffer);
    if (!type) throw new BadRequestException('errors.INVALID_IMAGE');

    const dir = join(this.root, subdir);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${type}`;
    await writeFile(join(dir, name), buffer);
    return `${PUBLIC_PREFIX}${subdir}/${name}`;
  }

  /** Deletes a file previously returned by saveImage. Ignores missing files and foreign paths. */
  async deleteByUrl(url: string): Promise<void> {
    if (!url.startsWith(PUBLIC_PREFIX)) return;
    const target = resolve(this.root, url.slice(PUBLIC_PREFIX.length));
    if (!target.startsWith(this.root + sep)) return; // path traversal guard
    await unlink(target).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
}
