import { Router, Request, Response, NextFunction } from 'express'
import { CMS, RequestContext } from '@cms/core'
import { authenticate } from '../middleware/auth.js'

export function createSettingsRouter(cms: CMS, jwtSecret: string) {
  const router = Router()

  // GET global settings (publicly accessible for login pages)
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await cms.getSettingsEngine().getSettings()
      res.json(settings)
    } catch (error) {
      next(error)
    }
  })

  // PUT global settings (requires auth, super_admin or admin)
  router.put('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Authenticate
      const authResult = authenticate(
        { headers: { authorization: req.headers.authorization } },
        jwtSecret
      )

      if (!authResult.success) {
        return res.status(authResult.error!.status).json({
          message: authResult.error!.message
        })
      }

      const role = authResult.context?.role
      if (role !== 'super_admin' && role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden' })
      }

      const settings = await cms.getSettingsEngine().updateSettings(req.body)
      
      // Auto-commit settings change if needed (currently we just save it)
      // Optional: trigger git commit. For now, it's just in a json file.

      res.json(settings)
    } catch (error) {
      next(error)
    }
  })

  return router
}
