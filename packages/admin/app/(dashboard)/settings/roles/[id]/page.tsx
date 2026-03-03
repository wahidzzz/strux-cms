import { getCMS } from '@/lib/cms'
import { notFound } from 'next/navigation'
import RoleForm from '../(components)/RoleForm'

export const dynamic = 'force-dynamic'

export default async function RoleEditPage({ params }: { params: { id: string } }) {
  const isNew = params.id === 'new'
  let role = null

  if (!isNew) {
    const cms = await getCMS()
    const rbac = cms.getRBACEngine()
    // @ts-ignore - internal admin bypass
    role = rbac.config.roles[params.id]
    
    if (!role) {
      notFound()
    }
  }

  return (
    <div className="max-w-5xl">
       <RoleForm initialRole={role} isNew={isNew} />
    </div>
  )
}
