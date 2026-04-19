import type { Express, Request, Response } from 'express'
import { LawApiClient } from '../lib/api-client.js'
import { searchLaw } from '../tools/search.js'
import { getLawText } from '../tools/law-text.js'
import { searchPrecedents } from '../tools/precedents.js'
import { searchInterpretations } from '../tools/interpretations.js'
import { verifyCitations } from '../tools/verify-citations.js'

export function registerRestWrapper(app: Express) {
  app.post('/api/legal-search-plan', async (req: Request, res: Response) => {
    try {
      const apiKey = extractApiKey(req)
      const client = new LawApiClient({ apiKey })
      const { domain, issues = [], queries = [] } = req.body || {}
      const primaryQuery = pickPrimaryQuery(domain, queries, issues)

      const lawSearch = await searchLaw(client, {
        query: primaryQuery,
        display: 5,
        apiKey,
      })

      const precedentSearch = await searchPrecedents(client, {
        query: queries.join(' ') || primaryQuery,
        display: 3,
        page: 1,
        apiKey,
      })

      const interpretationSearch = await searchInterpretations(client, {
        query: queries.join(' ') || primaryQuery,
        display: 3,
        page: 1,
        apiKey,
      })

      const sources = [
        makeSource(`${domain || 'general'} 법령 검색`, 'law-search', lawSearch.content?.[0]?.text),
        makeSource('관련 판례 검색', 'precedent-search', precedentSearch.content?.[0]?.text),
        makeSource('관련 해석례 검색', 'interpretation-search', interpretationSearch.content?.[0]?.text),
      ].filter(Boolean)

      return res.json({
        domain,
        query: primaryQuery,
        sources,
      })
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'search wrapper failed' })
    }
  })

  app.post('/api/verify-citations', async (req: Request, res: Response) => {
    try {
      const apiKey = extractApiKey(req)
      const client = new LawApiClient({ apiKey })
      const { citations = [] } = req.body || {}
      const text = Array.isArray(citations) ? citations.join(', ') : String(citations || '')

      const verification = await verifyCitations(client, {
        text,
        maxCitations: 15,
        apiKey,
      })

      const lines = (verification.content?.[0]?.text || '').split('\n').map((line) => line.trim()).filter(Boolean)
      const verified = lines.filter((line) => line.startsWith('✓')).map(stripPrefix)
      const failed = lines.filter((line) => line.startsWith('✗')).map(stripPrefix)
      const warnings = lines.filter((line) => line.startsWith('⚠')).map(stripPrefix)

      return res.json({
        verified,
        failed,
        warnings,
        raw: verification.content?.[0]?.text || '',
      })
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'verify wrapper failed' })
    }
  })

  app.post('/api/article-text', async (req: Request, res: Response) => {
    try {
      const apiKey = extractApiKey(req)
      const client = new LawApiClient({ apiKey })
      const { mst, lawId, jo } = req.body || {}

      const result = await getLawText(client, { mst, lawId, jo, apiKey })
      return res.json({ text: result.content?.[0]?.text || '' })
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'article wrapper failed' })
    }
  })
}

function extractApiKey(req: Request) {
  return (
    process.env.LAW_OC ||
    process.env.KOREAN_LAW_API_KEY ||
    (req.headers['x-law-oc'] as string | undefined) ||
    ''
  )
}

function pickPrimaryQuery(domain: string, queries: string[], issues: string[]) {
  return queries[0] || issues[0] || domain || '법률'
}

function makeSource(title: string, type: string, text?: string) {
  if (!text) return null
  return {
    title,
    type,
    excerpt: text.slice(0, 1200),
  }
}

function stripPrefix(line: string) {
  return line.slice(1).trim()
}
