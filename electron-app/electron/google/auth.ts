import { google } from 'googleapis'
import * as fs from 'fs'
import * as http from 'http'
import { parse as parseUrl } from 'url'
import { app, shell } from 'electron'
import { join } from 'path'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'email',
]

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

const clientCache = new Map<string, OAuth2Client>()

function tokenPath(workspace: string): string {
  return join(app.getPath('userData'), `gtoken_${workspace}.json`)
}

function loadCredentials(credentialsPath: string) {
  const raw = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'))
  const creds = raw.installed ?? raw.web
  if (!creds) throw new Error('Invalid credentials.json — expected "installed" or "web" key')
  return creds as { client_id: string; client_secret: string }
}

async function buildClient(credentialsPath: string, workspace: string): Promise<OAuth2Client> {
  const { client_id, client_secret } = loadCredentials(credentialsPath)
  const tp = tokenPath(workspace)

  const tryToken = async (): Promise<OAuth2Client | null> => {
    if (!fs.existsSync(tp)) return null
    try {
      const token = JSON.parse(fs.readFileSync(tp, 'utf-8'))
      const auth = new google.auth.OAuth2(client_id, client_secret)
      auth.setCredentials(token)
      if (token.expiry_date && token.expiry_date < Date.now() - 60_000) {
        if (!token.refresh_token) return null
        const { credentials } = await auth.refreshAccessToken()
        auth.setCredentials(credentials)
        fs.writeFileSync(tp, JSON.stringify(credentials))
      }
      return auth
    } catch {
      return null
    }
  }

  const existing = await tryToken()
  if (existing) return existing

  // OAuth browser flow
  return new Promise<OAuth2Client>((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address() as { port: number }
      const redirectUri = `http://127.0.0.1:${port}/callback`
      const auth = new google.auth.OAuth2(client_id, client_secret, redirectUri)

      const authUrl = auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
      })

      shell.openExternal(authUrl)

      const timer = setTimeout(() => {
        server.close()
        reject(new Error('Authentication timed out after 2 minutes'))
      }, 120_000)

      server.on('request', async (req, res) => {
        const { pathname, query } = parseUrl(req.url ?? '', true)
        if (pathname !== '/callback') return
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h2 style="font-family:sans-serif;padding:2rem">Authentication successful — you can close this tab.</h2>')
        server.close()
        clearTimeout(timer)
        try {
          const { tokens } = await auth.getToken(query.code as string)
          auth.setCredentials(tokens)
          fs.writeFileSync(tp, JSON.stringify(tokens))
          resolve(auth)
        } catch (err) {
          reject(err)
        }
      })
    })
  })
}

export async function getAuthClient(credentialsPath: string, workspace: string): Promise<OAuth2Client> {
  const client = await buildClient(credentialsPath, workspace)
  clientCache.set(workspace, client)
  return client
}

export function getCachedClient(workspace: string): OAuth2Client | null {
  return clientCache.get(workspace) ?? null
}

export function isAuthenticated(workspace: string): boolean {
  return fs.existsSync(tokenPath(workspace))
}

export async function getUserEmail(auth: OAuth2Client): Promise<string | null> {
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth })
    const res = await oauth2.userinfo.get()
    return res.data.email ?? null
  } catch {
    return null
  }
}

export function moveToken(fromWorkspace: string, toWorkspace: string): void {
  const from = tokenPath(fromWorkspace)
  const to = tokenPath(toWorkspace)
  if (!fs.existsSync(from)) return
  if (fs.existsSync(to)) fs.unlinkSync(to)
  fs.renameSync(from, to)
  const client = clientCache.get(fromWorkspace)
  if (client) {
    clientCache.delete(fromWorkspace)
    clientCache.set(toWorkspace, client)
  }
}

export function revokeAuth(workspace: string): void {
  const tp = tokenPath(workspace)
  if (fs.existsSync(tp)) fs.unlinkSync(tp)
  clientCache.delete(workspace)
}
