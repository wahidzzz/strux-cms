import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createRolesRouteHandler } from '@cms/api'

const handler = createRolesRouteHandler()

export async function GET(request: Request) {
  try {
    const cms = await getCMS()
    const rbacEngine = cms.getRBACEngine()
    
    // In a real app we'd verify the requesting user here via middleware or headers
    
    const response = await handler.list({ body: {} }, rbacEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const cms = await getCMS()
    const rbacEngine = cms.getRBACEngine()
    const body = await request.json()
    
    const response = await handler.create({ body }, rbacEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
