// src/modules/recursos/multer.config.ts
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';

// Crear carpeta de recursos si no existe
const uploadPath = './recursos';
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

export const multerConfig = {
  storage: diskStorage({
    destination: uploadPath, // Carpeta de destino
    filename: (req, file, callback) => {
      // Generar nombre único para el archivo
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-'); // YYYYMMDD-HHMMSS
      const randomSuffix = Math.round(Math.random() * 1E9);
      const ext = extname(file.originalname);
      const filename = `recurso-${timestamp}-${randomSuffix}${ext}`;
      callback(null, filename);
    },
  }),
  fileFilter: (req, file, callback) => {
    // Tipos de archivo permitidos
    const allowedMimes = [
      // Documentos
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      
      // Imágenes
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      
      // Videos
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-msvideo',
      
      // Archivos comprimidos
      'application/zip',
      'application/x-rar-compressed',
      'application/x-zip-compressed',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        new BadRequestException(
          `Tipo de archivo no permitido: ${file.mimetype}. Tipos permitidos: PDF, Word, Excel, PowerPoint, imágenes, videos, ZIP`
        ),
        false
      );
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo
  },
};