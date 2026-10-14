-- Make account_id nullable in shop_memberships
-- Staff members who don't log into the app (e.g. cleaners, helpers tracked by supervisor)
-- do not need an Account record. accountId was previously required which forced
-- creating staff with the supervisor's account as fallback — now it is optional.

ALTER TABLE shop_memberships ALTER COLUMN account_id DROP NOT NULL;
