import { CMS } from '@cms/core'
import path from 'path'

// Point to the root directory of the monorepo where the content, schema, uploads are stored.
const rootPath = path.resolve(process.cwd(), '../..')

const globalForCms = global as unknown as { cms: CMS }

export const cms = globalForCms.cms || new CMS(rootPath)

if (process.env.NODE_ENV !== 'production') globalForCms.cms = cms

export async function getCMS() {
  if (!cms.isInitialized()) {
    await cms.initialize()
  }
  return cms
}
