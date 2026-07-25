import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

let cachedFolderId: string | null = null

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain', '.csv': 'text/csv', '.md': 'text/markdown',
    '.zip': 'application/zip', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
  }
  return map[ext] ?? 'application/octet-stream'
}

async function ensureAppFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
  if (cachedFolderId) return cachedFolderId

  const res = await drive.files.list({
    q: "name='Task Organizer' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
    spaces: 'drive',
  })

  if (res.data.files && res.data.files.length > 0) {
    cachedFolderId = res.data.files[0].id!
    return cachedFolderId
  }

  const created = await drive.files.create({
    requestBody: { name: 'Task Organizer', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  })
  cachedFolderId = created.data.id!
  return cachedFolderId
}

export async function uploadToDrive(
  auth: OAuth2Client,
  localPath: string,
  fileName: string,
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth })
  const folderId = await ensureAppFolder(drive)

  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: getMimeType(fileName), body: fs.createReadStream(localPath) },
    fields: 'id',
  })

  if (!response.data.id) throw new Error('Drive upload returned no file ID')
  return response.data.id
}

export async function downloadFromDrive(
  auth: OAuth2Client,
  driveFileId: string,
  destPath: string,
): Promise<void> {
  const drive = google.drive({ version: 'v3', auth })

  const response = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'stream' },
  )

  await new Promise<void>((resolve, reject) => {
    (response.data as NodeJS.ReadableStream)
      .pipe(fs.createWriteStream(destPath))
      .on('finish', resolve)
      .on('error', reject)
  })
}

export async function deleteFromDrive(
  auth: OAuth2Client,
  driveFileId: string,
): Promise<void> {
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({ fileId: driveFileId })
}
