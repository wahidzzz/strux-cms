import { Router, Request, Response, NextFunction } from 'express'
import { CMS } from '@cms/core'
import { authenticate } from '../middleware/auth.js'

export function createSettingsRouter(cms: CMS, jwtSecret: string): Router {
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
        res.status(authResult.error!.status).json({
          message: authResult.error!.message
        })
        return
      }

      const role = authResult.context?.role
      if (role !== 'super_admin' && role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' })
        return
      }

      const settings = await cms.getSettingsEngine().updateSettings(req.body)
      res.json(settings)
    } catch (error) {
      next(error)
    }
  })

  return router
}
