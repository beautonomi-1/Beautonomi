-- Resolve function name collision between reviews and provider_client_ratings triggers.
-- Previous migrations defined update_customer_rating() twice with different logic.

-- 1) Reviews table trigger logic (customer_rating on reviews)
CREATE OR REPLACE FUNCTION update_customer_rating_from_reviews()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_rating NUMERIC(3, 2);
    v_review_count INTEGER;
    v_customer_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_customer_id := OLD.customer_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.customer_rating IS NOT NULL THEN
            v_customer_id := OLD.customer_id;
        END IF;
        IF NEW.customer_rating IS NOT NULL THEN
            v_customer_id := NEW.customer_id;
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.customer_rating IS NOT NULL THEN
            v_customer_id := NEW.customer_id;
        END IF;
    END IF;

    IF v_customer_id IS NOT NULL THEN
        SELECT
            COALESCE(AVG(customer_rating), 0),
            COUNT(*)
        INTO v_avg_rating, v_review_count
        FROM reviews
        WHERE customer_id = v_customer_id
          AND customer_rating IS NOT NULL;

        UPDATE users
        SET
            rating_average = v_avg_rating,
            review_count = v_review_count
        WHERE id = v_customer_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Provider-to-client ratings trigger logic
CREATE OR REPLACE FUNCTION update_customer_rating_from_provider_client_ratings()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_rating NUMERIC(3, 2);
    v_review_count INTEGER;
    v_customer_id UUID;
BEGIN
    v_customer_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.customer_id ELSE NEW.customer_id END;

    IF v_customer_id IS NOT NULL THEN
        SELECT
            COALESCE(AVG(rating), 0),
            COUNT(*)
        INTO v_avg_rating, v_review_count
        FROM provider_client_ratings
        WHERE customer_id = v_customer_id
          AND is_visible = true;

        UPDATE users
        SET
            rating_average = v_avg_rating,
            review_count = v_review_count
        WHERE id = v_customer_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Rebind triggers explicitly
-- Drop legacy trigger variants first (some environments use different names).
DROP TRIGGER IF EXISTS on_customer_rating_created ON reviews;
DROP TRIGGER IF EXISTS on_customer_rating_deleted ON reviews;
DROP TRIGGER IF EXISTS on_customer_rating_deleted_or_hidden ON reviews;
DROP TRIGGER IF EXISTS on_customer_rating_changed ON reviews;
CREATE TRIGGER on_customer_rating_changed
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_rating_from_reviews();

DROP TRIGGER IF EXISTS on_provider_client_rating_created ON provider_client_ratings;
CREATE TRIGGER on_provider_client_rating_created
    AFTER INSERT OR UPDATE ON provider_client_ratings
    FOR EACH ROW
    WHEN (NEW.is_visible = true)
    EXECUTE FUNCTION update_customer_rating_from_provider_client_ratings();

DROP TRIGGER IF EXISTS on_provider_client_rating_deleted_or_hidden ON provider_client_ratings;
CREATE TRIGGER on_provider_client_rating_deleted_or_hidden
    AFTER DELETE OR UPDATE ON provider_client_ratings
    FOR EACH ROW
    WHEN (OLD.is_visible = true)
    EXECUTE FUNCTION update_customer_rating_from_provider_client_ratings();

-- 4) Remove ambiguous shared function name if present.
DROP FUNCTION IF EXISTS update_customer_rating();
