-- Append under-18 sexual content sentence to CMS EULA `sections` JSON when present.

DO $$
DECLARE
  rec record;
  sections jsonb;
  i int;
  elem jsonb;
  sentence_html text :=
    '<p>Sexual content involving anyone under 18 is prohibited and will be removed and reported to authorities as required by law.</p>';
  marker text := 'anyone under 18';
  new_sections jsonb;
  changed boolean;
  new_content text;
BEGIN
  FOR rec IN
    SELECT id, content
    FROM public.page_content
    WHERE page_slug IN ('customer-eula', 'provider-eula')
      AND section_key = 'sections'
      AND tenant_id IS NULL
      AND content IS NOT NULL
      AND content NOT ILIKE '%' || marker || '%'
  LOOP
    BEGIN
      sections := rec.content::jsonb;
    EXCEPTION
      WHEN OTHERS THEN
        CONTINUE;
    END;

    IF jsonb_typeof(sections) <> 'array' OR jsonb_array_length(sections) = 0 THEN
      CONTINUE;
    END IF;

    new_sections := '[]'::jsonb;
    changed := false;

    FOR i IN 0 .. jsonb_array_length(sections) - 1 LOOP
      elem := sections -> i;
      IF NOT changed
        AND elem ->> 'content' IS NOT NULL
        AND elem ->> 'content' NOT ILIKE '%' || marker || '%'
        AND (
          elem ->> 'title' ILIKE '%community%'
          OR elem ->> 'content' ILIKE '%Zero tolerance%'
        )
      THEN
        new_content := (elem ->> 'content') || sentence_html;
        elem := jsonb_set(elem, '{content}', to_jsonb(new_content));
        changed := true;
      END IF;
      new_sections := new_sections || jsonb_build_array(elem);
    END LOOP;

    IF changed THEN
      UPDATE public.page_content
      SET content = new_sections::text,
          updated_at = NOW()
      WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;
