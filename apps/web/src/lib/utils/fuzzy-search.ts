/**
 * Fuzzy search utilities using Levenshtein distance and similarity matching
 */

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score between 0 and 1
 */
function similarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLen;
}

/**
 * Check if query matches text (fuzzy match)
 */
export function fuzzyMatch(query: string, text: string, threshold: number = 0.6): boolean {
  if (!query || !text) return false;
  
  const queryLower = query.toLowerCase().trim();
  const textLower = text.toLowerCase().trim();
  
  // Exact match
  if (textLower.includes(queryLower)) return true;
  
  // Word-by-word matching
  const queryWords = queryLower.split(/\s+/);
  const textWords = textLower.split(/\s+/);
  
  // Check if all query words have a match
  const allWordsMatch = queryWords.every(qWord => 
    textWords.some(tWord => {
      const sim = similarity(qWord, tWord);
      return sim >= threshold || tWord.includes(qWord) || qWord.includes(tWord);
    })
  );
  
  if (allWordsMatch) return true;
  
  // Overall similarity check
  const overallSimilarity = similarity(queryLower, textLower);
  return overallSimilarity >= threshold;
}

/**
 * Score a match for ranking
 */
export function scoreMatch(query: string, text: string): number {
  if (!query || !text) return 0;
  
  const queryLower = query.toLowerCase().trim();
  const textLower = text.toLowerCase().trim();
  
  // Exact match gets highest score
  if (textLower === queryLower) return 1.0;
  if (textLower.startsWith(queryLower)) return 0.9;
  if (textLower.includes(queryLower)) return 0.8;
  
  // Word matches
  const queryWords = queryLower.split(/\s+/);
  const textWords = textLower.split(/\s+/);
  
  let wordScore = 0;
  queryWords.forEach(qWord => {
    const bestMatch = Math.max(
      ...textWords.map(tWord => similarity(qWord, tWord))
    );
    wordScore += bestMatch;
  });
  wordScore /= queryWords.length;
  
  // Overall similarity
  const overallSimilarity = similarity(queryLower, textLower);
  
  // Weighted combination
  return (wordScore * 0.6 + overallSimilarity * 0.4);
}

/**
 * Search and rank results
 */
export function fuzzySearch<T>(
  items: T[],
  query: string,
  getSearchableText: (item: T) => string | string[],
  threshold: number = 0.5
): T[] {
  if (!query || !query.trim()) return items;
  
  const queryLower = query.toLowerCase().trim();
  
  // Score each item
  const scored = items.map(item => {
    const searchable = getSearchableText(item);
    const texts = Array.isArray(searchable) ? searchable : [searchable];
    
    const maxScore = Math.max(
      ...texts.map(text => scoreMatch(queryLower, text || ''))
    );
    
    return { item, score: maxScore };
  });
  
  // Filter by threshold and sort by score
  return scored
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
