import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import { memoryStorage } from 'multer';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 10;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Files are kept in memory so their content can be verified (see detectImageType)
 * before anything is written to disk.
 */
export const imageUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new BadRequestException('errors.INVALID_IMAGE'), false);
      return;
    }
    callback(null, true);
  },
};
