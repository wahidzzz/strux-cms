import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createSchemaRouteHandler } from '@cms/api'

export async function GET(request: Request) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    
    // We mock the Request context required by the API
    const context = { role: 'admin', userId: 'local', user: null as any }
    
    const response = await handler.list({ params: {}, context }, cms.getSchemaEngine())
    
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    
    return NextResponse.json(response)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    
    const context = { role: 'admin', userId: 'local', user: null as any }
    const body = await request.json()
    const payload = body.data ? body : { data: body }

    const response = await handler.create(
      { params: {}, body: payload, context }, 
      cms.getSchemaEngine()
    )
    
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    
    return NextResponse.json(response)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
