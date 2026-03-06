import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { getRequestContext } from '@/lib/auth-helper'
import { createContentRouteHandler } from '@cms/api'

const handler = createContentRouteHandler()

export async function GET(
  request: Request,
  { params }: { params: { contentType: string } }
) {
  const cms = await getCMS()
  const contentEngine = cms.getContentEngine()
  
  // Use proper auth context instead of hardcoded admin
  const context = await getRequestContext(request)
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams.entries())

  const response = await handler.findMany(
    {
      params: { contentType: params.contentType },
      query,
      context
    },
    contentEngine
  )

  if (response.error) {
    return NextResponse.json(response.error, { status: response.error.status })
  }

  return NextResponse.json(response)
}

export async function POST(
  request: Request,
  { params }: { params: { contentType: string } }
) {
  const cms = await getCMS()
  const contentEngine = cms.getContentEngine()
  const context = await getRequestContext(request)
  
  try {
    const body = await request.json()
    
    // We send data flat from the UI, so wrap it in `data`
    const payload = body.data ? body : { data: body }

    const response = await handler.create(
      {
        params: { contentType: params.contentType },
        body: payload,
        context
      },
      contentEngine
    )

    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }

    return NextResponse.json(response)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
