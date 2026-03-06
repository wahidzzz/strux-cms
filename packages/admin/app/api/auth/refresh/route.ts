import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createAuthRouteHandler } from '@cms/api'
import { cookies } from 'next/headers'

const handler = createAuthRouteHandler()

export async function POST(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    const config = cms.getConfig()
    
    // Get refresh token from cookie
    const cookieStore = cookies()
    const refreshToken = cookieStore.get('refresh_token')?.value
    
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const response = await handler.refresh(
      { body: { refreshToken }, ip },
      authEngine,
      config.jwt.secret
    )

    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }

    // Set cookies
    const res = NextResponse.json(response)
    
    if (response.jwt) {
      res.cookies.set('token', response.jwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 // 1 day
      })
    }

    if (response.refreshToken) {
      res.cookies.set('refresh_token', response.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      })
    }

    return res
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
