# API Key Protection Test

`/protected-ping` requires the `X-Admin-Api-Key` header. Set `ADMIN_API_KEY` in `apps/api/.env`.

**If you get "Admin API key not configured" (500):** Restart the backend so it picks up `.env`.

## curl

```bash
# No header → 401
curl -i http://localhost:8080/protected-ping

# Wrong header → 401
curl -i -H "X-Admin-Api-Key: wrong" http://localhost:8080/protected-ping

# Correct header → 200
curl -i -H "X-Admin-Api-Key: test-key" http://localhost:8080/protected-ping
```

## Postman

1. **No header**: Send GET to `http://localhost:8080/protected-ping` → 401
2. **Wrong header**: Add header `X-Admin-Api-Key` = `wrong` → 401
3. **Correct header**: Add header `X-Admin-Api-Key` = `test-key` (or your `ADMIN_API_KEY`) → 200
