import { protocol } from 'electron';
import fs from 'node:fs';
import type { MetadataService } from '../native/metadata-service';

export function registerThumbnailScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'nosved-thumb',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

export function setupThumbnailProtocol(getMetadataService: () => MetadataService | null): void {
  protocol.handle('nosved-thumb', (request) => {
    try {
      const match = request.url.match(/([a-f0-9]{64})/i);
      if (!match) {
        return new Response('Invalid thumbnail key', { status: 400 });
      }
      const rawKey = match[1].toLowerCase();

      const metadataService = getMetadataService();
      const thumbPath = metadataService?.getThumbnailPath(rawKey);
      if (!thumbPath || !fs.existsSync(thumbPath)) {
        return new Response('Thumbnail not found', { status: 404 });
      }

      const buffer = fs.readFileSync(thumbPath);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    } catch {
      return new Response('Protocol error', { status: 500 });
    }
  });
}
