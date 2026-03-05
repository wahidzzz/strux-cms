import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createUsersRouteHandler } from '@cms/api'

const handler = createUsersRouteHandler()

export async function GET(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    
    // In a real app we'd verify the requesting user here via middleware or headers
    
    const response = await handler.list({ body: {} }, authEngine)
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
    const authEngine = cms.getAuthEngine()
    const body = await request.json()
    
    const response = await handler.create({ body }, authEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
