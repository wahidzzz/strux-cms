import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cms = await getCMS()
    const rbac = cms.getRBACEngine()
    
    // We get the full config since RBAC engine saves it to memory
    // @ts-ignore - internal admin bypass
    const config = rbac.config
    const role = config.roles[params.id]
    
    if (!role) {
       return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }
    
    return NextResponse.json({ data: role })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cms = await getCMS()
    const rbac = cms.getRBACEngine()
    const body = await request.json()
    const payload = body.data || body
    
    await rbac.updateRole(params.id, payload)
    
    return NextResponse.json({ data: payload })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cms = await getCMS()
    const rbac = cms.getRBACEngine()
    
    await rbac.deleteRole(params.id)
    
    return NextResponse.json({ success: true, id: params.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
