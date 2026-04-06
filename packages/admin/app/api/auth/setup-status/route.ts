import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'

/**
 * GET /api/auth/setup-status
 * 
 * Public endpoint (no auth required) that checks whether the CMS
 * has been set up with at least one user account.
 * 
 * Used by the AuthProvider and root page to detect fresh installs
 * and route users to the setup wizard.
 */
export async function GET() {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    const users = await authEngine.listUsers()

    return NextResponse.json({
      isSetupComplete: users.length > 0,
      userCount: users.length
    })
  } catch (error: any) {
    return NextResponse.json(
      { isSetupComplete: false, userCount: 0, error: error.message },
      { status: 500 }
    )
  }
}
