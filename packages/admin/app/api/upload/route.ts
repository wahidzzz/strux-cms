import { NextResponse } from 'next/server';
import { getCMS } from '@/lib/cms';
import { requireAuth, getRequestContext } from '@/lib/auth-helper';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const payload = formData.get('fileInfo');
    
    // Check if files exist
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: { status: 400, name: 'BadRequestError', message: 'No files provided for upload.' } }, 
        { status: 400 }
      );
    }

    const cms = await getCMS();
    const mediaEngine = cms.getMediaEngine();

    const context = await requireAuth(request);

    // Support single or multiple uploads
    const uploadedFiles = [];
    for (const file of files) {
       // Convert Next.js File object to the shape expected by MediaEngine
       // MediaEngine expects { originalFilename, mimetype, filepath, buffer, size }
       
       const arrayBuffer = await file.arrayBuffer();
       const buffer = Buffer.from(arrayBuffer);
       
       const uploadFile = {
         name: file.name,
         originalFilename: file.name,
         mimetype: file.type,
         size: file.size,
         buffer: buffer
       };

       const result = await mediaEngine.upload(uploadFile, context);
       uploadedFiles.push(result);
    }

    return NextResponse.json({
        data: uploadedFiles.length === 1 ? uploadedFiles[0] : uploadedFiles 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Upload API Error:', error);
    return NextResponse.json(
      { error: { status: 500, name: 'InternalServerError', message: error.message } }, 
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
   // Proxy for fetching media
   try {
     const cms = await getCMS();
     const mediaEngine = cms.getMediaEngine();
     const context = await getRequestContext(request);
     
     const url = new URL(request.url);
     const query = Object.fromEntries(url.searchParams.entries());
     
     const result = await mediaEngine.findMany(query, context);
     
     return NextResponse.json({
       data: result.data,
       meta: result.meta
     });
   } catch(error: any) {
       return NextResponse.json(
          { error: { status: 500, name: 'InternalServerError', message: error.message } }, 
          { status: 500 }
       );
   }
}
