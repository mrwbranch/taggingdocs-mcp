import fs from "fs";
import path from "path";
import MiniSearch from "minisearch";
import matter from "gray-matter";
import { log } from "./logger.js";

// ─── Config ───────────────────────────────────────────────────────────
export const TAGGINGDOCS_BASE = "https://taggingdocs.com";
const CONTENT_DIR = "src/content/docs";

// Resolve content repo path — check common locations
function findContentRepo(): string {
  const candidates = [
    path.join(process.cwd(), "content-repo"),
    path.join(process.cwd(), "..", "content-repo"),
    "/app/content-repo",
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, CONTENT_DIR))) return dir;
  }
  throw new Error(
    `TaggingDocs content repo not found. Expected ${CONTENT_DIR} in one of: ${candidates.join(", ")}. ` +
      `Run: git clone --depth 1 https://github.com/mrwbranch/taggingdocs.git content-repo`
  );
}

// ─── Types ────────────────────────────────────────────────────────────
export interface DocArticle {
  id: string;
  slug: string;
  section: string;
  url: string;
  title: string;
  description: string;
  content: string;
}

export interface DocSection {
  title: string;
  slug: string;
  description: string;
  url: string;
}

// ─── MDX parsing helpers ──────────────────────────────────────────────
function stripMdx(content: string): string {
  return content
    .replace(/^import\s+.*$/gm, "")
    .replace(/<\w+[^>]*\/>/g, "")
    .replace(/<(\w+)[^>]*>/g, "")
    .replace(/<\/\w+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findFiles(dir: string, extensions = [".mdx", ".md"]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseArticle(filePath: string, docsRoot: string): DocArticle {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data: frontmatter, content } = matter(raw);
  const relative = path.relative(docsRoot, filePath);
  const slug = relative.replace(/\.(mdx|md)$/, "").replace(/\/index$/, "");
  const section = slug.split("/")[0] || "root";

  return {
    id: slug,
    slug,
    section,
    url: `${TAGGINGDOCS_BASE}/${slug}/`,
    title: (frontmatter.title as string) || slug.split("/").pop()!,
    description: (frontmatter.description as string) || "",
    content: stripMdx(content),
  };
}

// ─── Build index on module load ───────────────────────────────────────
let articles: DocArticle[] = [];
let sections: Record<string, DocSection[]> = {};
let searchIndex: MiniSearch;

function buildIndex() {
  const repoPath = findContentRepo();
  const docsRoot = path.join(repoPath, CONTENT_DIR);
  const files = findFiles(docsRoot);

  articles = files.map((f) => parseArticle(f, docsRoot));

  searchIndex = new MiniSearch({
    fields: ["title", "description", "content", "section"],
    storeFields: ["title", "description", "section", "url", "slug"],
    searchOptions: {
      boost: { title: 3, description: 2, section: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  searchIndex.addAll(articles);

  // Build section map
  sections = {};
  for (const article of articles) {
    if (!sections[article.section]) sections[article.section] = [];
    sections[article.section].push({
      title: article.title,
      slug: article.slug,
      description: article.description,
      url: article.url,
    });
  }

  log.info(
    { articles: articles.length, sections: Object.keys(sections).length },
    "taggingdocs: index built"
  );
}

// Initialize on import
buildIndex();

// ─── Public API ───────────────────────────────────────────────────────

/** Full-text search across all articles. */
export function searchDocs(
  query: string,
  options?: { section?: string; maxResults?: number }
): Array<{ title: string; description: string; section: string; url: string; slug: string; score: number }> {
  const results = searchIndex.search(query, {
    ...(options?.section
      ? { filter: (r: any) => r.section === options.section }
      : {}),
  });

  return results.slice(0, options?.maxResults || 8).map((r: any) => ({
    title: r.title,
    description: r.description,
    section: r.section,
    url: r.url,
    slug: r.slug,
    score: r.score,
  }));
}

/** Get full article content by slug. */
export function getArticle(
  slug: string,
  maxLength = 12000
): DocArticle | null {
  const article = articles.find((a) => a.slug === slug);
  if (!article) return null;

  if (article.content.length > maxLength) {
    return { ...article, content: article.content.slice(0, maxLength) + "\n\n[truncated]" };
  }
  return article;
}

/** Find articles with fuzzy slug matching (for suggestions). */
export function findSimilarSlugs(slug: string, max = 5): DocArticle[] {
  return articles
    .filter((a) => a.slug.includes(slug) || slug.includes(a.slug))
    .slice(0, max);
}

/** List all sections or articles in a specific section. */
export function getSections(section?: string): Record<string, DocSection[]> | DocSection[] {
  if (section) {
    return sections[section] || [];
  }
  return sections;
}

/** Get section names with article counts. */
export function getSectionOverview(): Array<{ name: string; count: number }> {
  return Object.entries(sections)
    .map(([name, arts]) => ({ name, count: arts.length }))
    .sort((a, b) => b.count - a.count);
}

/** Quick GA4 event lookup — finds best match + related articles. */
export function lookupEvent(eventName: string): {
  bestMatch: DocArticle | null;
  related: Array<{ title: string; section: string; url: string }>;
} {
  const results = searchIndex.search(eventName, {
    boost: { title: 5, description: 3, content: 1 },
  });

  const relevant = results.slice(0, 6);
  const bestMatch = relevant.length > 0
    ? articles.find((a) => a.slug === (relevant[0] as any).slug) || null
    : null;

  return {
    bestMatch: bestMatch
      ? { ...bestMatch, content: bestMatch.content.slice(0, 4000) }
      : null,
    related: relevant.slice(1).map((r: any) => ({
      title: r.title,
      section: r.section,
      url: r.url,
    })),
  };
}

/** Total article count. */
export function getArticleCount(): number {
  return articles.length;
}

/** Re-index (e.g. after git pull). */
export function reindex(): void {
  buildIndex();
}

export { articles, sections };
