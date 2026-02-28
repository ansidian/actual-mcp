/**
 * Markdown chunker that splits guide content into semantic sections.
 *
 * Splits at `## ` heading boundaries, preserving the guide title
 * as context in each chunk.
 */

import type { KnowledgeChunk, GuideResource } from './types.js';

/**
 * Extract the slug from a guide URI (e.g., "actual://guides/month-ahead" -> "month-ahead").
 *
 * @param uri - The guide URI
 * @returns The slug portion of the URI
 */
function extractSlug(uri: string): string {
  return uri.replace('actual://guides/', '');
}

/**
 * Extract the top-level title from markdown content.
 *
 * @param content - Raw markdown string
 * @returns The title text (without the `# ` prefix), or empty string if none found
 */
function extractTitle(content: string): string {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * Split markdown content into sections at `## ` heading boundaries.
 *
 * Each section includes the heading line and all content until the next `## ` heading.
 * Content before the first `## ` heading is included as a preamble section
 * (only if it contains non-whitespace content beyond the title).
 *
 * @param content - Raw markdown string
 * @returns Array of { heading, body } objects
 */
function splitIntoSections(content: string): Array<{ heading: string; body: string }> {
  const lines = content.split('\n');
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // Flush previous section
      const body = currentLines.join('\n').trim();
      if (body && !isOnlyTitle(body)) {
        sections.push({ heading: currentHeading, body });
      }
      currentHeading = line.replace('## ', '').trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last section
  const body = currentLines.join('\n').trim();
  if (body) {
    sections.push({ heading: currentHeading, body });
  }

  return sections;
}

/**
 * Check if a body is only the top-level title (e.g., "# Guide Title").
 */
function isOnlyTitle(body: string): boolean {
  const trimmed = body.trim();
  return /^# .+$/.test(trimmed) && !trimmed.includes('\n');
}

/**
 * Chunk all guides into searchable knowledge chunks.
 *
 * @param guideContent - Map of guide URI to markdown content
 * @param guideResources - Array of guide resource metadata
 * @returns Array of knowledge chunks ready for indexing
 */
export function chunkGuides(guideContent: Record<string, string>, guideResources: GuideResource[]): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  for (const resource of guideResources) {
    const content = guideContent[resource.uri];
    if (!content) continue;

    const title = extractTitle(content);
    const slug = extractSlug(resource.uri);
    const sections = splitIntoSections(content);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      // Prepend the guide title for context
      const contextPrefix = title ? `${title}\n\n` : '';
      const sectionHeader = section.heading ? `## ${section.heading}\n\n` : '';

      chunks.push({
        id: `${slug}-${i}`,
        text: `${contextPrefix}${sectionHeader}${section.body}`,
        source: 'guide',
        guideUri: resource.uri,
        guideName: resource.name,
        sectionHeading: section.heading || 'Introduction',
        chunkIndex: i,
      });
    }
  }

  return chunks;
}
