'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { MoveUp } from 'lucide-react';
import { fetcher } from '@/lib/http/fetcher';
import LoadingTimeout from '@/components/ui/loading-timeout';

interface PageContent {
  id: string;
  page_slug: string;
  section_key: string;
  content_type: 'text' | 'html' | 'json' | 'image' | 'video';
  content: string;
  metadata?: Record<string, unknown>;
  order: number;
}

interface TermSection {
  title: string;
  content: string;
}

const DEFAULT_SECTIONS: TermSection[] = [
  { title: 'Terms of Service', content: 'These terms are managed in Admin → Content (Footer Pages → terms-and-condition). Add or edit sections there.' },
];

export default function TermsOfService() {
  const [pageTitle, setPageTitle] = useState('Terms of Service');
  const [introHtml, setIntroHtml] = useState('');
  const [sections, setSections] = useState<TermSection[]>(DEFAULT_SECTIONS);
  const [sidebarHeading, setSidebarHeading] = useState('Need to get in touch?');
  const [sidebarDescription, setSidebarDescription] = useState("We're here to help with any questions about our terms of service.");
  const [isLoading, setIsLoading] = useState(true);
  const [showScroll, setShowScroll] = useState(false);

  useEffect(() => {
    loadPageContent();
  }, []);

  const loadPageContent = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PageContent[] }>(
        '/api/public/content/pages/terms-and-condition'
      );
      const content = response.data || [];

      const getContent = (key: string) => {
        const section = content.find((c) => c.section_key === key);
        return section?.content ?? '';
      };

      const title = getContent('page_title');
      if (title) setPageTitle(title);

      const intro = getContent('intro');
      if (intro) setIntroHtml(intro);

      const sectionsRaw = getContent('sections');
      if (sectionsRaw) {
        try {
          const parsed = JSON.parse(sectionsRaw) as TermSection[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSections(parsed);
          }
        } catch {
          // keep default
        }
      }

      const sh = getContent('sidebar_heading');
      if (sh) setSidebarHeading(sh);
      const sd = getContent('sidebar_description');
      if (sd) setSidebarDescription(sd);
    } catch (error) {
      console.error('Error loading terms content:', error);
      // Use defaults
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowScroll(window.scrollY > 200);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 my-8 min-h-[40vh] flex items-center justify-center">
        <LoadingTimeout loadingMessage="Loading terms of service..." />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 my-8">
      <h1 className="text-4xl font-bold mb-4">{pageTitle}</h1>
      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div>
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Applicability of Terms</h2>
              {introHtml ? (
                <div
                  className="mb-4 prose prose-sm max-w-none text-gray-700"
                  dangerouslySetInnerHTML={{ __html: introHtml }}
                />
              ) : (
                <p className="mb-4">
                  These Terms of Service govern your use of our beauty and salon services. By booking or using our services, you agree to these terms.
                </p>
              )}
            </div>
          </div>

          <section className="space-y-4">
            {sections.map((term, index) => (
              <div key={index}>
                <h3 className="text-xl font-semibold mt-6">
                  {index + 1}. {term.title}
                </h3>
                <p className="text-gray-700 whitespace-pre-line">{term.content}</p>
              </div>
            ))}
          </section>
        </div>
        <div className="space-y-6">
          <div>
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">{sidebarHeading}</h2>
              <p className="mb-4">{sidebarDescription}</p>
              <Link href="/contact">
                <Button className="w-full">Contact Us</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {showScroll && (
        <Button
          onClick={scrollToTop}
          variant="default"
          className="fixed bottom-8 right-8 transition duration-300"
        >
          <MoveUp className="h-5" />
          Back to Top
        </Button>
      )}
    </div>
  );
}
