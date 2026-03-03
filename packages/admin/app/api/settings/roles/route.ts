import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'

// Get all roles
export async function GET() {
  try {
    const cms = await getCMS()
    const rbac = cms.getRBACEngine()
    
    // We get the full config since RBAC engine saves it to memory
    // @ts-ignore - internal admin bypass
    const config = rbac.config
    
    return NextResponse.json({ data: Object.values(config.roles) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Create new role
export async function POST(request: Request) {
  try {
    const cms = await getCMS()
    const rbac = cms.getRBACEngine()
    const body = await request.json()
    const payload = body.data || body
    
    if (!payload.id || !payload.name) {
       return NextResponse.json({ error: 'Role requires id and name' }, { status: 400 })
    }
    
    await rbac.createRole(payload)
    
    return NextResponse.json({ data: payload })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
