import { NextResponse } from 'next/server';
import { join } from 'path';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  try {
    const p = params.path.join('/');
    // Base path points to the root of the monorepo where the 'uploads' dir is.
    const filePath = join(process.cwd(), '..', '..', 'uploads', p);
    
    try {
      const stats = await stat(filePath);
      
      // Determine content type based on extension
      const ext = filePath.split('.').pop()?.toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'svg') contentType = 'image/svg+xml';
      else if (ext === 'pdf') contentType = 'application/pdf';
      else if (ext === 'mp4') contentType = 'video/mp4';

      const fileBuffer = await fs.readFile(filePath);

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });

    } catch (e) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
