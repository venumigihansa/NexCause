from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8080
    database_url: str
    rca_mcp_server_url: str = (
        "http://rca-mcp-server.deployment-manager.svc.cluster.local/mcp"
    )
    rca_agent_poll_enabled: bool = True
    rca_agent_poll_interval_seconds: int = 10
    rca_max_followup_rounds: int = 2
    rca_max_verifier_retries: int = 1
    rca_llm_provider: str = "gemini"
    rca_llm_model: str = "gemini-1.5-flash"
    rca_llm_timeout_seconds: float = 30.0
    rca_llm_api_key: str | None = None
    langgraph_checkpoint_db_url: str | None = None
    internal_service_jwt_secret: str
    database_pool_min_size: int = 1
    database_pool_max_size: int = 5
    database_pool_timeout_seconds: float = 5.0
    database_query_timeout_ms: int = 10_000


settings = Settings()
