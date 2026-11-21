import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import multer from 'multer';
import { ApiError } from '../../errors/ApiError.js';
import { env } from '../../config/env.js';

const supportedFiles: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
};

const stagingDirectory = join(tmpdir(), 'enghub-resource-staging');

export const resourceUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      void mkdir(stagingDirectory, { recursive: true }).then(
        () => callback(null, stagingDirectory),
        (error: Error) => callback(error, stagingDirectory),
      );
    },
    filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`),
  }),
  limits: { fileSize: env.resourceMaxFileSizeBytes, files: 1, fields: 8, fieldSize: 12_000 },
  fileFilter: (_request, file, callback) => {
    const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!supportedFiles[extension] || supportedFiles[extension] !== file.mimetype) {
      callback(new ApiError(415, 'UNSUPPORTED_RESOURCE_FILE_TYPE', 'This file type is not supported.'));
      return;
    }
    callback(null, true);
  },
}).single('file');
