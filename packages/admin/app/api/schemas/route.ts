import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createSchemaRouteHandler } from '@cms/api'
import { requireAuth } from '@/lib/auth-helper'

// Mock incoming requests
const mockReq = {
  user: undefined,
  body: {},
  params: {}
}

const mockRes = {
  json: (data: any) => data,
  status: (code: number) => ({
    send: (data?: any) => data || { status: code },
    json: (data: any) => data
  })
}

// Map Next.js Request to Express-like request
async function parseRequest(request: Request, params?: any) {
  let body = {}
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.json()
    }
  } catch (e) {
    // Ignore JSON parse errors
  }
  
  return {
    ...mockReq,
    body,
    params: params || {},
    query: Object.fromEntries(new URL(request.url).searchParams)
  }
}

export async function GET(request: Request) {
  try {
    const cms = await getCMS()
    const schemaHandler = createSchemaRouteHandler()
    const context = await requireAuth(request)
    const req = await parseRequest(request)
    
    // We provide cms context explicitly to list method as first argument if needed
    const result = await schemaHandler.list({ ...req, context }, cms.getSchemaEngine())
    return NextResponse.json(result)
  } catch (error: any) {
    const status = error.status || 500
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status }
    )
  }
}
