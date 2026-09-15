-- 896: Wallet currency at signup + zero-balance currency realignment on credit
--
-- Fixes hardcoded ZAR wallet creation blocking non-ZAR tenant refunds/credits.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_wallet_currency TEXT;
BEGIN
    INSERT INTO public.users (id, email, full_name, phone, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            (NEW.raw_user_meta_data->>'first_name' || ' ' || NEW.raw_user_meta_data->>'last_name'),
            NEW.raw_user_meta_data->>'display_name',
            NEW.raw_user_meta_data->>'preferred_username'
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'phone',
            NEW.raw_user_meta_data->>'phone_number'
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture',
            NEW.raw_user_meta_data->>'photo',
            NEW.raw_user_meta_data->>'image'
        ),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(
            EXCLUDED.full_name,
            users.full_name,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                (NEW.raw_user_meta_data->>'first_name' || ' ' || NEW.raw_user_meta_data->>'last_name'),
                NEW.raw_user_meta_data->>'display_name',
                NEW.raw_user_meta_data->>'preferred_username'
            )
        ),
        phone = COALESCE(
            EXCLUDED.phone,
            users.phone,
            COALESCE(
                NEW.raw_user_meta_data->>'phone',
                NEW.raw_user_meta_data->>'phone_number'
            )
        ),
        avatar_url = COALESCE(
            EXCLUDED.avatar_url,
            users.avatar_url,
            COALESCE(
                NEW.raw_user_meta_data->>'avatar_url',
                NEW.raw_user_meta_data->>'picture',
                NEW.raw_user_meta_data->>'photo',
                NEW.raw_user_meta_data->>'image'
            )
        );

    v_wallet_currency := upper(trim(COALESCE(NEW.raw_user_meta_data->>'currency', '')));
    IF v_wallet_currency = '' OR length(v_wallet_currency) <> 3 THEN
      v_wallet_currency := 'ZAR';
    END IF;

    INSERT INTO public.user_wallets (user_id, currency)
    VALUES (NEW.id, v_wallet_currency)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.wallet_credit_admin(
  p_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'ZAR',
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (p_user_id, COALESCE(p_currency, 'ZAR'))
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_currency IS NOT NULL AND v_currency <> p_currency THEN
    IF COALESCE(v_balance, 0) <= 0 THEN
      UPDATE user_wallets
         SET currency = p_currency,
             updated_at = NOW()
       WHERE id = v_wallet_id;
      v_currency := p_currency;
      v_balance := 0;
    ELSE
      RAISE EXCEPTION 'Currency mismatch (wallet: %, credit: %)', v_currency, p_currency;
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM wallet_transactions WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN jsonb_build_object(
        'wallet_id', v_wallet_id,
        'balance', v_balance,
        'currency', v_currency,
        'idempotent', true
      );
    END IF;
  END IF;

  UPDATE user_wallets SET balance = balance + p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (
    wallet_id, type, amount, description, reference_id, reference_type, tenant_id, idempotency_key
  )
  VALUES (
    v_wallet_id,
    'credit',
    p_amount,
    p_description,
    p_reference_id,
    p_reference_type,
    COALESCE(p_tenant_id, public.tenant_default_za_id()),
    p_idempotency_key
  );

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance + p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
