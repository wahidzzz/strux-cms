import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createSchemaRouteHandler } from '@cms/api'
import { requireAuth } from '@/lib/auth-helper'

export async function GET(
  request: Request,
  { params }: { params: { apiId: string } }
) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    const context = await requireAuth(request)
    
    const response = await handler.get({ params: { apiId: params.apiId }, context }, cms.getSchemaEngine())
    
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    
    return NextResponse.json(response)
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { apiId: string } }
) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    const context = await requireAuth(request)
    
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
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { apiId: string } }
) {
  try {
    const cms = await getCMS()
    const handler = createSchemaRouteHandler()
    const context = await requireAuth(request)
    
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
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status })
  }
}
