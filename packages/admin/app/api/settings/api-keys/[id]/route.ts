import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createApiKeysRouteHandler } from '@cms/api'
import { requireSuperAdmin } from '@/lib/auth-helper'

const handler = createApiKeysRouteHandler()

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperAdmin(request)
    const cms = await getCMS()
    const apiKeyEngine = cms.getApiKeyEngine()
    
    const response = await handler.delete(
      { params: { id: params.id } },
      apiKeyEngine
    )
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
