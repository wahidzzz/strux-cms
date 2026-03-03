import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cms = await getCMS()
    const mediaEngine = cms.getMediaEngine()
    
    // Attempt delete
    await mediaEngine.delete(params.id)
    
    return NextResponse.json({ success: true, id: params.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
