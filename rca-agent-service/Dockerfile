FROM python:3.11-slim

ARG VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="RCA Platform Agent" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOME=/tmp

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

RUN addgroup --system rca && adduser --system --ingroup rca rca \
    && chown -R rca:rca /app

USER rca
EXPOSE 8080
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
