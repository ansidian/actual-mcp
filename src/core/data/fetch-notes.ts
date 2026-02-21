import { getNotes } from '../../actual-api.js';
import type { Note } from '../types/domain.js';

export async function fetchAllNotes(): Promise<Note[]> {
  return getNotes() as Promise<Note[]>;
}

export async function fetchNoteById(id: string): Promise<Note | null> {
  const notes = (await getNotes(id)) as Note[];
  return notes.length > 0 ? notes[0] : null;
}
