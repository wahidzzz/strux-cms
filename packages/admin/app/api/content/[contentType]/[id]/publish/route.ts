import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createContentRouteHandler } from '@cms/api'

const handler = createContentRouteHandler()

export async function POST(
  request: Request,
  { params }: { params: { contentType: string; id: string } }
) {
  const cms = await getCMS()
  const contentEngine = cms.getContentEngine()
  const context = { role: 'admin' }

  // We mock a request object using what the handler expects
  const reqObj = {
    params: { contentType: params.contentType, id: params.id },
    context
  }

  const response = await handler.publish(reqObj as any, contentEngine)

  if (response.error) {
    return NextResponse.json(response.error, { status: response.error.status })
  }

  return NextResponse.json(response)
}
