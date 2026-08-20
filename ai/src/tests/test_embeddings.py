import os
import unittest
from unittest.mock import AsyncMock, patch

from helper.kb import embeddings


class FakeResponse:
    def __init__(self, status_code, data=None, text=""):
        self.status_code = status_code
        self._data = data or {}
        self.text = text

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            request = embeddings.httpx.Request("POST", "https://example.test/embeddings")
            response = embeddings.httpx.Response(self.status_code, request=request, text=self.text)
            raise embeddings.httpx.HTTPStatusError(
                self.text or "request failed",
                request=request,
                response=response,
            )


class FakeClient:
    def __init__(self, handler):
        self.handler = handler
        self.calls = []

    async def post(self, url, json, headers):
        self.calls.append(json["input"])
        return self.handler(json["input"])


class EmbedderTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        embeddings.Embedder._client = None
        embeddings.Embedder._dim = None

    def tearDown(self):
        embeddings.Embedder._client = None
        embeddings.Embedder._dim = None

    def test_truncate_text_uses_token_limit(self):
        with patch.dict(os.environ, {"EMBEDDING_MAX_TOKENS": "20"}):
            text = embeddings._truncate_text("测试 token limit " * 100)
            tokens = embeddings._token_encoder().encode(text)

        self.assertLessEqual(len(tokens), 20)

    async def test_bad_request_batch_is_split_and_order_is_preserved(self):
        def handler(texts):
            if len(texts) > 1:
                return FakeResponse(400, text="batch too large")
            return FakeResponse(200, {"data": [{"index": 0, "embedding": [texts[0]]}]})

        client = FakeClient(handler)
        embedder = embeddings.Embedder()
        embeddings.Embedder._client = client

        with patch.object(embeddings, "_resolve", AsyncMock(return_value=("https://example.test", "key"))):
            result = await embedder._post_batch(["a", "b", "c"])

        self.assertEqual(result, [["a"], ["b"], ["c"]])
        self.assertEqual(client.calls[0], ["a", "b", "c"])
        self.assertIn(["a"], client.calls)
        self.assertIn(["b"], client.calls)
        self.assertIn(["c"], client.calls)

    async def test_single_bad_request_is_retried(self):
        attempts = 0

        def handler(texts):
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                return FakeResponse(400, text="transient rejection")
            return FakeResponse(200, {"data": [{"index": 0, "embedding": [1.0]}]})

        embedder = embeddings.Embedder()
        embeddings.Embedder._client = FakeClient(handler)

        with (
            patch.object(embeddings, "_resolve", AsyncMock(return_value=("https://example.test", "key"))),
            patch.object(embeddings.asyncio, "sleep", AsyncMock()),
        ):
            result = await embedder._post_batch(["one"])

        self.assertEqual(result, [[1.0]])
        self.assertEqual(attempts, 3)

    async def test_persistent_single_bad_request_raises(self):
        embedder = embeddings.Embedder()
        embeddings.Embedder._client = FakeClient(
            lambda texts: FakeResponse(400, text="persistent rejection")
        )

        with (
            patch.object(embeddings, "_resolve", AsyncMock(return_value=("https://example.test", "key"))),
            patch.object(embeddings.asyncio, "sleep", AsyncMock()),
        ):
            with self.assertRaisesRegex(RuntimeError, "persistent rejection"):
                await embedder._post_batch(["one"])
