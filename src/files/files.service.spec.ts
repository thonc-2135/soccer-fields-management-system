import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { detectImageType, FilesService } from './files.service.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);

describe('detectImageType', () => {
  it('recognises png, jpg and webp by their header', () => {
    expect(detectImageType(PNG)).toBe('png');
    expect(detectImageType(JPG)).toBe('jpg');
    expect(detectImageType(WEBP)).toBe('webp');
  });

  it('rejects other content, even when it is named like an image', () => {
    expect(detectImageType(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('FilesService', () => {
  afterAll(() =>
    rm(join(process.cwd(), 'public', 'uploads', subdir), {
      recursive: true,
      force: true,
    }),
  );

  const service = new FilesService();
  const subdir = `unit-test-${Date.now()}`;
  const root = join(process.cwd(), 'public', 'uploads');

  it('saves a valid image and deletes it again', async () => {
    const url = await service.saveImage(PNG, subdir);
    expect(url).toMatch(
      new RegExp(`^/public/uploads/${subdir}/[0-9a-f-]{36}\\.png$`),
    );
    const path = join(root, url.replace('/public/uploads/', ''));
    expect(existsSync(path)).toBe(true);

    await service.deleteByUrl(url);
    expect(existsSync(path)).toBe(false);
    await service.deleteByUrl(url); // already gone: no error
  });

  it('refuses content that is not an image and writes nothing', async () => {
    await expect(
      service.saveImage(Buffer.from('hello'), subdir),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never deletes outside the uploads directory', async () => {
    await expect(
      service.deleteByUrl('/public/uploads/../../package.json'),
    ).resolves.toBeUndefined();
    await expect(service.deleteByUrl('/etc/passwd')).resolves.toBeUndefined();
    expect(existsSync(join(process.cwd(), 'package.json'))).toBe(true);
  });
});
