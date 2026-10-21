import { mkdirSync, chmodSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Config, ReviewResult } from './core.ts'

export const HISTORY_PATH = path.join(os.homedir(), '.pi', 'agent', 'grammar.sqlite')
type SavedResult = Exclude<ReviewResult, { mode: 'skip' }>

export interface GrammarRecord {
  id: number
  createdAt: string
  input: string
  learning: string
  native: string
  result: SavedResult
}

function withDatabase<T>(file: string, operation: (db: DatabaseSync) => T): T {
  mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  try {
    chmodSync(file, 0o600)
    db.exec('PRAGMA busy_timeout = 3000')
    db.exec(`CREATE TABLE IF NOT EXISTS grammar_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      input TEXT NOT NULL,
      learning TEXT NOT NULL,
      native TEXT NOT NULL,
      result TEXT NOT NULL
    )`)
    return operation(db)
  } finally {
    db.close()
  }
}

export function saveGrammarRecord(
  input: string,
  cfg: Pick<Config, 'learning' | 'native'>,
  result: ReviewResult,
  file = HISTORY_PATH
): void {
  if (result.mode === 'skip') return
  if (result.mode === 'check' && result.items.length === 0 && !result.rephrase) return
  if (result.mode === 'tutor' && result.tutor.grammar.length === 0) return
  withDatabase(file, (db) => {
    db.prepare(`INSERT INTO grammar_records (created_at, input, learning, native, result)
      VALUES (?, ?, ?, ?, ?)`).run(
      new Date().toISOString(),
      input,
      cfg.learning,
      cfg.native,
      JSON.stringify(result)
    )
  })
}

export function loadGrammarRecords(file = HISTORY_PATH): GrammarRecord[] {
  return withDatabase(file, (db) =>
    db
      .prepare('SELECT * FROM grammar_records ORDER BY id DESC')
      .all()
      .map((row) => ({
        id: Number(row.id),
        createdAt: String(row.created_at),
        input: String(row.input),
        learning: String(row.learning),
        native: String(row.native),
        result: JSON.parse(String(row.result)) as SavedResult
      }))
  )
}
