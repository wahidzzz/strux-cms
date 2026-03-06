import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { requireSuperAdmin } from '@/lib/auth-helper'

export async function GET(request: Request) {
    try {
        await requireSuperAdmin(request)
        
        const cms = await getCMS()
        const config = cms.getConfig()

        return NextResponse.json(config.security || {
            rateLimit: { enabled: true, maxRequests: 60, windowMs: 60000 },
            ipBlocking: { enabled: false, blacklist: [], whitelist: [] },
            cors: { enabled: true, origins: ['*'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'] }
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: error.status || 500 })
    }
}

export async function PUT(request: Request) {
    try {
        await requireSuperAdmin(request)
        
        const cms = await getCMS()
        const body = await request.json()
        const updatedConfig = await cms.updateConfig({ security: body })

        return NextResponse.json(updatedConfig.security)
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: error.status || 500 })
    }
}
