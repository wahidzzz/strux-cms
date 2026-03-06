import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createApiKeysRouteHandler } from '@cms/api'
import { requireSuperAdmin } from '@/lib/auth-helper'

const handler = createApiKeysRouteHandler()

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request)
    const cms = await getCMS()
    const apiKeyEngine = cms.getApiKeyEngine()
    
    const response = await handler.list({ body: {} }, apiKeyEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    const status = error.status || 500
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status }
    )
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireSuperAdmin(request)
    const cms = await getCMS()
    const apiKeyEngine = cms.getApiKeyEngine()
    const body = await request.json()
    
    const response = await handler.create(
      { body, context: { userId: context.userId } },
      apiKeyEngine
    )
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data, { status: 201 })
  } catch (error: any) {
    const status = error.status || 500
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status }
    )
  }
}
