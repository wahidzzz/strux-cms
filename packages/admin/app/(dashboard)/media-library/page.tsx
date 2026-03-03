import { getCMS } from '@/lib/cms'
import MediaGrid from './(components)/MediaGrid'

export const dynamic = 'force-dynamic'

export default async function MediaLibraryPage() {
  const cms = await getCMS()
  
  // Safe load of media files
  let result;
  try {
    result = await cms.getMediaEngine().findMany({})
  } catch (err) {
    result = { data: [], meta: { pagination: { total: 0 } } }
  }

  const mediaFiles = result.data || []
  
  return (
    <MediaGrid initialMediaFiles={mediaFiles} />
  )
}
