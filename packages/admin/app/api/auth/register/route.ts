import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createAuthRouteHandler } from '@cms/api'

const handler = createAuthRouteHandler()

export async function POST(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    
    const body = await request.json()
    const response = await handler.register({ body }, authEngine)

    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }

    return NextResponse.json(response)
  } catch (error: any) {
    return NextResponse.json(
      { status: 500, name: 'InternalServerError', message: error.message },
      { status: 500 }
    )
  }
}
