import { describe, it, expect } from 'vitest';
import { chunkGuides } from './chunker.js';
import type { GuideResource } from './types.js';

const makeResource = (uri: string, name: string): GuideResource => ({
  uri,
  name,
  description: 'Test guide',
  mimeType: 'text/markdown',
});

describe('chunkGuides', () => {
  it('should split a guide into sections at ## boundaries', () => {
    const content = {
      'actual://guides/test': `# Test Guide

## Section One

Content for section one.

## Section Two

Content for section two.
More content here.`,
    };
    const resources = [makeResource('actual://guides/test', 'Test Guide')];

    const chunks = chunkGuides(content, resources);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].id).toBe('test-0');
    expect(chunks[0].sectionHeading).toBe('Section One');
    expect(chunks[0].text).toContain('Test Guide');
    expect(chunks[0].text).toContain('Content for section one.');
    expect(chunks[0].source).toBe('guide');
    expect(chunks[0].guideUri).toBe('actual://guides/test');
    expect(chunks[0].guideName).toBe('Test Guide');
    expect(chunks[0].chunkIndex).toBe(0);

    expect(chunks[1].id).toBe('test-1');
    expect(chunks[1].sectionHeading).toBe('Section Two');
    expect(chunks[1].text).toContain('Content for section two.');
  });

  it('should handle a guide with no ## headings', () => {
    const content = {
      'actual://guides/simple': `# Simple Guide

Just some plain content without any section headings.
Another line of content.`,
    };
    const resources = [makeResource('actual://guides/simple', 'Simple Guide')];

    const chunks = chunkGuides(content, resources);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].sectionHeading).toBe('Introduction');
    expect(chunks[0].text).toContain('Just some plain content');
  });

  it('should skip guides with no matching content', () => {
    const content: Record<string, string> = {};
    const resources = [makeResource('actual://guides/missing', 'Missing Guide')];

    const chunks = chunkGuides(content, resources);

    expect(chunks).toHaveLength(0);
  });

  it('should chunk multiple guides independently', () => {
    const content = {
      'actual://guides/first': `# First Guide

## Alpha

Alpha content.`,
      'actual://guides/second': `# Second Guide

## Beta

Beta content.

## Gamma

Gamma content.`,
    };
    const resources = [
      makeResource('actual://guides/first', 'First Guide'),
      makeResource('actual://guides/second', 'Second Guide'),
    ];

    const chunks = chunkGuides(content, resources);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].guideName).toBe('First Guide');
    expect(chunks[1].guideName).toBe('Second Guide');
    expect(chunks[2].guideName).toBe('Second Guide');
    expect(chunks[1].id).toBe('second-0');
    expect(chunks[2].id).toBe('second-1');
  });

  it('should handle empty content string', () => {
    const content = { 'actual://guides/empty': '' };
    const resources = [makeResource('actual://guides/empty', 'Empty Guide')];

    const chunks = chunkGuides(content, resources);

    expect(chunks).toHaveLength(0);
  });
});
