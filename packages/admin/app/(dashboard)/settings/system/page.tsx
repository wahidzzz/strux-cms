import { getCMS } from '@/lib/cms'
import SystemSettingsForm from './(components)/SystemSettingsForm'

export const dynamic = 'force-dynamic'

export default async function SystemSettingsPage() {
  const cms = await getCMS()
  const config = cms.getConfig()

  return (
    <SystemSettingsForm initialConfig={config} />
  )
}
