import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createContentRouteHandler } from '@cms/api'

const handler = createContentRouteHandler()

export async function GET(
  request: Request,
  { params }: { params: { contentType: string; id: string } }
) {
  const cms = await getCMS()
  const contentEngine = cms.getContentEngine()
  const context = { role: 'admin' }
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams.entries())

  const response = await handler.findOne(
    {
      params: { contentType: params.contentType, id: params.id },
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

export async function PUT(
  request: Request,
  { params }: { params: { contentType: string; id: string } }
) {
  const cms = await getCMS()
  const contentEngine = cms.getContentEngine()
  const context = { role: 'admin' }
  
  try {
    const body = await request.json()
    const payload = body.data ? body : { data: body }

    const response = await handler.update(
      {
        params: { contentType: params.contentType, id: params.id },
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

export async function DELETE(
  request: Request,
  { params }: { params: { contentType: string; id: string } }
) {
  const cms = await getCMS()
  const contentEngine = cms.getContentEngine()
  const context = { role: 'admin' }

  const response = await handler.delete(
    {
      params: { contentType: params.contentType, id: params.id },
      context
    },
    contentEngine
  )

  if (response.error) {
    return NextResponse.json(response.error, { status: response.error.status })
  }

  return NextResponse.json(response)
}
