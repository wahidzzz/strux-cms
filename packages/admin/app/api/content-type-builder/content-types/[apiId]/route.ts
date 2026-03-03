import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createSchemaRouteHandler } from '@cms/api'

export async function GET(
  request: Request,
  { params }: { params: { apiId: string } }
) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    const context = { role: 'admin', userId: 'local', user: null as any }
    
    const response = await handler.get({ params: { apiId: params.apiId }, context }, cms.getSchemaEngine())
    
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    
    return NextResponse.json(response)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { apiId: string } }
) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    const context = { role: 'admin', userId: 'local', user: null as any }
    
    const body = await request.json()
    const payload = body.data ? body : { data: body }

    const response = await handler.update(
      { params: { apiId: params.apiId }, body: payload, context }, 
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

export async function DELETE(
  request: Request,
  { params }: { params: { apiId: string } }
) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    const context = { role: 'admin', userId: 'local', user: null as any }
    
    const response = await handler.delete(
      { params: { apiId: params.apiId }, context }, 
      cms.getSchemaEngine(),
      cms
    )
    
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    
    return NextResponse.json(response)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
