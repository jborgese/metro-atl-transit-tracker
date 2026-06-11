import { getDb } from '../content/repository';
import { nowIso, type StoreEvent } from '../content/mappers';
import type { FeedbackCreate } from './validators';

export type FeedbackRow = FeedbackCreate & {
  id: string;
  client_key: string;
  created_at: string;
};

const INSERT_FEEDBACK_SQL = `
INSERT INTO feedback (
  id,
  message,
  name,
  email,
  category,
  page_url,
  client_key,
  email_sent,
  created_at
)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)
`;

export async function insertFeedback(
  event: StoreEvent,
  input: FeedbackCreate & { client_key: string }
): Promise<FeedbackRow> {
  const db = getDb(event);
  const row: FeedbackRow = {
    ...input,
    id: crypto.randomUUID(),
    created_at: nowIso(),
  };

  await db
    .prepare(INSERT_FEEDBACK_SQL)
    .bind(
      row.id,
      row.message,
      row.name ?? null,
      row.email ?? null,
      row.category,
      row.page_url ?? null,
      row.client_key,
      row.created_at
    )
    .run();

  return row;
}

export async function markEmailSent(event: StoreEvent, id: string) {
  const db = getDb(event);
  await db.prepare('UPDATE feedback SET email_sent = 1 WHERE id = ?1').bind(id).run();
}
