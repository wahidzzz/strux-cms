import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createContentRouteHandler } from '@cms/api'
import { requireAuth } from '@/lib/auth-helper'

const handler = createContentRouteHandler()

export async function POST(
  request: Request,
  { params }: { params: { contentType: string; id: string } }
) {
  try {
    const cms = await getCMS()
    const contentEngine = cms.getContentEngine()
    const context = await requireAuth(request)

    // We mock a request object using what the handler expects
    const reqObj = {
      params: { contentType: params.contentType, id: params.id },
      context
    }

    const response = await handler.unpublish(reqObj as any, contentEngine)

    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }

    return NextResponse.json(response)
  } catch (error: any) {
    const status = error.status || 500
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status }
    )
  }
}
