import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash } from 'crypto'
import { createS3Client, getBucketConfig } from './aws-config'

function shouldServeInline(contentType: string): boolean {
  // image/svg+xml excluded — SVGs can execute embedded scripts (XSS risk)
  return (contentType.startsWith('image/') && contentType !== 'image/svg+xml')
    || contentType.startsWith('video/')
    || contentType.startsWith('audio/')
}

const s3 = createS3Client()

function safeName(fileName: string): string {
  return (fileName ?? 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}

export async function generatePresignedUploadUrl(fileName: string, contentType: string, isPublic = false) {
  const { bucketName, folderPrefix } = getBucketConfig()
  const cloud_storage_path = isPublic
    ? `${folderPrefix}public/uploads/${Date.now()}-${safeName(fileName)}`
    : `${folderPrefix}uploads/${Date.now()}-${safeName(fileName)}`
  const command = new PutObjectCommand({ Bucket: bucketName, Key: cloud_storage_path, ContentType: contentType })
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })
  return { uploadUrl, cloud_storage_path }
}

export async function initiateMultipartUpload(fileName: string, contentType: string, isPublic = false) {
  const { bucketName, folderPrefix } = getBucketConfig()
  const cloud_storage_path = isPublic
    ? `${folderPrefix}public/uploads/${Date.now()}-${safeName(fileName)}`
    : `${folderPrefix}uploads/${Date.now()}-${safeName(fileName)}`
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucketName, Key: cloud_storage_path, ContentType: contentType }))
  return { uploadId: res.UploadId ?? '', cloud_storage_path }
}

export async function getPresignedUrlForPart(cloud_storage_path: string, uploadId: string, partNumber: number) {
  const { bucketName } = getBucketConfig()
  return getSignedUrl(
    s3,
    new UploadPartCommand({ Bucket: bucketName, Key: cloud_storage_path, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: 3600 }
  )
}

export async function completeMultipartUpload(
  cloud_storage_path: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
) {
  const { bucketName } = getBucketConfig()
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts ?? [] },
    })
  )
}

export async function getFileUrl(cloud_storage_path: string, contentType: string, isPublic = false) {
  const { bucketName } = getBucketConfig()
  if (isPublic) {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    return `https://${bucketName}.s3.${region}.amazonaws.com/${cloud_storage_path.split('/').map(encodeURIComponent).join('/')}`
  }
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      ResponseContentDisposition: shouldServeInline(contentType ?? '') ? 'inline' : 'attachment',
    }),
    { expiresIn: 3600 }
  )
}

/** Documentos de verificação: pasta própria por coletor, sempre privados. */
export function verificationPrefix(collectorId: string): string {
  const { folderPrefix } = getBucketConfig()
  return `${folderPrefix}verification/${collectorId}/`
}

export async function generateVerificationUploadUrl(collectorId: string, fileName: string, contentType: string) {
  const { bucketName } = getBucketConfig()
  const cloud_storage_path = `${verificationPrefix(collectorId)}${Date.now()}-${safeName(fileName)}`
  const command = new PutObjectCommand({ Bucket: bucketName, Key: cloud_storage_path, ContentType: contentType })
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 })
  return { uploadUrl, cloud_storage_path }
}

/** URL assinada de curta duração (5 min) para a análise de documentos. */
export async function getShortLivedFileUrl(cloud_storage_path: string, contentType: string) {
  const { bucketName } = getBucketConfig()
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      ResponseContentDisposition: shouldServeInline(contentType ?? '') || contentType === 'application/pdf' ? 'inline' : 'attachment',
    }),
    { expiresIn: 300 }
  )
}

export async function deleteFile(cloud_storage_path: string) {
  const { bucketName } = getBucketConfig()
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: cloud_storage_path }))
}

/** Baixa o objeto e calcula o SHA-256 no servidor (preservação criptográfica). */
export async function computeObjectSha256(cloud_storage_path: string): Promise<{ sha256: string; size: number } | null> {
  try {
    const { bucketName } = getBucketConfig()
    const res = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: cloud_storage_path }))
    const bytes = await res.Body?.transformToByteArray?.()
    if (!bytes) return null
    return { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }
  } catch (e) {
    console.error('Falha ao calcular SHA-256 do objeto', e)
    return null
  }
}
