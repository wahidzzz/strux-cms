import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { requireSuperAdmin } from '@/lib/auth-helper'

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request)
    const cms = await getCMS()
    // By accessing the internal config mechanism, we proxy the global settings
    const config = cms.getConfig()
    
    return NextResponse.json({ data: config })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status })
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request)
    const cms = await getCMS()
    const body = await request.json()
    const payload = body.data || body
    
    // We update the local configuration.
    // In a fully robust scenario, we'd add `saveConfiguration` to `@cms/core`.
    // For now, this is a proxy that represents where that code binds.
    
    // We'll write to `.cms/config.json` manually here as a bridge, 
    // or trigger a theoretical `cms.updateConfig(payload)`
    const fs = require('fs').promises
    const path = require('path')
    
    const configPath = path.join(process.cwd(), '../../.cms', 'config.json')
    await fs.writeFile(configPath, JSON.stringify(payload, null, 2))
    
    // Trigger a reload
    // @ts-ignore
    if (typeof cms.loadConfiguration === 'function') {
      // @ts-ignore
      await cms.loadConfiguration()
    }
    
    return NextResponse.json({ data: payload })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status })
  }
}
