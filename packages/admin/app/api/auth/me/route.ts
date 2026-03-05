import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createAuthRouteHandler, authenticate } from '@cms/api'

const handler = createAuthRouteHandler()

export async function GET(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    const config = cms.getConfig()
    
    // Authenticate request
    const authRequest = {
      headers: {
        authorization: request.headers.get('authorization') || undefined
      }
    }
    
    const authResult = authenticate(authRequest, config.jwt.secret)
    
    if (!authResult.success) {
      return NextResponse.json(authResult.error, { status: authResult.error?.status || 401 })
    }

    const response = await handler.me(
      { context: authResult.context },
      authEngine
    )

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

export async function PUT(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    const config = cms.getConfig()
    
    const authRequest = { headers: { authorization: request.headers.get('authorization') || undefined } }
    const authResult = authenticate(authRequest, config.jwt.secret)
    if (!authResult.success) return NextResponse.json(authResult.error, { status: 401 })

    const body = await request.json()
    const response = await handler.updateMe({ context: authResult.context, body }, authEngine)
    if (response.error) return NextResponse.json(response.error, { status: response.error.status })
    return NextResponse.json(response)
  } catch (error: any) {
    return NextResponse.json({ status: 500, message: error.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    const config = cms.getConfig()
    
    const authRequest = { headers: { authorization: request.headers.get('authorization') || undefined } }
    const authResult = authenticate(authRequest, config.jwt.secret)
    if (!authResult.success) return NextResponse.json(authResult.error, { status: 401 })

    const body = await request.json()
    const response = await handler.changePassword({ context: authResult.context, body }, authEngine)
    if (response.error) return NextResponse.json(response.error, { status: response.error.status })
    return NextResponse.json(response)
  } catch (error: any) {
    return NextResponse.json({ status: 500, message: error.message }, { status: 500 })
  }
}
