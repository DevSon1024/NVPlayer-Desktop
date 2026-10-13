import { protocol, net } from 'electron';
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
      const url = new URL(request.url);
      const rawKey = (url.hostname || url.pathname).replace(/^\/+|\/+$/g, '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(rawKey)) {
        return new Response('Invalid thumbnail key', { status: 400 });
      }

      const metadataService = getMetadataService();
      const thumbPath = metadataService?.getThumbnailPath(rawKey);
      if (!thumbPath || !fs.existsSync(thumbPath)) {
        return new Response('Thumbnail not found', { status: 404 });
      }

      const normalized = thumbPath.replace(/\\/g, '/');
      return net.fetch(`file:///${normalized}`);
    } catch {
      return new Response('Protocol error', { status: 500 });
    }
  });
}
