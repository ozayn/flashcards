FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway uses PORT env var (8080 for private networking)
ENV PORT=8080
EXPOSE 8080

# Bind to :: (IPv6) - Railway private network is IPv6-only. 0.0.0.0 blocks private networking.
CMD uvicorn app.main:app --host :: --port ${PORT}
