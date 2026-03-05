import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createRolesRouteHandler } from '@cms/api'

const handler = createRolesRouteHandler()

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const cms = await getCMS()
    const rbacEngine = cms.getRBACEngine()
    
    const response = await handler.get({ params }, rbacEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const cms = await getCMS()
    const rbacEngine = cms.getRBACEngine()
    const body = await request.json()
    
    const response = await handler.update({ params, body }, rbacEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const cms = await getCMS()
    const rbacEngine = cms.getRBACEngine()
    
    const response = await handler.delete({ params }, rbacEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
