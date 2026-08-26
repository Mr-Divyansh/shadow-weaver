"""
Production-grade async HTTP client with connection pooling, retries, circuit breaker.
Shared by all agents (orchestrator, blue, red, honeypot).
"""
import asyncio
import json
import logging
import time
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Optional
from aiohttp import ClientSession, ClientTimeout, TCPConnector, ClientError
from aiohttp.client_exceptions import ClientConnectorError, ServerDisconnectedError

logger = logging.getLogger("shadow.http")

@dataclass
class CircuitBreakerState:
    failures: int = 0
    last_failure: float = 0
    state: str = "closed"  # closed, open, half-open
    success_count: int = 0

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 30.0, half_open_max_calls: int = 3):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self._state = CircuitBreakerState()
        self._lock = asyncio.Lock()

    async def call(self, func, *args, **kwargs):
        async with self._lock:
            if self._state.state == "open":
                if time.time() - self._state.last_failure > self.recovery_timeout:
                    self._state.state = "half-open"
                    self._state.success_count = 0
                    logger.info("Circuit breaker half-open")
                else:
                    raise CircuitBreakerOpen("Circuit breaker open")
            if self._state.state == "half-open" and self._state.success_count >= self.half_open_max_calls:
                raise CircuitBreakerOpen("Half-open call limit reached")

        try:
            result = await func(*args, **kwargs)
        except Exception as e:
            await self._record_failure()
            raise
        else:
            await self._record_success()
            return result

    async def _record_failure(self):
        async with self._lock:
            self._state.failures += 1
            self._state.last_failure = time.time()
            if self._state.state == "half-open":
                self._state.state = "open"
                logger.warning("Circuit breaker opened after half-open failure")
            elif self._state.failures >= self.failure_threshold:
                self._state.state = "open"
                logger.warning(f"Circuit breaker opened after {self._state.failures} failures")

    async def _record_success(self):
        async with self._lock:
            if self._state.state == "half-open":
                self._state.success_count += 1
                if self._state.success_count >= self.half_open_max_calls:
                    self._state.state = "closed"
                    self._state.failures = 0
                    logger.info("Circuit breaker closed")
            else:
                self._state.failures = 0

class CircuitBreakerOpen(Exception):
    pass

class HttpClient:
    def __init__(
        self,
        base_url: str,
        max_connections: int = 100,
        max_keepalive: int = 20,
        timeout_total: float = 10.0,
        timeout_connect: float = 3.0,
        retry_attempts: int = 3,
        retry_backoff: float = 0.5,
        circuit_failure_threshold: int = 5,
        circuit_recovery_timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = ClientTimeout(total=timeout_total, connect=timeout_connect)
        self.connector = TCPConnector(
            limit=max_connections,
            limit_per_host=max_keepalive,
            keepalive_timeout=30,
            enable_cleanup_closed=True,
        )
        self.retry_attempts = retry_attempts
        self.retry_backoff = retry_backoff
        self.circuit = CircuitBreaker(circuit_failure_threshold, circuit_recovery_timeout)
        self._session: Optional[ClientSession] = None
        self._closed = False

    async def __aenter__(self):
        self._session = ClientSession(
            connector=self.connector,
            timeout=self.timeout,
            headers={"User-Agent": "Shadow-Weaver/2.0"},
        )
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()

    async def close(self):
        if self._session and not self._closed:
            await self._session.close()
            self._closed = True

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    async def _request_with_retry(self, method: str, path: str, **kwargs) -> Any:
        last_exc = None
        for attempt in range(self.retry_attempts):
            try:
                return await self.circuit.call(self._do_request, method, path, **kwargs)
            except CircuitBreakerOpen:
                raise
            except (ClientConnectorError, ServerDisconnectedError, asyncio.TimeoutError) as e:
                last_exc = e
                if attempt < self.retry_attempts - 1:
                    await asyncio.sleep(self.retry_backoff * (2 ** attempt))
                    continue
                raise
            except ClientError as e:
                # Base ClientError has no .status (only ClientResponseError
                # does) — use getattr so a plain HTTP-error never crashes the
                # retry loop with an AttributeError.
                status = getattr(e, "status", None)
                if status is not None and status >= 500 and attempt < self.retry_attempts - 1:
                    await asyncio.sleep(self.retry_backoff * (2 ** attempt))
                    continue
                raise
        raise last_exc

    async def _do_request(self, method: str, path: str, **kwargs):
        assert self._session is not None
        async with self._session.request(method, self._url(path), **kwargs) as resp:
            if resp.content_type == "application/json":
                return await resp.json()
            text = await resp.text()
            if resp.status >= 400:
                raise ClientError(f"HTTP {resp.status}: {text}")
            return text

    async def get(self, path: str, params: dict = None) -> Any:
        return await self._request_with_retry("GET", path, params=params)

    async def post(self, path: str, json_data: dict = None, data: Any = None) -> Any:
        return await self._request_with_retry("POST", path, json=json_data, data=data)

    async def put(self, path: str, json_data: dict = None) -> Any:
        return await self._request_with_retry("PUT", path, json=json_data)

    async def delete(self, path: str) -> Any:
        return await self._request_with_retry("DELETE", path)

@asynccontextmanager
async def create_http_client(base_url: str, **kwargs):
    client = HttpClient(base_url, **kwargs)
    try:
        await client.__aenter__()
        yield client
    finally:
        await client.close()