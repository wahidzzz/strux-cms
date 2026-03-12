import { promises as fs } from 'fs'
import { join } from 'path'

export interface CMSSettings {
  brandName: string
  logoUrl: string
  theme: 'light' | 'dark' | 'system'
}

const DEFAULT_SETTINGS: CMSSettings = {
  brandName: 'Jayson CMS',
  logoUrl: '',
  theme: 'system'
}

export class SettingsEngine {
  private configPath: string

  constructor(basePath: string) {
    this.configPath = join(basePath, '.cms', 'config', 'settings.json')
  }

  async init(): Promise<void> {
    // Ensure the settings directory exists
    const configDir = join(this.configPath, '..')
    await fs.mkdir(configDir, { recursive: true })

    try {
      await fs.access(this.configPath)
    } catch {
      await fs.writeFile(this.configPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
    }
  }

  async getSettings(): Promise<CMSSettings> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      const settings = JSON.parse(content) as Partial<CMSSettings>
      // Merge with defaults in case of missing keys
      return { ...DEFAULT_SETTINGS, ...settings }
    } catch (err) {
      console.error('Failed to read settings, returning defaults:', err)
      return { ...DEFAULT_SETTINGS }
    }
  }

  async updateSettings(updates: Partial<CMSSettings>): Promise<CMSSettings> {
    const current = await this.getSettings()
    const newSettings = { ...current, ...updates }
    await fs.writeFile(this.configPath, JSON.stringify(newSettings, null, 2), 'utf-8')
    return newSettings
  }
}
