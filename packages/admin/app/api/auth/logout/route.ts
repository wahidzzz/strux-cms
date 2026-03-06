import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createAuthRouteHandler } from '@cms/api'
import { cookies } from 'next/headers'

const handler = createAuthRouteHandler()

export async function POST(request: Request) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    
    // Get refresh token from cookie
    const cookieStore = cookies()
    const refreshToken = cookieStore.get('refresh_token')?.value
    
    if (refreshToken) {
      await handler.logout({ body: { refreshToken } }, authEngine)
    }

    // Clear cookies
    const res = NextResponse.json({ success: true })
    res.cookies.delete('token')
    res.cookies.delete('refresh_token')

    return res
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
