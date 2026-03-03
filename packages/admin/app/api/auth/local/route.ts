import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
// @ts-ignore
import jwt from 'jsonwebtoken'

export async function POST(request: Request) {
  try {
    const { identifier, password } = await request.json()
    
    // Simplistic auth for the admin UI - normally we'd check `.cms/users.json` via Auth Engine
    if (identifier === 'admin@example.com' && password === 'admin') {
      const cms = await getCMS()
      const config = cms.getConfig()
      
      const token = jwt.sign(
        { id: '1', role: 'admin' }, 
        config.jwt?.secret || 'fallback-secret',
        { expiresIn: config.jwt?.expiresIn || '7d' }
      )
      
      return NextResponse.json({
        jwt: token,
        user: { id: '1', email: identifier, role: 'admin', username: 'Admin User' }
      })
    }
    
    return NextResponse.json({ error: { message: 'Invalid credentials' } }, { status: 401 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
