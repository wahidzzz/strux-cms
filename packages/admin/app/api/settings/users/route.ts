import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'

export async function GET(request: Request) {
  try {
    const cms = await getCMS()
    // Users are managed as a system-level content type 'user'
    const contentEngine = cms.getContentEngine()
    
    // In a fully featured version, we'd add parsing here for pagination/filtering.
    // For now, grabbing all users
    const result = await contentEngine.findMany('user', {})
    
    return NextResponse.json({ data: result.data, meta: result.meta })
  } catch (err: any) {
    // If the system hasn't bootstrapped the user type yet
    if (err.message.includes('Schema not found')) {
       return NextResponse.json({ data: [] })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
