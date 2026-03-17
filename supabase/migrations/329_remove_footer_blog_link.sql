-- Remove Blog (/news) link from footer. The /news page has been removed.
DELETE FROM footer_links
WHERE section = 'about' AND title = 'Blog' AND href = '/news';
