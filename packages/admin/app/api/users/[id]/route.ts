import { NextResponse } from 'next/server'
import { getCMS } from '@/lib/cms'
import { createUsersRouteHandler } from '@cms/api'

const handler = createUsersRouteHandler()

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    
    const response = await handler.get({ params }, authEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    const body = await request.json()
    
    const response = await handler.update({ params, body }, authEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const cms = await getCMS()
    const authEngine = cms.getAuthEngine()
    
    const response = await handler.delete({ params }, authEngine)
    if (response.error) {
      return NextResponse.json(response.error, { status: response.error.status })
    }
    return NextResponse.json(response.data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
