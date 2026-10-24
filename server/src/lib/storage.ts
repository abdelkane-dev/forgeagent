import fs from 'node:fs/promises'
import path from 'node:path'
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config'

/**
 * Object storage, partitioned by agent. Every key lives under agents/<agentId>/ and
 * AgentStorage refuses anything else (no "..", no absolute keys, no other prefix).
 * Drivers: s3 (MinIO in docker compose, any S3-compatible service) or fs (tests, local runs).
 */

interface Driver {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  list(prefix: string): Promise<string[]>
  removePrefix(prefix: string): Promise<number>
  signedUrl(key: string, seconds: number): Promise<string | null>
}

function fsDriver(root: string): Driver {
  const abs = (key: string) => path.join(path.resolve(root), ...key.split('/'))
  return {
    async put(key, body) {
      await fs.mkdir(path.dirname(abs(key)), { recursive: true })
      await fs.writeFile(abs(key), body)
    },
    get: (key) => fs.readFile(abs(key)),
    async list(prefix) {
      const dir = abs(prefix)
      const out: string[] = []
      const walk = async (d: string, rel: string) => {
        for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
          if (e.isDirectory()) await walk(path.join(d, e.name), `${rel}${e.name}/`)
          else out.push(`${prefix}${rel}${e.name}`)
        }
      }
      await walk(dir, '')
      return out
    },
    async removePrefix(prefix) {
      const n = (await this.list(prefix)).length
      await fs.rm(abs(prefix), { recursive: true, force: true })
      return n
    },
    signedUrl: async () => null,
  }
}

function s3Driver(): Driver {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: config.S3_ACCESS_KEY && config.S3_SECRET_KEY ? { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY } : undefined,
  })
  const Bucket = config.S3_BUCKET
  let ready: Promise<void> | null = null
  const ensure = () =>
    (ready ??= client
      .send(new HeadBucketCommand({ Bucket }))
      .then(() => undefined)
      .catch(() => client.send(new CreateBucketCommand({ Bucket })).then(() => undefined)))
  return {
    async put(Key, Body, ContentType) {
      await ensure()
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }))
    },
    async get(Key) {
      await ensure()
      const r = await client.send(new GetObjectCommand({ Bucket, Key }))
      return Buffer.from(await r.Body!.transformToByteArray())
    },
    async list(Prefix) {
      await ensure()
      const out: string[] = []
      let ContinuationToken: string | undefined
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }))
        out.push(...(r.Contents ?? []).map((o) => o.Key!))
        ContinuationToken = r.NextContinuationToken
      } while (ContinuationToken)
      return out
    },
    async removePrefix(prefix) {
      const keys = await this.list(prefix)
      for (let i = 0; i < keys.length; i += 1000)
        await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }))
      return keys.length
    },
    async signedUrl(Key, seconds) {
      await ensure()
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: seconds })
    },
  }
}

const driver: Driver = config.STORAGE_DRIVER === 's3' ? s3Driver() : fsDriver(config.STORAGE_DIR)

/** Storage handle bound to ONE agent: the only way the rest of the code reaches object storage. */
export class AgentStorage {
  readonly prefix: string
  constructor(readonly agentId: string) {
    if (!/^agt_[a-z0-9]+$/.test(agentId)) throw new Error('invalid agent id')
    this.prefix = `agents/${agentId}/`
  }
  private key(name: string) {
    if (!/^[\w.\-/]+$/.test(name) || name.includes('..') || name.startsWith('/')) throw new Error('invalid object name')
    return `${this.prefix}${name}`
  }
  put = (name: string, body: Buffer, contentType = 'application/octet-stream') => driver.put(this.key(name), body, contentType)
  get = (name: string) => driver.get(this.key(name))
  list = async () => (await driver.list(this.prefix)).map((k) => k.slice(this.prefix.length))
  signedUrl = (name: string, seconds = 300) => driver.signedUrl(this.key(name), seconds)
  /** Purge: every object of this agent. */
  removeAll = () => driver.removePrefix(this.prefix)
}

export const storageKind = config.STORAGE_DRIVER
