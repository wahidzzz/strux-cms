import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createAuthRouteHandler } from '@cms/api'
import { getRequestContext } from '@/lib/auth-helper'

const handler = createAuthRouteHandler()

export async function POST(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    
    const users = await authEngine.listUsers()
    
    let context: any = { role: 'public' }
    
    // If users exist, require admin level
    if (users.length > 0) {
      context = await getRequestContext(request)
      if (context.role !== 'admin' && context.role !== 'super_admin') {
        return NextResponse.json(
          { status: 403, name: 'ForbiddenError', message: 'Admin access required to register new users' },
          { status: 403 }
        )
      }
    }
    
    const body = await request.json()
    
    // Pass mock context down for role bypass checks in underlying auth module
    const reqMock = { body, context }
    const response = await handler.register(reqMock as any, authEngine)

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
